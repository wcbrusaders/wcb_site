import { describe, it, expect } from 'vitest'
import { computeKpis, completeMonths, round1 } from './kpis'
import type { MemberLite } from './types'

// Fixed "now" used throughout so last-12-mo / this-year / expiring-30 windows
// are deterministic. Chosen to match the plan's capture date.
const NOW = new Date('2026-08-24T00:00:00.000Z')

describe('round1', () => {
  it('rounds to one decimal place', () => {
    expect(round1(17.85)).toBe(17.9)
    expect(round1(82.05)).toBe(82.1)
    expect(round1(11.14)).toBe(11.1)
    expect(round1(0)).toBe(0)
  })
})

describe('completeMonths (DATEDIF "m" semantics: whole elapsed months)', () => {
  it('same day next month = exactly 1 complete month', () => {
    expect(completeMonths(new Date('2026-01-15'), new Date('2026-02-15'))).toBe(1)
  })

  it('one day before the monthly anniversary = still 0 complete months', () => {
    // Jan 15 -> Feb 14 has not yet completed a full month.
    expect(completeMonths(new Date('2026-01-15'), new Date('2026-02-14'))).toBe(0)
  })

  it('one day after the monthly anniversary = 1 complete month (not 2)', () => {
    // Jan 15 -> Feb 16 is 1 complete month plus 1 extra day, not 2.
    expect(completeMonths(new Date('2026-01-15'), new Date('2026-02-16'))).toBe(1)
  })

  it('Jan 15 -> Mar 10 = 1 complete month (day-of-month has not been reached)', () => {
    expect(completeMonths(new Date('2026-01-15'), new Date('2026-03-10'))).toBe(1)
  })

  it('Jan 15 -> Mar 15 = 2 complete months', () => {
    expect(completeMonths(new Date('2026-01-15'), new Date('2026-03-15'))).toBe(2)
  })

  it('same day = 0 complete months', () => {
    expect(completeMonths(new Date('2026-01-15'), new Date('2026-01-15'))).toBe(0)
  })

  it('handles end-of-month day overflow (Jan 31 -> Feb 28)', () => {
    // Feb has no day 31, so day 28 (Feb's last day) never "reaches" day 31 —
    // DATEDIF('2026-01-31','2026-02-28','m') = 0, matching the spreadsheet.
    expect(completeMonths(new Date('2026-01-31'), new Date('2026-02-28'))).toBe(0)
    // One more day (Mar 1) completes the month.
    expect(completeMonths(new Date('2026-01-31'), new Date('2026-03-01'))).toBe(1)
  })
})

describe('computeKpis — hand-computed small fixture', () => {
  // 5 current members, 2 lapsed members. All dates hand-picked relative to
  // NOW (2026-08-24) so every window (last-12mo, this-year, expiring-30) has
  // a known, by-hand-computed answer.
  const members: MemberLite[] = [
    // Current members (5) — tenure computed from joinDate to NOW.
    {
      name: 'Alice Anderson',
      tier: 'Single',
      current: true,
      membershipState: 'active',
      joinDate: new Date('2023-08-24'), // exactly 36 complete months to NOW
      expires: new Date('2027-08-24'),
    },
    {
      name: 'Bob Baker',
      tier: 'Single',
      current: true,
      membershipState: 'active',
      joinDate: new Date('2025-08-24'), // exactly 12 complete months to NOW
      expires: new Date('2026-09-01'), // within next 30 days of NOW -> expiring
    },
    {
      name: 'Carla Cruz',
      tier: 'Couple',
      current: true,
      membershipState: 'active',
      joinDate: new Date('2026-02-24'), // exactly 6 complete months to NOW; within last 12mo + this year
      expires: new Date('2027-02-24'),
    },
    {
      name: 'Dan Diaz',
      tier: 'Single',
      current: true,
      membershipState: 'active',
      joinDate: new Date('2026-01-01'), // within this year and last 12mo
      expires: new Date('2027-01-01'),
    },
    {
      name: 'Erin Estrada',
      tier: 'Single',
      current: true,
      membershipState: 'active',
      joinDate: new Date('2025-09-01'), // within last 12mo (NOW-365d = 2025-08-24), NOT this year
      expires: new Date('2026-12-01'), // not within next 30 days
    },
    // Lapsed members (2) — tenure-at-lapse computed from joinDate to expires.
    {
      name: 'Frank Foster',
      tier: 'Single',
      current: false,
      membershipState: 'lapsed',
      joinDate: new Date('2024-01-01'),
      expires: new Date('2025-01-01'), // lapsed 12 complete months after join; NOT within last 12mo of NOW
    },
    {
      name: 'Gina Grant',
      tier: 'Couple',
      current: false,
      membershipState: 'lapsed',
      joinDate: new Date('2025-06-01'),
      expires: new Date('2026-06-01'), // lapse date within last 12mo of NOW (>= 2025-08-24); 12 complete months tenure-at-lapse
    },
  ]

  const kpis = computeKpis(members, { now: NOW })

  it('activeMembers = count(current===true)', () => {
    expect(kpis.activeMembers).toBe(5)
  })

  it('lapsedAllTime = count(membershipState===lapsed)', () => {
    expect(kpis.lapsedAllTime).toBe(2)
  })

  it('totalEver = active + lapsed', () => {
    expect(kpis.totalEver).toBe(7)
  })

  it('overallTurnoverPct = round1(lapsed/(active+lapsed)*100)', () => {
    // 2/7*100 = 28.5714... -> 28.6
    expect(kpis.overallTurnoverPct).toBe(28.6)
  })

  it('retentionPct = round1(active/(active+lapsed)*100)', () => {
    // 5/7*100 = 71.4285... -> 71.4
    expect(kpis.retentionPct).toBe(71.4)
  })

  it('avgTenureMonths = round1(mean(tenureMonths of CURRENT members))', () => {
    // Alice 36, Bob 12, Carla 6, Dan: 2026-01-01 -> 2026-08-24 = 7 complete
    // months, Erin: 2025-09-01 -> 2026-08-24 = 11 complete months.
    // mean = (36+12+6+7+11)/5 = 72/5 = 14.4
    expect(kpis.avgTenureMonths).toBe(14.4)
  })

  it('avgTenureYears = round1(avgTenureMonths/12)', () => {
    // 14.4/12 = 1.2
    expect(kpis.avgTenureYears).toBe(1.2)
  })

  it('newLast12mo = count(joinDate >= now-365d), ALL members', () => {
    // now-365d = 2025-08-24. Qualifying joinDates: Bob 2025-08-24 (boundary,
    // inclusive), Carla 2026-02-24, Dan 2026-01-01, Erin 2025-09-01, Gina
    // 2025-06-01 (NO, before boundary). Alice 2023 no. Frank 2024 no.
    // => Bob, Carla, Dan, Erin = 4
    expect(kpis.newLast12mo).toBe(4)
  })

  it('newThisYear = count(joinDate >= Jan 1 of now year), ALL members', () => {
    // Jan 1 2026. Qualifying: Carla 2026-02-24, Dan 2026-01-01 (boundary,
    // inclusive) = 2
    expect(kpis.newThisYear).toBe(2)
  })

  it('lapsedLast12mo = count(lapsed whose expires >= now-365d)', () => {
    // now-365d = 2025-08-24. Gina's expires 2026-06-01 qualifies. Frank's
    // expires 2025-01-01 does not. => 1
    expect(kpis.lapsedLast12mo).toBe(1)
  })

  it('rolling12moTurnoverPct = round1(lapsedLast12mo/(active+lapsedLast12mo)*100)', () => {
    // 1/(5+1)*100 = 16.6666... -> 16.7
    expect(kpis.rolling12moTurnoverPct).toBe(16.7)
  })

  it('expiringNext30 = count(current members with expires in [now, now+30d])', () => {
    // now=2026-08-24, now+30d=2026-09-23. Bob's expires 2026-09-01 qualifies.
    // No other current member's expires falls in this window. => 1
    expect(kpis.expiringNext30).toBe(1)
  })

  it('longestTenuredMember = name of member with earliest joinDate', () => {
    // Earliest joinDate overall is Frank Foster (2024-01-01)? No — Alice
    // Anderson (2023-08-24) is earlier. Alice has the earliest joinDate.
    expect(kpis.longestTenuredMember).toBe('Alice Anderson')
  })

  it('avgTenureAtLapseMonths = round1(mean(tenureMonths(joinDate->expires) for lapsed))', () => {
    // Frank: 2024-01-01 -> 2025-01-01 = 12 complete months.
    // Gina: 2025-06-01 -> 2026-06-01 = 12 complete months.
    // mean = 12
    expect(kpis.avgTenureAtLapseMonths).toBe(12)
  })
})

describe('computeKpis — null-safety', () => {
  it('longestTenuredMember is null when no member has a joinDate', () => {
    const members: MemberLite[] = [
      {
        name: 'No Join Date',
        tier: null,
        current: true,
        membershipState: 'active',
        joinDate: null,
        expires: null,
      },
    ]
    const kpis = computeKpis(members, { now: NOW })
    expect(kpis.longestTenuredMember).toBeNull()
  })

  it('does not throw and produces 0-ish KPIs on an empty roster', () => {
    const kpis = computeKpis([], { now: NOW })
    expect(kpis.activeMembers).toBe(0)
    expect(kpis.lapsedAllTime).toBe(0)
    expect(kpis.totalEver).toBe(0)
    expect(kpis.longestTenuredMember).toBeNull()
  })
})

describe('computeKpis — proves the FORMULA matches the sheet (real captured values)', () => {
  // Not prod data: a synthetic fixture engineered to yield exactly the
  // active=32 / lapsed=7 / lapsedLast12=4 counts captured from the sheet,
  // so the formula itself (not our arbitrary fixture) is what's under test.
  const now = new Date('2026-08-24T00:00:00.000Z')
  const activeMembers: MemberLite[] = Array.from({ length: 32 }, (_, i) => ({
    name: `Active ${i}`,
    tier: 'Single',
    current: true,
    membershipState: 'active',
    joinDate: new Date('2025-01-01'),
    expires: new Date('2027-01-01'),
  }))
  const lapsedLast12: MemberLite[] = Array.from({ length: 4 }, (_, i) => ({
    name: `LapsedRecent ${i}`,
    tier: 'Single',
    current: false,
    membershipState: 'lapsed',
    joinDate: new Date('2024-01-01'),
    expires: new Date('2026-06-01'), // within last 365d of now
  }))
  const lapsedOld: MemberLite[] = Array.from({ length: 3 }, (_, i) => ({
    name: `LapsedOld ${i}`,
    tier: 'Single',
    current: false,
    membershipState: 'lapsed',
    joinDate: new Date('2022-01-01'),
    expires: new Date('2023-01-01'), // outside last 365d of now
  }))
  const members = [...activeMembers, ...lapsedLast12, ...lapsedOld]
  const kpis = computeKpis(members, { now })

  it('active=32, lapsed=7 -> overallTurnover=17.9, retention=82.1', () => {
    expect(kpis.activeMembers).toBe(32)
    expect(kpis.lapsedAllTime).toBe(7)
    expect(kpis.overallTurnoverPct).toBe(17.9)
    expect(kpis.retentionPct).toBe(82.1)
  })

  it('lapsedLast12=4 -> rolling12moTurnoverPct=11.1', () => {
    expect(kpis.lapsedLast12mo).toBe(4)
    // 4/(32+4)*100 = 11.111... -> 11.1
    expect(kpis.rolling12moTurnoverPct).toBe(11.1)
  })
})
