import { google, drive_v3 } from 'googleapis'
import { prisma } from '@/lib/db'

// Heuristic for "is this Google Doc a meeting-notes doc worth pulling into the
// knowledge pipeline". Pure/no I/O so it's cheap to apply after a broad Drive
// `files.list` query narrows the candidate set (see syncMeetingNotes below).
//
// Positive signal: the name mentions "meeting" AND either explicitly says
// "notes" (incl. "notes by gemini") OR looks like a dated WCB monthly/holiday
// meeting doc (e.g. "WCB Monthly Meeting - 2026/07/16 ...", "WCB Holiday
// Meeting 2025 ...") even without the word "notes" in it.
//
// Negative override: internal process docs (TEMPLATE/WORKFLOW prefixed or
// containing those markers anywhere in the name) are excluded even if they'd
// otherwise match — e.g. "TEMPLATE - Meeting Notes by Gemini" is a blank
// template, not an actual note.
export function isMeetingNotesDoc(name: string): boolean {
  const n = name.trim().toLowerCase()
  if (!n) return false

  if (n.includes('template') || n.includes('workflow')) return false

  if (!n.includes('meeting')) return false

  if (n.includes('notes')) return true

  // "looks like a WCB monthly/holiday meeting" doc even without the literal
  // word "notes" — e.g. a dated "WCB Monthly Meeting - 2026/07/16 ..." title.
  const looksLikeWcbMeeting = /\bwcb\b.*\bmeeting\b/.test(n)
  const looksDated = /\d{4}/.test(n)
  if (looksLikeWcbMeeting && looksDated) return true

  return false
}

type DriveClient = Pick<drive_v3.Drive, 'files'>

type SyncDeps = {
  db?: typeof prisma
  drive?: DriveClient
}

function driveClient(): DriveClient {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth })
}

// Broad name-contains filters to keep the Drive-side query cheap; the precise
// isMeetingNotesDoc heuristic above does the real filtering once names are in
// hand. Multiple candidate substrings are OR'd together since Drive's `name
// contains` is a single substring match.
const NAME_CANDIDATES = ['Meeting', 'Notes']

function buildDriveQuery(): string {
  const nameClauses = NAME_CANDIDATES.map((s) => `name contains '${s}'`).join(' or ')
  return `mimeType='application/vnd.google-apps.document' and trashed=false and (${nameClauses})`
}

export async function syncMeetingNotes(deps: SyncDeps = {}): Promise<{ scanned: number; created: number }> {
  const db = deps.db ?? prisma
  const drive = deps.drive ?? driveClient()

  let scanned = 0
  let created = 0

  let pageToken: string | undefined
  do {
    const res = await drive.files.list({
      q: buildDriveQuery(),
      fields: 'nextPageToken, files(id, name)',
      pageToken,
      pageSize: 100,
    })

    const files = res.data.files ?? []
    for (const file of files) {
      if (!file.id || !file.name) continue
      if (!isMeetingNotesDoc(file.name)) continue

      scanned++

      // CRITICAL: never overwrite an existing draft, regardless of its
      // status — a doc already needs_processing/in_review/published/
      // rejected/error must be skipped, not re-pulled or reset.
      const existing = await db.draftArticle.findUnique({
        where: { sourceDriveId: file.id },
        select: { id: true },
      })
      if (existing) continue

      const exportRes = await drive.files.export(
        { fileId: file.id, mimeType: 'text/plain' },
        { responseType: 'text' },
      )
      const rawText = String(exportRes.data ?? '')

      await db.draftArticle.create({
        data: {
          sourceDriveId: file.id,
          sourceName: file.name,
          category: 'meeting-notes',
          status: 'needs_processing',
          rawText,
        },
      })
      created++
    }

    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

  return { scanned, created }
}
