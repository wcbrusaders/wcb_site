'use server'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { tallyVotes, computeEligibleBoard, decisionDueDate, isCaseResolvable, cooldownUntil, type VoteValue } from '@/lib/enforcement'

type Actor = { memberId?: string; email: string }

async function requireBoard(): Promise<Actor | null> {
  const s = await auth()
  if (!s?.user?.isBoard || !s.user.email) return null
  return { memberId: s.user.memberId, email: s.user.email }
}

// ---- pure, testable cores ----
export async function applyCastVote(
  deps: { saveVote: (caseId: string, voterMemberId: string, vote: VoteValue) => Promise<void> },
  actor: Actor | null,
  caseMeta: { id: string; eligibleBoardIds: string[] },
  vote: VoteValue,
): Promise<{ ok: boolean; reason?: string }> {
  if (!actor?.memberId) return { ok: false, reason: 'Not authorized.' }
  if (!caseMeta.eligibleBoardIds.includes(actor.memberId)) return { ok: false, reason: 'You are not an eligible voter on this case.' }
  await deps.saveVote(caseMeta.id, actor.memberId, vote) // vote recorded as ACTOR, not a param
  return { ok: true }
}

export async function applyExecuteRemoval(
  deps: { banMember: () => Promise<void> },
  actor: Actor | null,
  votes: VoteValue[],
): Promise<{ ok: boolean; reason?: string }> {
  if (!actor?.memberId) return { ok: false, reason: 'Not authorized.' }
  const tally = tallyVotes(votes)
  if (!tally.passes) return { ok: false, reason: 'Vote has not passed (need quorum of 3 and two-thirds approval).' }
  await deps.banMember()
  return { ok: true }
}

// ---- 'use server' wrappers (thin; wire pure cores to prisma + auth) ----
export async function interimFreezeAction(subjectMemberId: string, subjectLabel: string, reason: string) {
  const actor = await requireBoard()
  if (!actor?.memberId) return { ok: false, reason: 'Not authorized.' }
  const now = new Date()
  await prisma.member.update({ where: { id: subjectMemberId }, data: { status: 'interim' } })
  await prisma.enforcementCase.create({ data: {
    subjectMemberId, subjectLabel, kind: 'interim', openedByMemberId: actor.memberId,
    openedByEmail: actor.email, eligibleBoardCount: 0, recusedMemberIds: '', decisionDueAt: decisionDueDate(now),
  }})
  await recordAudit({ actorMemberId: actor.memberId, actorEmail: actor.email, action: 'interim-freeze', targetMemberId: subjectMemberId, targetLabel: subjectLabel, detail: reason })
  return { ok: true }
}

export async function openRemovalCaseAction(subjectMemberId: string, subjectLabel: string, recusedIds: string[]) {
  const actor = await requireBoard()
  if (!actor?.memberId) return { ok: false, reason: 'Not authorized.' }
  const board = await prisma.member.findMany({ where: { isBoard: true }, select: { id: true } })
  const eligible = computeEligibleBoard(board.map((b) => b.id), [subjectMemberId, ...recusedIds])
  const now = new Date()
  const c = await prisma.enforcementCase.create({ data: {
    subjectMemberId, subjectLabel, kind: 'removal', openedByMemberId: actor.memberId, openedByEmail: actor.email,
    eligibleBoardCount: eligible.length, recusedMemberIds: [subjectMemberId, ...recusedIds].join(','), decisionDueAt: decisionDueDate(now),
  }})
  await recordAudit({ actorMemberId: actor.memberId, actorEmail: actor.email, action: 'open-removal-case', targetMemberId: subjectMemberId, targetLabel: subjectLabel, detail: `eligible=${eligible.length}` })
  return { ok: true, caseId: c.id }
}

export async function castVoteAction(caseId: string, vote: VoteValue) {
  const actor = await requireBoard()
  const c = await prisma.enforcementCase.findUnique({ where: { id: caseId } })
  if (!c) return { ok: false, reason: 'Case not found.' }
  const board = await prisma.member.findMany({ where: { isBoard: true }, select: { id: true } })
  const recused = c.recusedMemberIds ? c.recusedMemberIds.split(',') : []
  const eligible = computeEligibleBoard(board.map((b) => b.id), recused)
  const result = await applyCastVote({
    saveVote: async (cid, voter, v) => {
      await prisma.caseVote.upsert({
        where: { caseId_voterMemberId: { caseId: cid, voterMemberId: voter } },
        update: { vote: v },
        create: { caseId: cid, voterMemberId: voter, voterEmail: actor!.email, vote: v },
      })
    },
  }, actor, { id: caseId, eligibleBoardIds: eligible }, vote)
  if (result.ok && actor?.memberId) {
    await recordAudit({ actorMemberId: actor.memberId, actorEmail: actor.email, action: 'cast-vote', targetLabel: c.subjectLabel, detail: `${vote} on case ${caseId}` })
  }
  return result
}

export async function executeRemovalAction(caseId: string) {
  const actor = await requireBoard()
  const c = await prisma.enforcementCase.findUnique({ where: { id: caseId }, include: { votes: true } })
  if (!c) return { ok: false, reason: 'Case not found.' }
  if (!isCaseResolvable(c.status)) return { ok: false, reason: 'This case is already resolved.' }
  const votes = c.votes.map((v) => v.vote as VoteValue)
  const result = await applyExecuteRemoval({
    banMember: async () => {
      await prisma.member.update({ where: { id: c.subjectMemberId }, data: { status: 'banned' } })
      await prisma.enforcementCase.update({ where: { id: caseId }, data: { status: 'resolved', resolvedAt: new Date(), outcome: 'removed' } })
    },
  }, actor, votes)
  if (result.ok && actor?.memberId) {
    await recordAudit({ actorMemberId: actor.memberId, actorEmail: actor.email, action: 'execute-removal', targetMemberId: c.subjectMemberId, targetLabel: c.subjectLabel, detail: 'removed by board vote' })
  }
  return result
}

export async function liftCaseAction(caseId: string) {
  const actor = await requireBoard()
  if (!actor?.memberId) return { ok: false, reason: 'Not authorized.' }
  const c = await prisma.enforcementCase.findUnique({ where: { id: caseId } })
  if (!c) return { ok: false, reason: 'Case not found.' }
  if (!isCaseResolvable(c.status)) return { ok: false, reason: 'This case is already resolved.' }
  await prisma.member.update({ where: { id: c.subjectMemberId }, data: { status: 'active' } })
  await prisma.enforcementCase.update({ where: { id: caseId }, data: { status: 'resolved', resolvedAt: new Date(), outcome: 'lifted' } })
  await recordAudit({ actorMemberId: actor.memberId, actorEmail: actor.email, action: 'lift-case', targetMemberId: c.subjectMemberId, targetLabel: c.subjectLabel, detail: null })
  return { ok: true }
}

// Time-limited suspension ("cooldown") per the ratified Code's Strike-2.
// Sets status='interim' (a cooldown IS a suspension) plus statusUntil so the
// members-layout gate (via isAccessBlockedNow) auto-restores access once the
// window elapses, even if nobody manually reinstates.
export async function suspendMemberAction(subjectMemberId: string, subjectLabel: string, days: number, reason: string) {
  const actor = await requireBoard()
  if (!actor?.memberId) return { ok: false, reason: 'Not authorized.' }
  const now = new Date()
  const until = cooldownUntil(days, now)
  await prisma.member.update({ where: { id: subjectMemberId }, data: { status: 'interim', statusUntil: until } })
  await recordAudit({ actorMemberId: actor.memberId, actorEmail: actor.email, action: 'suspend-cooldown', targetMemberId: subjectMemberId, targetLabel: subjectLabel, detail: `${days}d: ${reason}` })
  return { ok: true }
}

// The missing reinstate path: manually restore a banned/suspended member to
// 'active' and clear statusUntil (finding #3).
export async function reinstateMemberAction(subjectMemberId: string, subjectLabel: string) {
  const actor = await requireBoard()
  if (!actor?.memberId) return { ok: false, reason: 'Not authorized.' }
  await prisma.member.update({ where: { id: subjectMemberId }, data: { status: 'active', statusUntil: null } })
  await recordAudit({ actorMemberId: actor.memberId, actorEmail: actor.email, action: 'reinstate', targetMemberId: subjectMemberId, targetLabel: subjectLabel, detail: null })
  return { ok: true }
}

export async function recordStrikeAction(memberId: string, memberLabel: string, level: string, reason: string) {
  const actor = await requireBoard()
  if (!actor?.memberId) return { ok: false, reason: 'Not authorized.' }
  const now = new Date()
  const expiresAt = level === 'correction' ? null : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
  await prisma.strike.create({ data: { memberId, memberLabel, level, reason, issuedByEmail: actor.email, expiresAt } })
  await recordAudit({ actorMemberId: actor.memberId, actorEmail: actor.email, action: 'record-strike', targetMemberId: memberId, targetLabel: memberLabel, detail: `${level}: ${reason}` })
  return { ok: true }
}
