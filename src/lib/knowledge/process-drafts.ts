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
    status: 'in_review',
    processedAt: now,
    errorText: null,
  }
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
