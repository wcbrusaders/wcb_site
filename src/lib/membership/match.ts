import { normalizeEmailStrict, normalizeName } from './normalize'

export interface MatchMember {
  rowNumber: number
  tab: 'current' | 'lapsed'
  name: string | null
  emails: string[]
  // Raw sheet 'Expires' cell value (whatever format the roster stores, e.g.
  // M/D/YYYY), or null if blank/absent. Matching logic doesn't read this —
  // it's carried through so the orchestrator (T7) can credit remaining days
  // on renewal via computeExpiration(member.expires, now) instead of losing
  // them.
  expires: string | null
}
export interface PaymentIdentity { email: string; firstName: string; lastName: string }
export type MatchResult =
  | { kind: 'exact' | 'normalized' | 'alias'; member: MatchMember }
  | { kind: 'name-review'; candidates: MatchMember[] }
  | { kind: 'none' }

export function matchPayment(id: PaymentIdentity, members: MatchMember[]): MatchResult {
  const payEmail = id.email.trim().toLowerCase()
  // 1. exact
  for (const mem of members) if (mem.emails.some((e) => e.trim().toLowerCase() === payEmail)) return { kind: 'exact', member: mem }
  // 2. normalized
  const payNorm = normalizeEmailStrict(id.email)
  for (const mem of members) if (mem.emails.some((e) => normalizeEmailStrict(e) === payNorm)) return { kind: 'normalized', member: mem }
  // 3. name-review (never auto): normalized full-name equality
  const payName = normalizeName(`${id.firstName} ${id.lastName}`)
  const nameHits = members.filter((mem) => mem.name && normalizeName(mem.name) === payName)
  if (nameHits.length > 0) return { kind: 'name-review', candidates: nameHits }
  // 4. none
  return { kind: 'none' }
}
