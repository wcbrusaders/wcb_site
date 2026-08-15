'use server'

import { auth } from '@/lib/auth'
import { setRosterField, validateSecondaryEmail } from '@/lib/roster'
import { recordAudit, type AuditEntry } from '@/lib/audit'

type Actor = { memberId?: string; email: string }

type Deps = {
  setRosterField: typeof setRosterField
  recordAudit: (e: AuditEntry) => Promise<void>
}

export async function requireBoard(): Promise<Actor | null> {
  const s = await auth()
  if (!s?.user?.isBoard || !s.user.email) return null
  return { memberId: s.user.memberId, email: s.user.email }
}

// Pure, testable core. actor === null means "not board" → reject.
export async function applySecondaryEmail(
  deps: Deps, actor: Actor | null,
  memberEmail: string, memberName: string, secondary: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!actor) return { ok: false, reason: 'Not authorized.' }
  const v = validateSecondaryEmail(secondary)
  if (!v.ok) return { ok: false, reason: v.reason }
  const w = await deps.setRosterField(memberEmail, 'Google Email', v.value)
  if (!w.ok) return { ok: false, reason: w.reason ?? 'Write failed.' }
  await deps.recordAudit({
    actorMemberId: actor.memberId, actorEmail: actor.email,
    action: 'set-secondary-email', targetLabel: memberName, detail: `set to ${v.value}`,
  })
  return { ok: true }
}

export async function applyPartner(
  deps: Deps, actor: Actor | null,
  memberEmail: string, memberName: string, partnerEmail: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!actor) return { ok: false, reason: 'Not authorized.' }
  const v = validateSecondaryEmail(partnerEmail) // same shape check
  if (!v.ok) return { ok: false, reason: v.reason }
  const w = await deps.setRosterField(memberEmail, 'Partner Email', v.value)
  if (!w.ok) return { ok: false, reason: w.reason ?? 'Write failed.' }
  await deps.recordAudit({
    actorMemberId: actor.memberId, actorEmail: actor.email,
    action: 'set-partner', targetLabel: memberName, detail: `linked ${v.value}`,
  })
  return { ok: true }
}

const realDeps: Deps = { setRosterField, recordAudit }

export async function setSecondaryEmailAction(memberEmail: string, memberName: string, secondary: string) {
  return applySecondaryEmail(realDeps, await requireBoard(), memberEmail, memberName, secondary)
}

export async function setPartnerAction(memberEmail: string, memberName: string, partnerEmail: string) {
  return applyPartner(realDeps, await requireBoard(), memberEmail, memberName, partnerEmail)
}
