import type { MemberLite, Kpis } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

/** Rounds to one decimal place (spreadsheet ROUND(x,1) semantics). */
export function round1(x: number): number {
  return Math.round(x * 10) / 10
}

/**
 * Complete (whole) months elapsed from `from` to `to`, matching Excel/Sheets
 * DATEDIF(from, to, "m"): count a month as complete only once the
 * day-of-month of `from` has been reached or passed in the target month.
 *
 * Examples: Jan 15 -> Feb 14 = 0 (one day short of the anniversary).
 *           Jan 15 -> Feb 15 = 1. Jan 15 -> Mar 10 = 1 (anniversary day not
 *           yet reached in March). Jan 31 -> Feb 28 = 0 (Feb has no 31st, so
 *           the "day 31" target is never reached in Feb); Jan 31 -> Mar 1 = 1.
 * Returns 0 (not negative) if `to` is before `from`.
 *
 * Uses UTC date components (not local-time methods) so results are stable
 * regardless of the server/dev machine's timezone — this module and its
 * tests otherwise construct dates from date-only values (which parse as UTC
 * midnight), and mixing that with local-time getters would drift the
 * boundary by the local UTC offset.
 */
export function completeMonths(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0

  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth())

  // Subtract one more month if `to`'s day-of-month hasn't yet reached
  // `from`'s day-of-month (the anniversary hasn't occurred this cycle).
  if (to.getUTCDate() < from.getUTCDate()) {
    months -= 1
  }

  return Math.max(0, months)
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export function computeKpis(members: MemberLite[], opts: { now: Date }): Kpis {
  const { now } = opts

  const currentMembers = members.filter((m) => m.current === true)
  const lapsedMembers = members.filter((m) => m.membershipState === 'lapsed')

  const activeMembers = currentMembers.length
  const lapsedAllTime = lapsedMembers.length
  const totalEver = activeMembers + lapsedAllTime

  const overallTurnoverPct =
    totalEver > 0 ? round1((lapsedAllTime / totalEver) * 100) : 0
  const retentionPct =
    totalEver > 0 ? round1((activeMembers / totalEver) * 100) : 0

  const currentTenures = currentMembers
    .filter((m) => m.joinDate != null)
    .map((m) => completeMonths(m.joinDate as Date, now))
  const avgTenureMonths = round1(mean(currentTenures))
  const avgTenureYears = round1(avgTenureMonths / 12)

  const last12moCutoff = new Date(now.getTime() - 365 * DAY_MS)
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))

  const newLast12mo = members.filter(
    (m) => m.joinDate != null && m.joinDate.getTime() >= last12moCutoff.getTime()
  ).length

  const newThisYear = members.filter(
    (m) => m.joinDate != null && m.joinDate.getTime() >= yearStart.getTime()
  ).length

  const lapsedLast12mo = lapsedMembers.filter(
    (m) => m.expires != null && m.expires.getTime() >= last12moCutoff.getTime()
  ).length

  const rollingDenom = activeMembers + lapsedLast12mo
  const rolling12moTurnoverPct =
    rollingDenom > 0 ? round1((lapsedLast12mo / rollingDenom) * 100) : 0

  const next30Cutoff = new Date(now.getTime() + 30 * DAY_MS)
  const expiringNext30 = currentMembers.filter(
    (m) =>
      m.expires != null &&
      m.expires.getTime() >= now.getTime() &&
      m.expires.getTime() <= next30Cutoff.getTime()
  ).length

  const membersWithJoinDate = members.filter((m) => m.joinDate != null)
  let longestTenuredMember: string | null = null
  if (membersWithJoinDate.length > 0) {
    let earliest = membersWithJoinDate[0]
    for (const m of membersWithJoinDate) {
      if ((m.joinDate as Date).getTime() < (earliest.joinDate as Date).getTime()) {
        earliest = m
      }
    }
    longestTenuredMember = earliest.name ?? null
  }

  const lapseTenures = lapsedMembers
    .filter((m) => m.joinDate != null && m.expires != null)
    .map((m) => completeMonths(m.joinDate as Date, m.expires as Date))
  const avgTenureAtLapseMonths = round1(mean(lapseTenures))

  return {
    activeMembers,
    lapsedAllTime,
    totalEver,
    overallTurnoverPct,
    retentionPct,
    avgTenureMonths,
    avgTenureYears,
    newLast12mo,
    newThisYear,
    lapsedLast12mo,
    rolling12moTurnoverPct,
    expiringNext30,
    longestTenuredMember,
    avgTenureAtLapseMonths,
  }
}
