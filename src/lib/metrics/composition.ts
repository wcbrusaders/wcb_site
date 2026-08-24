import type { MemberLite } from './types'
import { round1 } from './kpis'
import { type QuarterKey, quarterOf, quarterLabel, enumerateQuarters, quarterIndex } from './quarters'

/**
 * Composition reports, reproducing the roster sheet's Tier Mix, Seasonality,
 * and Cohort Retention tabs exactly.
 *
 * All date math uses UTC getters (consistent with kpis.ts/trends.ts) since
 * this module — like the rest of the metrics engine — is fed date-only
 * values that parse as UTC midnight; mixing that with local-time getters
 * would drift results by the local UTC offset.
 */

export type TierMixRow = { tier: string; count: number }
export type SeasonalityRow = { month: string; joins: number }
export type CohortRow = {
  cohort: string
  joined: number
  stillActive: number
  retentionPct: number | null
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const UNKNOWN_TIER = 'Unknown'

/**
 * Tier Mix — CURRENT members only (the sheet's Sheet1 tab is the current
 * roster), grouped by tier. A current member with a null tier is grouped
 * under 'Unknown' rather than skipped, so every current member is accounted
 * for in the totals. Rows are sorted by count descending, then by tier name
 * ascending to break ties deterministically (matches the sheet's observed
 * count-desc order).
 */
export function computeTierMix(members: MemberLite[]): TierMixRow[] {
  const counts = new Map<string, number>()

  for (const m of members) {
    if (m.current !== true) continue
    const tier = m.tier ?? UNKNOWN_TIER
    counts.set(tier, (counts.get(tier) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([tier, count]) => ({ tier, count }))
    .sort((a, b) => b.count - a.count || a.tier.localeCompare(b.tier))
}

/**
 * Seasonality — ALL members (any membershipState), grouped by the calendar
 * month (UTC, aggregated across all years) of their joinDate. Members with a
 * null joinDate are excluded (they have no month to attribute a join to).
 * Always returns exactly 12 rows, ordered Jan..Dec.
 */
export function computeSeasonality(members: MemberLite[]): SeasonalityRow[] {
  const joinsByMonth = new Array<number>(12).fill(0)

  for (const m of members) {
    if (m.joinDate == null) continue
    joinsByMonth[m.joinDate.getUTCMonth()] += 1
  }

  return MONTH_LABELS.map((month, i) => ({ month, joins: joinsByMonth[i] }))
}

/**
 * Cohort Retention — ALL members grouped by their join QUARTER. For each
 * cohort quarter (from the earliest joinDate's quarter through the latest
 * joinDate's quarter, inclusive — so a quarter with zero joins still appears
 * as a row with joined=0): `joined` = count of members joining in that
 * quarter; `stillActive` = of those, count where current===true;
 * `retentionPct` = round1(stillActive/joined*100), or null when joined===0
 * (nothing to compute a percentage of — shows blank on the sheet). Members
 * with a null joinDate are excluded (no cohort to assign them to). Ordered
 * by quarter ascending.
 */
export function computeCohortRetention(members: MemberLite[]): CohortRow[] {
  const withJoinDate = members.filter((m): m is MemberLite & { joinDate: Date } => m.joinDate != null)

  if (withJoinDate.length === 0) return []

  const quarters = withJoinDate.map((m) => quarterOf(m.joinDate))
  let first = quarters[0]
  let last = quarters[0]
  for (const q of quarters) {
    if (quarterIndex(q) < quarterIndex(first)) first = q
    if (quarterIndex(q) > quarterIndex(last)) last = q
  }

  const allQuarters = enumerateQuarters(first, last)

  return allQuarters.map((key) => {
    const cohortMembers = withJoinDate.filter((m) => {
      const q = quarterOf(m.joinDate)
      return q.year === key.year && q.q === key.q
    })
    const joined = cohortMembers.length
    const stillActive = cohortMembers.filter((m) => m.current === true).length
    const retentionPct = joined > 0 ? round1((stillActive / joined) * 100) : null

    return { cohort: quarterLabel(key), joined, stillActive, retentionPct }
  })
}
