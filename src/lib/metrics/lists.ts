import type { MemberLite, PaymentLite } from './types'
import { completeMonths } from './kpis'
import type { TrendRow } from './trends'

/**
 * List-shaped membership reports: tenure leaderboard, expiring-soon roster,
 * and payment-source mix. Kept in their own module (separate from kpis.ts)
 * since these return arrays/rows rather than single-number KPIs.
 *
 * Date math follows the rest of the metrics engine: UTC getters only, since
 * this module is fed date-only values that parse as UTC midnight — mixing
 * that with local-time methods would drift results by the local UTC offset.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Rounds to two decimal places (spreadsheet currency-cell precision). */
function round2(x: number): number {
  return Math.round(x * 100) / 100
}

/** Formats a UTC date as an ISO date-only string ("YYYY-MM-DD"). */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export type TenureLeaderboardRow = {
  name: string
  joinDate: string // never null — null-joinDate members are filtered out
  tenureMonths: number
}

export type ExpiringSoonRow = {
  name: string
  expires: string
  daysLeft: number
}

export type PaymentMixSourceRow = {
  source: string
  count: number
  total: number
}

export type PaymentMix = {
  bySource: PaymentMixSourceRow[]
  avgDues: number
  totalPayments: number
}

/**
 * Tenure leaderboard — CURRENT members only, with a non-null joinDate,
 * sorted by joinDate ascending (earliest join = longest tenure = first),
 * top `limit` (default 5). tenureMonths uses completeMonths(joinDate, now),
 * matching kpis.ts's avgTenureMonths definition. Members without a joinDate
 * are excluded (no tenure to compute or rank by).
 */
export function computeTenureLeaderboard(
  members: MemberLite[],
  opts: { now: Date },
  limit = 5
): TenureLeaderboardRow[] {
  const { now } = opts

  const withJoinDate = members.filter(
    (m): m is MemberLite & { joinDate: Date } => m.current === true && m.joinDate != null
  )

  return withJoinDate
    .slice()
    .sort((a, b) => a.joinDate.getTime() - b.joinDate.getTime())
    .slice(0, limit)
    .map((m) => ({
      name: m.name ?? 'Unknown',
      joinDate: isoDate(m.joinDate),
      tenureMonths: completeMonths(m.joinDate, now),
    }))
}

/**
 * Expiring-soon roster — CURRENT members whose `expires` falls in the
 * inclusive window [now, now + windowDays], sorted soonest-first. Members
 * with a null expires are excluded. daysLeft is the whole number of days
 * from `now` to `expires`, computed via Math.floor((expires - now) / DAY_MS)
 * — chosen over ceil so a member expiring later today (same calendar day as
 * `now`) reads as 0 days left rather than rounding up to 1.
 */
export function computeExpiringSoon(
  members: MemberLite[],
  opts: { now: Date; windowDays: number }
): ExpiringSoonRow[] {
  const { now, windowDays } = opts
  const windowEnd = new Date(now.getTime() + windowDays * DAY_MS)

  const inWindow = members.filter(
    (m): m is MemberLite & { expires: Date } =>
      m.current === true &&
      m.expires != null &&
      m.expires.getTime() >= now.getTime() &&
      m.expires.getTime() <= windowEnd.getTime()
  )

  return inWindow
    .slice()
    .sort((a, b) => a.expires.getTime() - b.expires.getTime())
    .map((m) => ({
      name: m.name ?? 'Unknown',
      expires: isoDate(m.expires),
      daysLeft: Math.floor((m.expires.getTime() - now.getTime()) / DAY_MS),
    }))
}

/**
 * Payment mix — groups all payments by `source` (e.g. Stripe/PayPal),
 * reporting count and sum(netDues) (round2) per source, sorted by count
 * descending (ties broken by source name ascending, matching
 * composition.ts's computeTierMix convention). avgDues is
 * round2(sum of ALL netDues / count of ALL payments), 0 when there are no
 * payments. totalPayments is the overall payment count.
 */
export function computePaymentMix(payments: PaymentLite[]): PaymentMix {
  if (payments.length === 0) {
    return { bySource: [], avgDues: 0, totalPayments: 0 }
  }

  const bySourceMap = new Map<string, { count: number; total: number }>()
  let overallTotal = 0

  for (const p of payments) {
    const entry = bySourceMap.get(p.source) ?? { count: 0, total: 0 }
    entry.count += 1
    entry.total += p.netDues
    bySourceMap.set(p.source, entry)
    overallTotal += p.netDues
  }

  const bySource = Array.from(bySourceMap.entries())
    .map(([source, { count, total }]) => ({ source, count, total: round2(total) }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source))

  const totalPayments = payments.length
  const avgDues = round2(overallTotal / totalPayments)

  return { bySource, avgDues, totalPayments }
}

// --- Growth summary (POSITIVE framing — "when are we doing well") ------------

export type GrowthSummary = {
  currentActive: number          // latest quarter's active (EOQ)
  latestNetGrowthPct: number | null  // latest quarter's net growth %
  recordActive: number           // all-time-high active count
  recordActiveQuarter: string | null // the quarter that hit it
  atRecord: boolean              // is current active == the record?
  bestRecruitmentQuarter: string | null // quarter with the most New joins
  bestRecruitmentNew: number     // that quarter's New count
  consecutiveGrowthQuarters: number // trailing run of quarters with netGrowth > 0
}

/**
 * Derive the club's growth/positive-momentum headline from the per-quarter
 * Trends (which already carries activeEOQ / new / netGrowthPct). Surfaces the
 * "what's going RIGHT" story that the turnover/lapsed metrics don't — record
 * active membership, best recruitment quarter, and the current growth streak.
 * Pure: derives entirely from the passed trends array (no clock needed).
 */
export function computeGrowthSummary(trends: TrendRow[]): GrowthSummary {
  if (trends.length === 0) {
    return {
      currentActive: 0, latestNetGrowthPct: null, recordActive: 0,
      recordActiveQuarter: null, atRecord: false, bestRecruitmentQuarter: null,
      bestRecruitmentNew: 0, consecutiveGrowthQuarters: 0,
    }
  }
  const last = trends[trends.length - 1]
  const currentActive = last.activeEOQ
  const latestNetGrowthPct = last.netGrowthPct

  let recordActive = -Infinity
  let recordActiveQuarter: string | null = null
  let bestRecruitmentNew = -Infinity
  let bestRecruitmentQuarter: string | null = null
  for (const t of trends) {
    if (t.activeEOQ > recordActive) { recordActive = t.activeEOQ; recordActiveQuarter = t.quarter }
    if (t.new > bestRecruitmentNew) { bestRecruitmentNew = t.new; bestRecruitmentQuarter = t.quarter }
  }

  // trailing run of quarters with positive net growth (from the most recent back)
  let consecutiveGrowthQuarters = 0
  for (let i = trends.length - 1; i >= 0; i--) {
    if ((trends[i].netGrowthPct ?? 0) > 0) consecutiveGrowthQuarters++
    else break
  }

  return {
    currentActive,
    latestNetGrowthPct,
    recordActive: recordActive === -Infinity ? 0 : recordActive,
    recordActiveQuarter,
    atRecord: currentActive === recordActive,
    bestRecruitmentQuarter,
    bestRecruitmentNew: bestRecruitmentNew === -Infinity ? 0 : bestRecruitmentNew,
    consecutiveGrowthQuarters,
  }
}
