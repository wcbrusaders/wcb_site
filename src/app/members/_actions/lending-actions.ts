'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import {
  checkoutTitle, returnLoan, renewLoan, addTitle, addCopies, editTitle, archiveCopy,
  type NewTitleInput, type Condition,
} from '@/lib/lending'
import { notifyOfficersCheckout } from '@/lib/notify'

function revalidateBrowse() { revalidatePath('/members/library'); revalidatePath('/members/equipment') }

async function requireMember() {
  const session = await auth()
  const memberId = session?.user?.memberId
  if (!memberId) throw new Error('unauthorized')
  return { memberId, isBoard: !!session!.user!.isBoard, name: session!.user!.name ?? session!.user!.email ?? 'A member' }
}
async function requireBoard() {
  const m = await requireMember()
  if (!m.isBoard) throw new Error('forbidden')
  return m
}

export async function checkoutAction(itemId: string, itemTitle: string, category: string, cond?: { conditionOut?: Condition; noteOut?: string }) {
  const { memberId, name } = await requireMember()
  const r = await checkoutTitle(itemId, memberId, cond)
  if (r.ok) { await notifyOfficersCheckout({ memberName: name, title: itemTitle, category, dueAt: r.dueAt }); revalidateBrowse() }
  return r
}
export async function returnAction(loanId: string, cond?: { conditionIn?: Condition; noteIn?: string }) {
  const { memberId, isBoard } = await requireMember()
  const r = await returnLoan(loanId, memberId, isBoard, cond)
  if (r.ok) revalidateBrowse()
  return r
}
export async function renewAction(loanId: string) {
  const { memberId } = await requireMember()
  const r = await renewLoan(loanId, memberId)
  if (r.ok) revalidateBrowse()
  return r
}
export async function addTitleAction(input: NewTitleInput) {
  const { memberId } = await requireBoard()
  const r = await addTitle(input, memberId)
  revalidateBrowse()
  return { ok: true as const, id: r.id }
}
export async function addCopiesAction(itemId: string, count: number, initialCondition?: Condition) {
  await requireBoard()
  const r = await addCopies(itemId, count, initialCondition)
  revalidateBrowse()
  return { ok: true as const, added: r.added }
}
export async function editTitleAction(id: string, patch: Partial<Omit<NewTitleInput, 'category' | 'copies' | 'initialCondition'>>) {
  await requireBoard()
  await editTitle(id, patch)
  revalidateBrowse()
  return { ok: true as const }
}
export async function archiveCopyAction(copyId: string) {
  await requireBoard()
  const r = await archiveCopy(copyId)
  if (r.ok) revalidateBrowse()
  return r
}
