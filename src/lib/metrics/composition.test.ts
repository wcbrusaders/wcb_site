import { describe, it, expect } from 'vitest'
import { computeTierMix, computeSeasonality, computeCohortRetention } from './composition'
import type { MemberLite } from './types'

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

describe('computeTierMix', () => {
  it('counts only current members, grouped by tier, sorted by count desc', () => {
    const members: MemberLite[] = [
      { name: 'M1', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-01-10'), expires: null },
      { name: 'M2', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-02-10'), expires: null },
      { name: 'M3', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-03-10'), expires: null },
      { name: 'M4', tier: 'Couple', current: true, membershipState: 'active', joinDate: d('2025-04-10'), expires: null },
      // Non-current member with tier Single — must NOT be counted, even
      // though its tier matches the current group.
      { name: 'M5', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: d('2024-01-10'), expires: d('2025-01-10') },
      // Non-current Honorary member — excluded entirely (not current).
      { name: 'M6', tier: 'Honorary', current: false, membershipState: 'lapsed', joinDate: d('2023-01-10'), expires: d('2024-01-10') },
    ]

    // Current only: 3x Single, 1x Couple -> Single first (higher count).
    expect(computeTierMix(members)).toEqual([
      { tier: 'Single', count: 3 },
      { tier: 'Couple', count: 1 },
    ])
  })

  it('groups a current member with a null tier under Unknown', () => {
    const members: MemberLite[] = [
      { name: 'M1', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-01-10'), expires: null },
      { name: 'M2', tier: null, current: true, membershipState: 'active', joinDate: d('2025-02-10'), expires: null },
    ]

    expect(computeTierMix(members)).toEqual([
      { tier: 'Single', count: 1 },
      { tier: 'Unknown', count: 1 },
    ])
  })

  it('breaks a count tie by tier name ascending', () => {
    const members: MemberLite[] = [
      { name: 'M1', tier: 'Couple', current: true, membershipState: 'active', joinDate: d('2025-01-10'), expires: null },
      { name: 'M2', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-02-10'), expires: null },
    ]

    expect(computeTierMix(members)).toEqual([
      { tier: 'Couple', count: 1 },
      { tier: 'Single', count: 1 },
    ])
  })

  it('returns an empty array when there are no current members', () => {
    const members: MemberLite[] = [
      { name: 'M1', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: d('2024-01-10'), expires: d('2025-01-10') },
    ]

    expect(computeTierMix(members)).toEqual([])
  })
})

describe('computeSeasonality', () => {
  it('buckets joins by calendar month (UTC), aggregated across all years, regardless of current/lapsed state', () => {
    const members: MemberLite[] = [
      // Two Januaries (different years) -> Jan count 2.
      { name: 'M1', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2023-01-05'), expires: null },
      { name: 'M2', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: d('2025-01-20'), expires: d('2026-01-20') },
      // One March.
      { name: 'M3', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-03-15'), expires: null },
      // One December.
      { name: 'M4', tier: 'Couple', current: false, membershipState: 'lapsed', joinDate: d('2022-12-31'), expires: d('2023-12-31') },
      // Null joinDate -> excluded, doesn't crash and isn't counted anywhere.
      { name: 'M5', tier: 'Single', current: true, membershipState: 'active', joinDate: null, expires: null },
    ]

    const result = computeSeasonality(members)

    // Always 12 rows, ordered Jan..Dec.
    expect(result.map((r) => r.month)).toEqual([
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ])

    const byMonth = Object.fromEntries(result.map((r) => [r.month, r.joins]))
    expect(byMonth).toEqual({
      Jan: 2, Feb: 0, Mar: 1, Apr: 0, May: 0, Jun: 0,
      Jul: 0, Aug: 0, Sep: 0, Oct: 0, Nov: 0, Dec: 1,
    })
  })

  it('returns 12 zero rows for an empty roster', () => {
    const result = computeSeasonality([])
    expect(result).toHaveLength(12)
    expect(result.every((r) => r.joins === 0)).toBe(true)
  })

  it('uses UTC month, not local time, for a date-only ISO string at midnight', () => {
    // A date-only ISO string parses as UTC midnight; getUTCMonth() must be
    // used (not getMonth()) so the bucket doesn't drift in negative-UTC-offset
    // timezones (e.g. US timezones would otherwise read this as the prior
    // month's last day in local time).
    const members: MemberLite[] = [
      { name: 'M1', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-07-01'), expires: null },
    ]
    const result = computeSeasonality(members)
    expect(result.find((r) => r.month === 'Jul')?.joins).toBe(1)
    expect(result.find((r) => r.month === 'Jun')?.joins).toBe(0)
  })
})

describe('computeCohortRetention', () => {
  it('groups by join-quarter, computes stillActive from current flag and retentionPct, including a 0-joined cohort', () => {
    const members: MemberLite[] = [
      // 2025-Q1: 2 joins, 1 still current -> 50%
      { name: 'M1', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-01-10'), expires: null },
      { name: 'M2', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: d('2025-02-15'), expires: d('2025-08-15') },
      // 2025-Q2: 0 joins (deliberately skipped, but must still appear as a row)
      // 2025-Q3: 1 join, still current -> 100%
      { name: 'M3', tier: 'Couple', current: true, membershipState: 'active', joinDate: d('2025-08-01'), expires: null },
      // 2025-Q4: 1 join, not current -> 0%
      { name: 'M4', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: d('2025-10-05'), expires: d('2026-04-05') },
    ]

    const result = computeCohortRetention(members)

    expect(result).toEqual([
      { cohort: '2025-Q1', joined: 2, stillActive: 1, retentionPct: 50 },
      { cohort: '2025-Q2', joined: 0, stillActive: 0, retentionPct: null },
      { cohort: '2025-Q3', joined: 1, stillActive: 1, retentionPct: 100 },
      { cohort: '2025-Q4', joined: 1, stillActive: 0, retentionPct: 0 },
    ])
  })

  it('excludes members with a null joinDate from every cohort', () => {
    const members: MemberLite[] = [
      { name: 'M1', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-01-10'), expires: null },
      { name: 'M2', tier: 'Single', current: true, membershipState: 'active', joinDate: null, expires: null },
    ]

    const result = computeCohortRetention(members)
    expect(result).toEqual([
      { cohort: '2025-Q1', joined: 1, stillActive: 1, retentionPct: 100 },
    ])
  })

  it('rounds retentionPct to one decimal place (round1 semantics)', () => {
    const members: MemberLite[] = [
      { name: 'M1', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-01-10'), expires: null },
      { name: 'M2', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: d('2025-02-15'), expires: d('2025-08-15') },
      { name: 'M3', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: d('2025-03-20'), expires: d('2025-09-20') },
    ]

    // 1 of 3 still active -> 33.333...% -> round1 -> 33.3
    const result = computeCohortRetention(members)
    expect(result).toEqual([{ cohort: '2025-Q1', joined: 3, stillActive: 1, retentionPct: 33.3 }])
  })

  it('returns an empty array when no member has a joinDate', () => {
    const members: MemberLite[] = [
      { name: 'M1', tier: 'Single', current: true, membershipState: 'active', joinDate: null, expires: null },
    ]
    expect(computeCohortRetention(members)).toEqual([])
  })
})
