import type { MemberLite } from './types'
import { round1 } from './kpis'

/**
 * Per-quarter Trends report, reproducing the roster sheet's Trends tab
 * exactly. Quarters run from the quarter containing the earliest joinDate
 * through the quarter containing `now` (inclusive), half-open date ranges
 * [start, end) per quarter (e.g. 2026-Q2 = [2026-04-01, 2026-07-01)).
 *
 * All quarter boundaries use UTC date construction (consistent with kpis.ts's
 * completeMonths) to avoid local-timezone drift, since this module — like
 * kpis.ts — is fed date-only values that parse as UTC midnight.
 */
export type TrendRow = {
  quarter: string
  new: number
  churn: number
  activeEOQ: number
  turnoverPct: number
  retentionPct: number
  newYoyPct: number | null
  netGrowthPct: number | null
}

/** A quarter identified by its year and quarter-of-year (1-4). */
type QuarterKey = { year: number; q: 1 | 2 | 3 | 4 }

function quarterOfMonth(monthIndex0: number): 1 | 2 | 3 | 4 {
  return (Math.floor(monthIndex0 / 3) + 1) as 1 | 2 | 3 | 4
}

/** The quarter (UTC) containing the given date. */
function quarterOf(date: Date): QuarterKey {
  return { year: date.getUTCFullYear(), q: quarterOfMonth(date.getUTCMonth()) }
}

/** Half-open [start, end) UTC date range for a quarter. */
function quarterRange(key: QuarterKey): { start: Date; end: Date } {
  const startMonth = (key.q - 1) * 3
  const start = new Date(Date.UTC(key.year, startMonth, 1))
  const end = new Date(Date.UTC(key.year, startMonth + 3, 1))
  return { start, end }
}

function quarterLabel(key: QuarterKey): string {
  return `${key.year}-Q${key.q}`
}

/** The quarter immediately following the given one. */
function nextQuarter(key: QuarterKey): QuarterKey {
  return key.q === 4 ? { year: key.year + 1, q: 1 } : { year: key.year, q: ((key.q + 1) as 1 | 2 | 3 | 4) }
}

/** Ordered list of quarters from `first` through `last`, inclusive. */
function enumerateQuarters(first: QuarterKey, last: QuarterKey): QuarterKey[] {
  const quarters: QuarterKey[] = []
  let cur = first
  // Linear index comparison avoids infinite loop if first > last.
  const toIndex = (k: QuarterKey) => k.year * 4 + (k.q - 1)
  const lastIndex = toIndex(last)
  while (toIndex(cur) <= lastIndex) {
    quarters.push(cur)
    cur = nextQuarter(cur)
  }
  return quarters
}

export function computeTrends(members: MemberLite[], opts?: { now?: Date }): TrendRow[] {
  const now = opts?.now ?? new Date()

  const joinDates = members
    .map((m) => m.joinDate)
    .filter((d): d is Date => d != null)

  if (joinDates.length === 0) return []

  const earliestJoin = joinDates.reduce((min, d) => (d.getTime() < min.getTime() ? d : min))

  const firstQuarter = quarterOf(earliestJoin)
  const lastQuarter = quarterOf(now)
  const quarters = enumerateQuarters(firstQuarter, lastQuarter)

  const rows: TrendRow[] = []
  let cumulativeNew = 0
  let cumulativeChurn = 0
  let prevActiveEOQ: number | null = null
  const newByQuarterIndex: number[] = []

  for (let i = 0; i < quarters.length; i++) {
    const key = quarters[i]
    const { start, end } = quarterRange(key)

    const newCount = members.filter(
      (m) => m.joinDate != null && m.joinDate.getTime() >= start.getTime() && m.joinDate.getTime() < end.getTime()
    ).length

    const churnCount = members.filter(
      (m) =>
        m.membershipState === 'lapsed' &&
        m.expires != null &&
        m.expires.getTime() >= start.getTime() &&
        m.expires.getTime() < end.getTime()
    ).length

    cumulativeNew += newCount
    cumulativeChurn += churnCount
    const activeEOQ = cumulativeNew - cumulativeChurn

    const turnoverPct = prevActiveEOQ !== null && prevActiveEOQ !== 0 ? round1((churnCount / prevActiveEOQ) * 100) : 0
    const retentionPct = prevActiveEOQ !== null && prevActiveEOQ !== 0 ? round1(100 - turnoverPct) : 100

    const yoyIndex = i - 4
    let newYoyPct: number | null = null
    if (yoyIndex >= 0) {
      const priorNew = newByQuarterIndex[yoyIndex]
      if (priorNew !== 0) {
        newYoyPct = round1(((newCount - priorNew) / priorNew) * 100)
      }
    }

    let netGrowthPct: number | null = null
    if (prevActiveEOQ !== null && prevActiveEOQ !== 0) {
      netGrowthPct = round1(((activeEOQ - prevActiveEOQ) / prevActiveEOQ) * 100)
    }

    rows.push({
      quarter: quarterLabel(key),
      new: newCount,
      churn: churnCount,
      activeEOQ,
      turnoverPct,
      retentionPct,
      newYoyPct,
      netGrowthPct,
    })

    newByQuarterIndex.push(newCount)
    prevActiveEOQ = activeEOQ
  }

  return rows
}
