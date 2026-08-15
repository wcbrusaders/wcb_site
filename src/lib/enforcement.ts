export const QUORUM_FLOOR = 3
export const DECISION_WINDOW_DAYS = 7

export type VoteValue = 'approve' | 'reject' | 'abstain'

export function computeEligibleBoard(boardMemberIds: string[], recusedIds: string[]): string[] {
  const recused = new Set(recusedIds)
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of boardMemberIds) {
    if (recused.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export type Tally = {
  cast: number; approve: number; reject: number; abstain: number
  quorumMet: boolean; twoThirdsMet: boolean; passes: boolean
}

export function tallyVotes(votes: VoteValue[]): Tally {
  const approve = votes.filter((v) => v === 'approve').length
  const reject = votes.filter((v) => v === 'reject').length
  const abstain = votes.filter((v) => v === 'abstain').length
  const cast = approve + reject + abstain
  const decisive = approve + reject
  const quorumMet = cast >= QUORUM_FLOOR
  const twoThirdsMet = decisive > 0 && approve >= Math.ceil((decisive * 2) / 3)
  return { cast, approve, reject, abstain, quorumMet, twoThirdsMet, passes: quorumMet && twoThirdsMet }
}

export function decisionDueDate(openedAt: Date): Date {
  return new Date(openedAt.getTime() + DECISION_WINDOW_DAYS * 24 * 60 * 60 * 1000)
}

export function isExpired(decisionDueAt: Date, now: Date): boolean {
  return now.getTime() > decisionDueAt.getTime()
}
