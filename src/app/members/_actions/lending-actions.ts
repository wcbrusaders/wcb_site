'use server'

import { revalidatePath } from 'next/cache'
import { del } from '@vercel/blob'
import { auth } from '@/lib/auth'
import {
  checkoutTitle, returnLoan, renewLoan, addTitle, addCopies, editTitle, archiveCopy, canSetPhoto, isBlobUrl,
  listMemberHistory,
  type NewTitleInput, type Condition, type HistoryLoan,
} from '@/lib/lending'
import { notifyOfficersCheckout } from '@/lib/notify'
import { prisma } from '@/lib/db'

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

export async function setItemPhotoAction(itemId: string, url: string) {
  const { isBoard } = await requireMember()
  const item = await prisma.loanableItem.findUnique({ where: { id: itemId } })
  if (!item) return { ok: false as const, reason: 'not_found' as const }
  if (item.category !== 'equipment') return { ok: false as const, reason: 'not_equipment' as const }
  if (!isBlobUrl(url)) return { ok: false as const, reason: 'invalid_url' as const }
  if (!canSetPhoto({ isBoard, hasPhoto: !!item.photoUrl })) return { ok: false as const, reason: 'forbidden' as const }
  // board replacing an existing photo → delete the old blob (member path never has an existing photo)
  if (item.photoUrl && item.photoUrl !== url) { try { await del(item.photoUrl) } catch { /* best-effort */ } }
  await prisma.loanableItem.update({ where: { id: itemId }, data: { photoUrl: url } })
  revalidateBrowse()
  return { ok: true as const }
}

export async function boardReturnLoanAction(loanId: string, cond?: { conditionIn?: Condition; noteIn?: string }) {
  const { memberId } = await requireBoard()
  // returnLoan already skips the ownership check when isBoard=true, so a board
  // member may return ANY member's loan. We pass the board member's own id as
  // actingMemberId (unused for the ownership branch when isBoard is true).
  const r = await returnLoan(loanId, memberId, true, cond)
  if (r.ok) { revalidateBrowse(); revalidatePath('/members/holdings') }
  return r
}

export async function listMemberHistoryAction(memberId: string): Promise<HistoryLoan[]> {
  await requireBoard()
  return listMemberHistory(memberId)
}

export async function removeItemPhotoAction(itemId: string) {
  await requireBoard()
  const item = await prisma.loanableItem.findUnique({ where: { id: itemId } })
  if (!item) return { ok: false as const, reason: 'not_found' as const }
  if (item.photoUrl) { try { await del(item.photoUrl) } catch { /* best-effort */ } }
  await prisma.loanableItem.update({ where: { id: itemId }, data: { photoUrl: null } })
  revalidateBrowse()
  return { ok: true as const }
}
