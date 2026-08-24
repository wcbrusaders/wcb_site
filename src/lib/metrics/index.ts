// Aggregate entry point for the membership metrics engine.
//
// Fetches member + payment data once (query.ts, read-only) and computes every
// report from it — the single call Phase 3's admin reports page and Phase 4's
// biweekly snapshot job use. All the compute fns are pure (they take arrays +
// an injected `now`), so this is just the wiring + the one DB read.
import { prisma } from '../db'
import { fetchMetricsData } from './query'
import { computeKpis } from './kpis'
import { computeTrends, type TrendRow } from './trends'
import {
  computeTierMix,
  computeSeasonality,
  computeCohortRetention,
  type TierMixRow,
  type SeasonalityRow,
  type CohortRow,
} from './composition'
import { computeRevenue, type RevenueRow } from './revenue'
import {
  computeTenureLeaderboard,
  computeExpiringSoon,
  computePaymentMix,
  computeGrowthSummary,
  type TenureLeaderboardRow,
  type ExpiringSoonRow,
  type PaymentMix,
  type GrowthSummary,
} from './lists'
import type { Kpis, MemberLite, PaymentLite } from './types'

export type MembershipReports = {
  kpis: Kpis
  trends: TrendRow[]
  tierMix: TierMixRow[]
  seasonality: SeasonalityRow[]
  cohorts: CohortRow[]
  revenue: RevenueRow[]
  tenureTop5: TenureLeaderboardRow[]
  expiringSoon: ExpiringSoonRow[]
  paymentMix: PaymentMix
  growthSummary: GrowthSummary
  generatedAt: string // ISO — when this snapshot was computed
}

/**
 * Compute every membership report from a members + payments dataset. Pure over
 * its inputs (inject `now` for deterministic time-windowed metrics); exported
 * separately from the DB-fetching wrapper so it's unit-testable without Prisma.
 */
export function computeMembershipReports(
  members: MemberLite[],
  payments: PaymentLite[],
  opts: { now: Date },
): MembershipReports {
  const { now } = opts
  const trends = computeTrends(members, { now })
  return {
    kpis: computeKpis(members, { now }),
    trends,
    tierMix: computeTierMix(members),
    seasonality: computeSeasonality(members),
    cohorts: computeCohortRetention(members),
    revenue: computeRevenue(members, payments, { now }),
    tenureTop5: computeTenureLeaderboard(members, { now }, 5),
    expiringSoon: computeExpiringSoon(members, { now, windowDays: 60 }),
    paymentMix: computePaymentMix(payments),
    growthSummary: computeGrowthSummary(trends),
    generatedAt: now.toISOString(),
  }
}

/**
 * Fetch the live data (read-only) and compute all reports. This is what the
 * admin page / snapshot job call. `now` defaults to the current time; callers
 * (and tests) may inject a fixed clock.
 */
export async function getMembershipReports(
  opts: { db?: typeof prisma; now?: Date } = {},
): Promise<MembershipReports> {
  const db = opts.db ?? prisma
  const now = opts.now ?? new Date()
  const { members, payments } = await fetchMetricsData(db)
  return computeMembershipReports(members, payments, { now })
}
