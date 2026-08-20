'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { draftToArticle, uniqueSlug } from '@/lib/knowledge/publish'
import { sanitizeArticleHtml } from '@/lib/knowledge/extract-notes'
import { isValidCategory } from '@/lib/knowledge/categories'
import { buildPastedDraftData } from '@/lib/knowledge/ingest-transcript'
import { processPendingDrafts } from '@/lib/knowledge/process-drafts'

type Actor = { memberId?: string; email: string }

// Mirrors src/app/members/admin/_actions/admin-actions.ts requireBoard(): null
// actor means "not board" -> the core rejects. Board-gated mutations here
// (publish/reject/reprocess) are security-critical — never skip this gate.
export async function requireBoard(): Promise<Actor | null> {
  const s = await auth()
  if (!s?.user?.isBoard || !s.user.email) return null
  return { memberId: s.user.memberId, email: s.user.email }
}

function revalidateKnowledge() {
  revalidatePath('/members/admin/knowledge')
  revalidatePath('/members/resources')
}

type Result = { ok: boolean; reason?: string }

export async function publishDraftAction(
  draftId: string,
  editedHtml?: string,
  editedTitle?: string,
  category?: string,
): Promise<Result> {
  const actor = await requireBoard()
  if (!actor) return { ok: false, reason: 'Not authorized.' }

  if (!category || !isValidCategory(category)) {
    return { ok: false, reason: 'Pick a category before publishing.' }
  }

  const draft = await prisma.draftArticle.findUnique({ where: { id: draftId } })
  if (!draft) return { ok: false, reason: 'Draft not found.' }

  // Re-sanitize officer-edited HTML before it is stored/rendered to members —
  // the AI-extraction output is already sanitized, but a manual edit is not.
  const processedHtml = editedHtml !== undefined ? sanitizeArticleHtml(editedHtml) : draft.processedHtml
  const processedTitle = editedTitle ?? draft.processedTitle
  if (!processedHtml || !processedTitle) {
    return { ok: false, reason: 'Draft has no processed content to publish.' }
  }

  const fields = draftToArticle(
    { processedTitle, processedHtml, excerpt: draft.excerpt, meetingDate: draft.meetingDate },
    actor.email,
    new Date(),
    category,
  )

  // Make the slug collision-safe: two same-titled notes (e.g. a date-less
  // "WCB Monthly Meeting") would otherwise hit the @unique constraint and throw.
  const existing = await prisma.article.findMany({ select: { slug: true } })
  fields.slug = uniqueSlug(fields.slug, existing.map((a) => a.slug))

  await prisma.$transaction([
    prisma.article.create({ data: fields }),
    prisma.draftArticle.update({ where: { id: draftId }, data: { status: 'published' } }),
  ])

  revalidateKnowledge()
  return { ok: true }
}

// Ingest a raw transcript pasted by a board member: create a needs_processing
// draft (same shape as the Drive sync produces), then run the AI extractor now
// so it lands straight in the review queue rather than waiting for the daily
// cron. Processing failures don't fail the ingest — the draft just shows as
// 'error' in the queue with a Reprocess button (same as Drive-sourced drafts).
export async function ingestTranscriptAction(title: string, rawText: string): Promise<Result> {
  const actor = await requireBoard()
  if (!actor) return { ok: false, reason: 'Not authorized.' }

  const built = buildPastedDraftData(title, rawText, crypto.randomUUID())
  if (!built.ok) return built

  await prisma.draftArticle.create({ data: built.data })

  // Best-effort immediate processing; if it throws, the draft remains in the
  // queue (needs_processing/error) and the cron/Reprocess will pick it up.
  try {
    await processPendingDrafts()
  } catch {
    // swallow — ingest succeeded; processing can be retried from the queue
  }

  revalidateKnowledge()
  return { ok: true }
}

export async function rejectDraftAction(draftId: string): Promise<Result> {
  const actor = await requireBoard()
  if (!actor) return { ok: false, reason: 'Not authorized.' }

  await prisma.draftArticle.update({ where: { id: draftId }, data: { status: 'rejected' } })
  revalidateKnowledge()
  return { ok: true }
}

// Rename a draft's title at ANY stage (needs_processing / error / in_review),
// not just at approval. Sets both processedTitle (the note's proposed title,
// which processing now preserves) and sourceName (the queue label) so the new
// title survives a re-process. Board-gated.
export async function renameDraftAction(draftId: string, title: string): Promise<Result> {
  const actor = await requireBoard()
  if (!actor) return { ok: false, reason: 'Not authorized.' }
  const name = title.trim()
  if (!name) return { ok: false, reason: 'Title is required.' }

  await prisma.draftArticle.update({
    where: { id: draftId },
    data: { processedTitle: name, sourceName: name },
  })
  revalidateKnowledge()
  return { ok: true }
}

export async function reprocessDraftAction(draftId: string): Promise<Result> {
  const actor = await requireBoard()
  if (!actor) return { ok: false, reason: 'Not authorized.' }

  await prisma.draftArticle.update({
    where: { id: draftId },
    data: { status: 'needs_processing', errorText: null },
  })
  revalidateKnowledge()
  return { ok: true }
}
