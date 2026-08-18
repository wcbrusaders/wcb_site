import { prisma } from '@/lib/db'
import { extractMeetingNote, type ExtractedMeetingNote } from './extract-notes'

// Pure mapping from a successful extraction to the DraftArticle fields that
// move a draft from needs_processing into the officer review queue. Kept
// separate from the loop below so the mapping itself is trivially unit
// testable without any db/extract fakes.
export function draftToReviewFields(extract: ExtractedMeetingNote, now: Date) {
  return {
    processedTitle: extract.title,
    processedHtml: extract.bodyHtml,
    excerpt: extract.excerpt,
    meetingDate: parseMeetingDate(extract.title),
    status: 'in_review',
    processedAt: now,
    errorText: null,
  }
}

// The AI puts the meeting date in the title (e.g. "WCB Monthly Meeting — July
// 16, 2026", "WCB Kombucha Making Workshop — 6/19/2025"). Parse it so notes can
// be ordered by meeting date. Returns null if no date is found (page falls back
// to publishedAt ordering). Uses UTC noon to avoid any tz date-shift.
export function parseMeetingDate(title: string): Date | null {
  const MONTHS: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  }
  // "Month D, YYYY"
  const long = title.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/)
  if (long) {
    const mo = MONTHS[long[1].toLowerCase()]
    if (mo !== undefined) {
      const d = new Date(Date.UTC(+long[3], mo, +long[2], 12))
      if (!isNaN(d.getTime())) return d
    }
  }
  // "M/D/YYYY" or "M-D-YYYY"
  const numeric = title.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (numeric) {
    const d = new Date(Date.UTC(+numeric[3], +numeric[1] - 1, +numeric[2], 12))
    if (!isNaN(d.getTime())) return d
  }
  return null
}

type ExtractFn = (rawText: string) => Promise<ExtractedMeetingNote>

type ProcessDeps = {
  db?: typeof prisma
  extract?: ExtractFn
  now?: () => Date
}

export async function processPendingDrafts(
  deps: ProcessDeps = {},
): Promise<{ processed: number; errored: number }> {
  const db = deps.db ?? prisma
  const extract = deps.extract ?? extractMeetingNote
  const now = deps.now ?? (() => new Date())

  let processed = 0
  let errored = 0

  const drafts = await db.draftArticle.findMany({ where: { status: 'needs_processing' } })

  for (const draft of drafts) {
    try {
      const extracted = await extract(draft.rawText)

      // GUARD: an extraction that comes back empty (or whitespace-only) must
      // never slip into the review queue — treat it as a failure so an
      // officer never sees a blank "note" waiting to be published.
      if (!extracted.bodyHtml || !extracted.bodyHtml.trim()) {
        throw new Error('empty extraction')
      }

      await db.draftArticle.update({
        where: { id: draft.id },
        data: draftToReviewFields(extracted, now()),
      })
      processed++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await db.draftArticle.update({
        where: { id: draft.id },
        data: {
          status: 'error',
          errorText: message,
          processedAt: now(),
        },
      })
      errored++
    }
  }

  return { processed, errored }
}
