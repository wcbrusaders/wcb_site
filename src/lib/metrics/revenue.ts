import type { MemberLite, PaymentLite } from './types'
import { quarterOf, quarterRange, quarterLabel, enumerateQuarters } from './quarters'

/**
 * Per-quarter Revenue report, reproducing the roster sheet's Revenue tab
 * exactly. Quarters run from the quarter containing the earliest of (the
 * earliest payment date, the earliest joinDate) through the quarter
 * containing `now` (inclusive), half-open date ranges [start, end) per
 * quarter (e.g. 2026-Q2 = [2026-04-01, 2026-07-01)) — consistent with
 * trends.ts/composition.ts.
 *
 * Definitions (from the sheet's actual cell formulas, not the plan's
 * approximation):
 *  - netDues: SUM of payment.netDues for payments dated within the quarter.
 *  - eventsIncome: always 0 (no source feeds this yet).
 *  - totalRevenue: netDues + eventsIncome.
 *  - duesPayments: COUNT of payments dated within the quarter.
 *  - newMembers: COUNT of ALL members (any membershipState) whose joinDate
 *    falls within the quarter — the same "New" definition as Trends. This is
 *    NOT based on who made the payment; a payment and a join are independent
 *    events being compared at the quarter level.
 *  - renewals: max(0, duesPayments - newMembers). The sheet's renewal count
 *    is a residual (payments not attributable to a new join), floored at 0
 *    so a quarter with more joins than payments doesn't go negative.
 */
export type RevenueRow = {
  quarter: string
  netDues: number
  eventsIncome: number
  totalRevenue: number
  duesPayments: number
  newMembers: number
  renewals: number
}

/** Rounds to two decimal places (spreadsheet currency-cell precision). */
function round2(x: number): number {
  return Math.round(x * 100) / 100
}

export function computeRevenue(
  members: MemberLite[],
  payments: PaymentLite[],
  opts?: { now?: Date }
): RevenueRow[] {
  const now = opts?.now ?? new Date()

  const joinDates = members.map((m) => m.joinDate).filter((d): d is Date => d != null)
  const paymentDates = payments.map((p) => p.date)

  if (joinDates.length === 0 && paymentDates.length === 0) return []

  const candidateEarliest: Date[] = [...joinDates, ...paymentDates]
  const earliest = candidateEarliest.reduce((min, d) => (d.getTime() < min.getTime() ? d : min))

  const firstQuarter = quarterOf(earliest)
  const lastQuarter = quarterOf(now)
  const quarters = enumerateQuarters(firstQuarter, lastQuarter)

  return quarters.map((key) => {
    const { start, end } = quarterRange(key)
    const inRange = (t: number) => t >= start.getTime() && t < end.getTime()

    const quarterPayments = payments.filter((p) => inRange(p.date.getTime()))
    const netDues = round2(quarterPayments.reduce((sum, p) => sum + p.netDues, 0))
    const eventsIncome = 0
    const totalRevenue = round2(netDues + eventsIncome)
    const duesPayments = quarterPayments.length

    const newMembers = members.filter((m) => m.joinDate != null && inRange(m.joinDate.getTime())).length

    const renewals = Math.max(0, duesPayments - newMembers)

    return {
      quarter: quarterLabel(key),
      netDues,
      eventsIncome,
      totalRevenue,
      duesPayments,
      newMembers,
      renewals,
    }
  })
}
