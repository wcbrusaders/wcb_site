'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import {
  addCompetition, editCompetition, deleteCompetition, addEntry, editEntry, deleteEntry,
  setShipmentTracking,
  type NewCompetitionInput, type NewEntryInput,
} from '@/lib/competitions'

async function requireMember() {
  const session = await auth()
  const memberId = session?.user?.memberId
  if (!memberId) throw new Error('unauthorized')
  return { memberId, isBoard: !!session!.user!.isBoard }
}
async function requireBoard() {
  const m = await requireMember()
  if (!m.isBoard) throw new Error('forbidden')
  return m
}
function revalidateComps() { revalidatePath('/members/competitions'); revalidatePath('/members') }

export async function addCompetitionAction(input: NewCompetitionInput) {
  const { memberId } = await requireMember()
  const r = await addCompetition(input, memberId)
  if (r.ok) revalidateComps()
  return r
}
export async function editCompetitionAction(id: string, patch: Partial<NewCompetitionInput>) {
  const { memberId, isBoard } = await requireMember()
  const r = await editCompetition(id, patch, { memberId, isBoard })
  if (r.ok) revalidateComps()
  return r
}
export async function deleteCompetitionAction(id: string) {
  await requireBoard()
  const r = await deleteCompetition(id)
  if (r.ok) revalidateComps()
  return r
}
export async function setShipmentTrackingAction(id: string, carrier: string, tracking: string) {
  await requireBoard()
  const r = await setShipmentTracking(id, carrier, tracking)
  if (r.ok) revalidateComps()
  return r
}
export async function addEntryAction(competitionId: string, input: NewEntryInput) {
  const { memberId } = await requireMember()
  const r = await addEntry(competitionId, input, memberId)
  if (r.ok) revalidateComps()
  return r
}
export async function editEntryAction(entryId: string, patch: Partial<NewEntryInput>) {
  const { memberId } = await requireMember()
  const r = await editEntry(entryId, patch, memberId)
  if (r.ok) revalidateComps()
  return r
}
export async function deleteEntryAction(entryId: string) {
  const { memberId } = await requireMember()
  const r = await deleteEntry(entryId, memberId)
  if (r.ok) revalidateComps()
  return r
}
