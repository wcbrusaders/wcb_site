import { google, drive_v3 } from 'googleapis'
import { put } from '@vercel/blob'
import { renderPageAsImage } from 'unpdf'
import { prisma } from '@/lib/db'
import type { ArtifactCategory } from './categories'

// Whitelist of source mime types we're willing to pull into the artifacts
// pipeline. Google-native docs/slides are included even though their *stored*
// mime type ends up being the exported Office equivalent (see
// GOOGLE_NATIVE_EXPORT_MIME below) — isArtifactFile is checked against the
// Drive file's *source* mimeType before any export/download happens.
export const ARTIFACT_MIME_WHITELIST = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
  'application/vnd.google-apps.document', // Google Doc -> exported to docx
  'application/vnd.google-apps.presentation', // Google Slides -> exported to pptx
] as const

const ARTIFACT_MIME_SET: ReadonlySet<string> = new Set(ARTIFACT_MIME_WHITELIST)

export function isArtifactFile(mimeType: string): boolean {
  return ARTIFACT_MIME_SET.has(mimeType)
}

// Google-native source mime -> mime type to export to (Office equivalent) and
// store as the artifact's final mimeType.
const GOOGLE_NATIVE_EXPORT_MIME: Record<string, string> = {
  'application/vnd.google-apps.document':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.google-apps.presentation':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

// Known Drive source folders -> suggested artifact category. The officer
// confirms/changes the category at review time, so this is a convenience
// default, not a hard rule. Presentation/technique-nugget folder ids are
// resolved in Task 6 — add them here when known; unmapped folders fall
// through to `null` (no suggestion).
const FOLDER_TO_CATEGORY: Record<string, ArtifactCategory> = {
  '1_I7Po8n9d1gBCze9xphoB5cVTZrLtBhf': 'workshop-guide', // Workshop Guides
  '1b-7-hMPgU6gBNqnNmIxSNROgUILW1jwc': 'recipe', // Recipe Library
  // TODO: Add presentation and technique-nugget folder IDs here once known
}

// Folders to sync in the artifact cron job. Presentation and technique-nugget
// folder IDs are TBD and should be appended here (and to FOLDER_TO_CATEGORY)
// once known.
export const ARTIFACT_FOLDER_IDS = [
  '1_I7Po8n9d1gBCze9xphoB5cVTZrLtBhf', // Workshop Guides
  '1b-7-hMPgU6gBNqnNmIxSNROgUILW1jwc', // Recipe Library
]

export function folderToCategory(folderId: string): ArtifactCategory | null {
  return FOLDER_TO_CATEGORY[folderId] ?? null
}

// Blob storage path for a synced artifact. Namespaced by Drive file id so two
// files with the same name (from the same or different folders) never
// collide; the sanitized name is kept for human-readable URLs/debugging.
export function blobPathFor(driveId: string, name: string): string {
  const safeName = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'file'
  return `artifacts/${driveId}/${safeName}`
}

// PDFs and images get a real thumbnail (rendered or the file itself); docx/
// pptx fall back to a generic icon in the UI, so no thumbnail work is needed.
const THUMBNAIL_MIME_SET: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

export function needsThumbnail(mimeType: string): boolean {
  return THUMBNAIL_MIME_SET.has(mimeType)
}

const IMAGE_MIME_SET: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

type DriveClient = Pick<drive_v3.Drive, 'files'>

type PutFn = (
  path: string,
  body: Buffer,
  opts: { access: 'public'; token?: string; contentType?: string }
) => Promise<{ url: string }>

type ThumbnailFn = (pdfBytes: Buffer) => Promise<Buffer>

type SyncDeps = {
  db?: typeof prisma
  drive?: DriveClient
  put?: PutFn
  renderPdfThumbnail?: ThumbnailFn
}

function driveClient(): DriveClient {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth })
}

async function defaultPut(
  path: string,
  body: Buffer,
  opts: { access: 'public'; token?: string; contentType?: string }
): Promise<{ url: string }> {
  const blob = await put(path, body, {
    access: 'public',
    token: opts.token,
    contentType: opts.contentType,
  })
  return { url: blob.url }
}

async function defaultRenderPdfThumbnail(pdfBytes: Buffer): Promise<Buffer> {
  const imageBuffer = await renderPageAsImage(new Uint8Array(pdfBytes), 1, {
    canvasImport: () => import('@napi-rs/canvas'),
    scale: 1,
  })
  return Buffer.from(imageBuffer)
}

function buildDriveQuery(folderId: string): string {
  return `'${folderId}' in parents and trashed=false`
}

export async function syncArtifacts(
  folderIds: string[],
  deps: SyncDeps = {}
): Promise<{ scanned: number; created: number }> {
  const db = deps.db ?? prisma
  const drive = deps.drive ?? driveClient()
  const putFn = deps.put ?? defaultPut
  const renderPdfThumbnail = deps.renderPdfThumbnail ?? defaultRenderPdfThumbnail

  let scanned = 0
  let created = 0

  for (const folderId of folderIds) {
    let pageToken: string | undefined
    do {
      const res = await drive.files.list({
        q: buildDriveQuery(folderId),
        fields: 'nextPageToken, files(id, name, mimeType)',
        pageToken,
        pageSize: 100,
      })

      const files = res.data.files ?? []
      for (const file of files) {
        if (!file.id || !file.name || !file.mimeType) continue
        if (!isArtifactFile(file.mimeType)) continue

        scanned++

        // Idempotent: never re-copy a file we've already pulled in, whether
        // it's still an unreviewed draft or was already published.
        const [existingDraft, existingArtifact] = await Promise.all([
          db.artifactDraft.findUnique({
            where: { sourceDriveId: file.id },
            select: { id: true },
          }),
          db.artifact.findUnique({
            where: { sourceDriveId: file.id },
            select: { id: true },
          }),
        ])
        if (existingDraft || existingArtifact) continue

        const isGoogleNative = file.mimeType in GOOGLE_NATIVE_EXPORT_MIME
        const finalMimeType = isGoogleNative
          ? GOOGLE_NATIVE_EXPORT_MIME[file.mimeType]
          : file.mimeType

        let bytes: Buffer
        if (isGoogleNative) {
          const exportRes = await drive.files.export(
            { fileId: file.id, mimeType: finalMimeType },
            { responseType: 'arraybuffer' },
          )
          bytes = Buffer.from(exportRes.data as ArrayBuffer)
        } else {
          const getRes = await drive.files.get(
            { fileId: file.id, alt: 'media' },
            { responseType: 'arraybuffer' },
          )
          bytes = Buffer.from(getRes.data as ArrayBuffer)
        }

        const blobPath = blobPathFor(file.id, file.name)
        const { url: blobUrl } = await putFn(blobPath, bytes, {
          access: 'public',
          token: process.env.BLOB_READ_WRITE_TOKEN,
          contentType: finalMimeType,
        })

        let thumbnailUrl: string | null = null
        if (needsThumbnail(finalMimeType)) {
          try {
            if (IMAGE_MIME_SET.has(finalMimeType)) {
              // The file itself already is the thumbnail.
              thumbnailUrl = blobUrl
            } else {
              // PDF: render page 1 to a PNG and store it alongside the source.
              const thumbBuffer = await renderPdfThumbnail(bytes)
              const thumbPath = `artifacts/${file.id}/thumb.png`
              const { url } = await putFn(thumbPath, thumbBuffer, {
                access: 'public',
                token: process.env.BLOB_READ_WRITE_TOKEN,
                contentType: 'image/png',
              })
              thumbnailUrl = url
            }
          } catch {
            // Thumbnail generation is best-effort — a failure here must not
            // fail the whole file's sync.
            thumbnailUrl = null
          }
        }

        await db.artifactDraft.create({
          data: {
            sourceDriveId: file.id,
            sourceName: file.name,
            blobUrl,
            mimeType: finalMimeType,
            thumbnailUrl,
            sizeBytes: bytes.byteLength,
            suggestedCategory: folderToCategory(folderId) ?? null,
            status: 'needs_review',
          },
        })
        created++
      }

      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken)
  }

  return { scanned, created }
}
