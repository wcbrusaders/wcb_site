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

// Office/Google files that aren't already a PDF need to be rendered to one
// via Drive export so they can be viewed inline (read-only) in the browser.
// PDFs are already viewable as-is; images render inline directly.
const PDF_CONVERSION_MIME_SET: ReadonlySet<string> = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
  'application/vnd.google-apps.document', // Google Doc
  'application/vnd.google-apps.presentation', // Google Slides
])

export function needsPdfConversion(mimeType: string): boolean {
  return PDF_CONVERSION_MIME_SET.has(mimeType)
}

// Uploaded Office mime -> the Google-native mime type to copy it as, so it
// can be exported to PDF (Drive's files.export only works on Google-native
// files; a plain .docx/.pptx must first be copied into a native Doc/Slides
// file, exported, and the temp copy cleaned up).
const OFFICE_TO_GOOGLE_NATIVE_MIME: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'application/vnd.google-apps.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'application/vnd.google-apps.presentation',
}

const GOOGLE_NATIVE_MIME_SET: ReadonlySet<string> = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.presentation',
])

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

// Renders a Drive file as PDF bytes so it can be viewed inline (read-only) in
// the browser, or returns null if it can't be converted (caller falls back to
// download-only, original-format behavior). This makes live Drive calls and
// is intentionally NOT unit-tested — only the pure needsPdfConversion is.
export async function exportToPdf(
  drive: DriveClient,
  file: { id: string; mimeType: string },
): Promise<Buffer | null> {
  try {
    if (GOOGLE_NATIVE_MIME_SET.has(file.mimeType)) {
      // Already a Google-native file — export directly to PDF.
      const exportRes = await drive.files.export(
        { fileId: file.id, mimeType: 'application/pdf' },
        { responseType: 'arraybuffer' },
      )
      return Buffer.from(exportRes.data as ArrayBuffer)
    }

    const nativeMime = OFFICE_TO_GOOGLE_NATIVE_MIME[file.mimeType]
    if (!nativeMime) return null

    // Uploaded Office file: Drive can't export a non-native file directly.
    // Copy it into a temp Google-native file, export that to PDF, then
    // always clean up the temp copy.
    let copyId: string | undefined
    try {
      const copyRes = await drive.files.copy({
        fileId: file.id,
        requestBody: { mimeType: nativeMime },
      })
      copyId = copyRes.data.id ?? undefined
      if (!copyId) return null

      const exportRes = await drive.files.export(
        { fileId: copyId, mimeType: 'application/pdf' },
        { responseType: 'arraybuffer' },
      )
      return Buffer.from(exportRes.data as ArrayBuffer)
    } finally {
      if (copyId) {
        try {
          await drive.files.delete({ fileId: copyId })
        } catch {
          // Best-effort cleanup — an orphaned temp copy is a minor Drive
          // storage cost, not worth failing the sync over.
        }
      }
    }
  } catch {
    return null
  }
}

function buildDriveQuery(folderId: string): string {
  return `'${folderId}' in parents and trashed=false`
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'

// A subfolder's name can refine the inherited category as we descend, e.g. a
// "Technique Nuggets" subfolder under Workshop Guides switches its contents to
// the technique-nugget category. Unmatched subfolders inherit the parent's.
export function refineCategoryByFolderName(
  name: string,
  inherited: ArtifactCategory | null,
): ArtifactCategory | null {
  const n = name.toLowerCase()
  if (/technique\s*nugget/.test(n)) return 'technique-nugget'
  if (/presentation/.test(n)) return 'presentation'
  if (/workshop/.test(n)) return 'workshop-guide'
  if (/recipe/.test(n)) return 'recipe'
  return inherited
}

export async function syncArtifacts(
  folderIds: string[],
  deps: SyncDeps = {}
): Promise<{ scanned: number; created: number }> {
  const db = deps.db ?? prisma
  const drive = deps.drive ?? driveClient()
  const putFn = deps.put ?? defaultPut
  const renderPdfThumbnail = deps.renderPdfThumbnail ?? defaultRenderPdfThumbnail

  const counters = { scanned: 0, created: 0 }
  const seenFolders = new Set<string>() // guard against cycles / shortcuts

  // Recursively walk a folder, carrying a suggested category context that
  // subfolder names can refine as we descend.
  async function walk(folderId: string, category: ArtifactCategory | null): Promise<void> {
    if (seenFolders.has(folderId)) return
    seenFolders.add(folderId)

    let pageToken: string | undefined
    do {
      const res = await drive.files.list({
        q: buildDriveQuery(folderId),
        fields: 'nextPageToken, files(id, name, mimeType)',
        pageToken,
        pageSize: 100,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      })

      const files = res.data.files ?? []
      for (const file of files) {
        if (!file.id || !file.name || !file.mimeType) continue

        // Descend into subfolders (category may be refined by the subfolder name).
        if (file.mimeType === FOLDER_MIME) {
          await walk(file.id, refineCategoryByFolderName(file.name, category))
          continue
        }

        if (!isArtifactFile(file.mimeType)) continue

        counters.scanned++

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

        // Determine inline-viewability: PDFs and images render as-is;
        // Office/Google docs need to be rendered to a PDF via Drive export
        // before they can be viewed inline (download-only otherwise).
        let renderedPdfUrl: string | null = null
        let viewable = false
        let pdfBytesForThumbAndText: Buffer | null = null

        if (finalMimeType === 'application/pdf') {
          viewable = true
          renderedPdfUrl = blobUrl
          pdfBytesForThumbAndText = bytes
        } else if (IMAGE_MIME_SET.has(finalMimeType)) {
          // Images render inline directly — no PDF rendition needed.
          viewable = true
        } else if (needsPdfConversion(file.mimeType) || needsPdfConversion(finalMimeType)) {
          const pdf = await exportToPdf(drive, { id: file.id, mimeType: file.mimeType })
          if (pdf) {
            const renderedPath = `artifacts/${file.id}/rendered.pdf`
            const { url } = await putFn(renderedPath, pdf, {
              access: 'public',
              token: process.env.BLOB_READ_WRITE_TOKEN,
              contentType: 'application/pdf',
            })
            renderedPdfUrl = url
            viewable = true
            pdfBytesForThumbAndText = pdf
          } else {
            // Conversion failed — fall back to download-only original.
            renderedPdfUrl = null
            viewable = false
          }
        }

        let thumbnailUrl: string | null = null
        if (IMAGE_MIME_SET.has(finalMimeType)) {
          // The file itself already is the thumbnail.
          thumbnailUrl = blobUrl
        } else if (pdfBytesForThumbAndText) {
          try {
            // PDF (native or converted from Office/Google): render page 1 to
            // a PNG and store it alongside the source.
            const thumbBuffer = await renderPdfThumbnail(pdfBytesForThumbAndText)
            const thumbPath = `artifacts/${file.id}/thumb.png`
            const { url } = await putFn(thumbPath, thumbBuffer, {
              access: 'public',
              token: process.env.BLOB_READ_WRITE_TOKEN,
              contentType: 'image/png',
            })
            thumbnailUrl = url
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
            suggestedCategory: category ?? null,
            status: 'needs_review',
            renderedPdfUrl,
            viewable,
          },
        })
        counters.created++
      }

      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken)
  }

  for (const rootId of folderIds) {
    await walk(rootId, folderToCategory(rootId))
  }

  return { scanned: counters.scanned, created: counters.created }
}
