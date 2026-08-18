'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { draftToArticle } from '@/lib/knowledge/publish'
import { sanitizeArticleHtml } from '@/lib/knowledge/extract-notes'

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
): Promise<Result> {
  const actor = await requireBoard()
  if (!actor) return { ok: false, reason: 'Not authorized.' }

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
  )

  await prisma.$transaction([
    prisma.article.create({ data: fields }),
    prisma.draftArticle.update({ where: { id: draftId }, data: { status: 'published' } }),
  ])

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
