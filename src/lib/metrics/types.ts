// Shared types for the membership metrics engine (Phase 2).
// Compute functions (kpis.ts, trends.ts, ...) are pure and take these plain
// shapes as input so they're testable without Prisma. query.ts is the only
// module allowed to touch Prisma and maps rows into these Lite shapes.

export type MemberLite = {
  name: string | null
  tier: string | null
  current: boolean
  membershipState: string
  joinDate: Date | null
  expires: Date | null
}

export type PaymentLite = {
  date: Date
  netDues: number
  source: string
}

export type Kpis = {
  activeMembers: number
  lapsedAllTime: number
  totalEver: number
  overallTurnoverPct: number
  retentionPct: number
  avgTenureMonths: number
  avgTenureYears: number
  newLast12mo: number
  newThisYear: number
  lapsedLast12mo: number
  rolling12moTurnoverPct: number
  expiringNext30: number
  longestTenuredMember: string | null
  avgTenureAtLapseMonths: number
}
