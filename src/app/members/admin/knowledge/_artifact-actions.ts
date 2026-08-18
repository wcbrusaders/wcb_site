'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { draftToArtifact } from '@/lib/artifacts/publish'
import { isValidArtifactCategory, isValidAudience } from '@/lib/artifacts/categories'

type Actor = { memberId?: string; email: string }

// Mirrors ./_actions.ts requireBoard(): null actor means "not board" -> the
// core rejects. Board-gated mutations here (publish/reject/reprocess) are
// security-critical — never skip this gate.
async function requireBoard(): Promise<Actor | null> {
  const s = await auth()
  if (!s?.user?.isBoard || !s.user.email) return null
  return { memberId: s.user.memberId, email: s.user.email }
}

function revalidateArtifacts() {
  revalidatePath('/members/admin/knowledge')
  revalidatePath('/members/resources')
}

type Result = { ok: boolean; reason?: string }

export async function publishArtifactAction(
  draftId: string,
  input: { title: string; description?: string; category: string; audience: string },
): Promise<Result> {
  const actor = await requireBoard()
  if (!actor) return { ok: false, reason: 'Not authorized.' }

  // Both category and audience are required with no defaults — reject before
  // any DB write if either is missing/invalid.
  if (!isValidArtifactCategory(input.category)) {
    return { ok: false, reason: 'Pick a category.' }
  }
  if (!isValidAudience(input.audience)) {
    return { ok: false, reason: 'Pick an audience.' }
  }

  const draft = await prisma.artifactDraft.findUnique({ where: { id: draftId } })
  if (!draft) return { ok: false, reason: 'Draft not found.' }

  const fields = draftToArtifact(draft, {
    title: input.title,
    description: input.description,
    category: input.category,
    audience: input.audience,
    officerEmail: actor.email,
    now: new Date(),
  })

  await prisma.$transaction([
    prisma.artifact.create({ data: fields }),
    prisma.artifactDraft.update({ where: { id: draftId }, data: { status: 'published' } }),
  ])

  revalidateArtifacts()
  return { ok: true }
}

export async function rejectArtifactAction(draftId: string): Promise<Result> {
  const actor = await requireBoard()
  if (!actor) return { ok: false, reason: 'Not authorized.' }

  await prisma.artifactDraft.update({ where: { id: draftId }, data: { status: 'rejected' } })
  revalidateArtifacts()
  return { ok: true }
}

export async function reprocessArtifactAction(draftId: string): Promise<Result> {
  const actor = await requireBoard()
  if (!actor) return { ok: false, reason: 'Not authorized.' }

  await prisma.artifactDraft.update({
    where: { id: draftId },
    data: { status: 'needs_review', errorText: null },
  })
  revalidateArtifacts()
  return { ok: true }
}
