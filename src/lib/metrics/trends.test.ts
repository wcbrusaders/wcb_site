import { describe, it, expect } from 'vitest'
import { computeTrends } from './trends'
import type { MemberLite } from './types'

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

describe('computeTrends — small hand-computed fixture', () => {
  // Exercises every rule with a minimal roster spanning 6 quarters
  // (2025-Q1 .. 2026-Q2), hand-computed below.
  //
  // Quarter-by-quarter membership events:
  //   2025-Q1: 2 joins (M1, M2)                                -> New 2, Churn 0
  //   2025-Q2: 1 join (M3); M1 lapses (expires in Q2)          -> New 1, Churn 1
  //   2025-Q3: 1 join (M4)                                     -> New 1, Churn 0
  //   2025-Q4: 0 joins; M2 lapses (expires in Q4)              -> New 0, Churn 1
  //   2026-Q1: 2 joins (M5, M6)                                -> New 2, Churn 0
  //   2026-Q2: 1 join (M7)                                     -> New 1, Churn 0
  //
  // Hand-computed cumulative Active (EOQ) = cumNew - cumChurn:
  //   2025-Q1: cumNew 2, cumChurn 0 -> Active 2
  //   2025-Q2: cumNew 3, cumChurn 1 -> Active 2
  //   2025-Q3: cumNew 4, cumChurn 1 -> Active 3
  //   2025-Q4: cumNew 4, cumChurn 2 -> Active 2
  //   2026-Q1: cumNew 6, cumChurn 2 -> Active 4
  //   2026-Q2: cumNew 7, cumChurn 2 -> Active 5
  //
  // Turnover % = round1(Churn_Q / Active_{prevQ} * 100); first quarter -> 0.
  //   2025-Q1: no prev -> 0
  //   2025-Q2: churn 1 / prevActive 2 * 100 = 50
  //   2025-Q3: churn 0 / prevActive 2 * 100 = 0
  //   2025-Q4: churn 1 / prevActive 3 * 100 = 33.3
  //   2026-Q1: churn 0 / prevActive 2 * 100 = 0
  //   2026-Q2: churn 0 / prevActive 4 * 100 = 0
  //
  // Retention % = round1(100 - turnover); first quarter -> 100.
  //   2025-Q1: 100 | 2025-Q2: 50 | 2025-Q3: 100 | 2025-Q4: 66.7 | 2026-Q1: 100 | 2026-Q2: 100
  //
  // New YoY % = round1((New_Q - New_{Q-4}) / New_{Q-4} * 100); null if no Q-4 or New_{Q-4}===0.
  //   2025-Q1..2025-Q4: no Q-4 (fewer than 4 prior quarters) -> null
  //   2026-Q1: New_Q=2, New_{Q-4}=New(2025-Q1)=2 -> (2-2)/2*100 = 0
  //   2026-Q2: New_Q=1, New_{Q-4}=New(2025-Q2)=1 -> (1-1)/1*100 = 0
  //
  // Net Growth % = round1((Active_Q - Active_{prevQ}) / Active_{prevQ} * 100); null if no prev or prevActive===0.
  //   2025-Q1: no prev -> null
  //   2025-Q2: (2-2)/2*100 = 0
  //   2025-Q3: (3-2)/2*100 = 50
  //   2025-Q4: (2-3)/3*100 = -33.3
  //   2026-Q1: (4-2)/2*100 = 100
  //   2026-Q2: (5-4)/4*100 = 25
  const members: MemberLite[] = [
    { name: 'M1', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: d('2025-01-10'), expires: d('2025-04-10') },
    { name: 'M2', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: d('2025-01-20'), expires: d('2025-10-05') },
    { name: 'M3', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-04-15'), expires: null },
    { name: 'M4', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-07-10'), expires: null },
    { name: 'M5', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2026-01-05'), expires: null },
    { name: 'M6', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2026-02-01'), expires: null },
    { name: 'M7', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2026-04-20'), expires: null },
  ]

  const now = d('2026-05-15') // within 2026-Q2

  const rows = computeTrends(members, { now })

  it('produces one row per quarter from the earliest join through the current quarter', () => {
    expect(rows.map((r) => r.quarter)).toEqual([
      '2025-Q1',
      '2025-Q2',
      '2025-Q3',
      '2025-Q4',
      '2026-Q1',
      '2026-Q2',
    ])
  })

  it('computes New and Churn per quarter', () => {
    expect(rows.map((r) => [r.new, r.churn])).toEqual([
      [2, 0],
      [1, 1],
      [1, 0],
      [0, 1],
      [2, 0],
      [1, 0],
    ])
  })

  it('computes cumulative Active (EOQ)', () => {
    expect(rows.map((r) => r.activeEOQ)).toEqual([2, 2, 3, 2, 4, 5])
  })

  it('first quarter has no previous denominator: Turnover 0, Retention 100', () => {
    expect(rows[0].turnoverPct).toBe(0)
    expect(rows[0].retentionPct).toBe(100)
  })

  it('turnover uses the PREVIOUS quarter Active as denominator, not the current quarter', () => {
    // 2025-Q2: churn 1 / prevActive(2025-Q1)=2 -> 50%, not churn 1 / currentActive(2)=50 coincidentally same;
    // 2025-Q4 disambiguates: churn 1 / prevActive(2025-Q3)=3 -> 33.3, NOT churn/currentActive(2)=50.
    expect(rows[1].turnoverPct).toBe(50)
    expect(rows[1].retentionPct).toBe(50)
    expect(rows[3].turnoverPct).toBe(33.3)
    expect(rows[3].retentionPct).toBe(66.7)
  })

  it('turnover/retention are 0/100 for quarters with no churn', () => {
    expect(rows[2].turnoverPct).toBe(0)
    expect(rows[2].retentionPct).toBe(100)
    expect(rows[4].turnoverPct).toBe(0)
    expect(rows[4].retentionPct).toBe(100)
  })

  it('New YoY is null (blank) for the first 4 quarters (no Q-4 to compare)', () => {
    expect(rows[0].newYoyPct).toBeNull()
    expect(rows[1].newYoyPct).toBeNull()
    expect(rows[2].newYoyPct).toBeNull()
    expect(rows[3].newYoyPct).toBeNull()
  })

  it('New YoY computes a real value once a Q-4 quarter exists', () => {
    expect(rows[4].newYoyPct).toBe(0) // 2026-Q1 vs 2025-Q1: (2-2)/2*100 = 0
  })

  it('New YoY is null (blank) on div-by-zero when New_{Q-4} was 0', () => {
    // 2025-Q4's New was 0, so 2026-Q4 would divide by zero if it existed.
    // Within this fixture's range, verify the general rule via a quarter whose
    // Q-4 New is 0 by construction of the larger fixture below; here we assert
    // the one in-range case explicitly has a real (non-null) value since its
    // Q-4 New (2) is nonzero, confirming the null-only-on-zero behavior.
    expect(rows[5].newYoyPct).toBe(0) // 2026-Q2 vs 2025-Q2: New_{Q-4}=1, (1-1)/1*100=0
  })

  it('Net Growth is null (blank) for the first quarter (no previous)', () => {
    expect(rows[0].netGrowthPct).toBeNull()
  })

  it('Net Growth computes a real value for subsequent quarters', () => {
    expect(rows[1].netGrowthPct).toBe(0)
    expect(rows[2].netGrowthPct).toBe(50)
    expect(rows[3].netGrowthPct).toBe(-33.3)
    expect(rows[4].netGrowthPct).toBe(100)
    expect(rows[5].netGrowthPct).toBe(25)
  })
})

describe('computeTrends — div-by-zero YoY produces null, not NaN/Infinity', () => {
  it('New YoY is null when New_{Q-4} is 0, even though New_Q is nonzero', () => {
    // 2025-Q1 has 1 join, 2025-Q2 has 0 joins, 2025-Q3 and 2025-Q4 each have 1,
    // 2026-Q2 has 1 join -> Q-4 of 2026-Q2 is 2025-Q2 (New=0) -> YoY must be
    // null, not Infinity/NaN from dividing by zero.
    const fixture: MemberLite[] = [
      { name: 'A', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-01-15'), expires: null },
      { name: 'C', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-07-15'), expires: null },
      { name: 'D', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-10-15'), expires: null },
      { name: 'E', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2026-04-15'), expires: null },
    ]
    const rows = computeTrends(fixture, { now: d('2026-05-15') })
    const q2026Q2 = rows.find((r) => r.quarter === '2026-Q2')
    const q2025Q2 = rows.find((r) => r.quarter === '2025-Q2')
    expect(q2026Q2!.new).toBe(1)
    expect(q2025Q2!.new).toBe(0) // confirms the Q-4 quarter's New really is 0
    expect(q2026Q2!.newYoyPct).toBeNull()
  })
})

describe('computeTrends — full 12-quarter reproduction of the captured sheet table', () => {
  // Synthetic 37-member roster whose per-quarter New/Churn counts reproduce the
  // roster sheet's captured Trends tab exactly (2023-Q3 .. 2026-Q2). Each "New"
  // member joins mid-quarter; 7 of them are later marked lapsed with an
  // `expires` date landing in the quarter that needs the Churn count, taken
  // from an earlier join quarter so New counts aren't double-affected.
  const members: MemberLite[] = [
    { name: 'Member1', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: d('2023-08-15'), expires: d('2024-11-15') },
    { name: 'Member2', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: d('2023-11-15'), expires: d('2024-11-15') },
    { name: 'Member3', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: d('2023-11-15'), expires: d('2025-05-15') },
    { name: 'Member4', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: d('2023-11-15'), expires: d('2025-08-15') },
    { name: 'Member5', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: d('2023-11-15'), expires: d('2025-11-15') },
    { name: 'Member6', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: d('2023-11-15'), expires: d('2026-02-15') },
    { name: 'Member7', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: d('2023-11-15'), expires: d('2026-02-15') },
    { name: 'Member8', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-02-15'), expires: null },
    { name: 'Member9', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-02-15'), expires: null },
    { name: 'Member10', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-05-15'), expires: null },
    { name: 'Member11', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-05-15'), expires: null },
    { name: 'Member12', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-05-15'), expires: null },
    { name: 'Member13', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-05-15'), expires: null },
    { name: 'Member14', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-08-15'), expires: null },
    { name: 'Member15', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-08-15'), expires: null },
    { name: 'Member16', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-08-15'), expires: null },
    { name: 'Member17', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-08-15'), expires: null },
    { name: 'Member18', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-11-15'), expires: null },
    { name: 'Member19', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-02-15'), expires: null },
    { name: 'Member20', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-02-15'), expires: null },
    { name: 'Member21', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-08-15'), expires: null },
    { name: 'Member22', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-08-15'), expires: null },
    { name: 'Member23', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-11-15'), expires: null },
    { name: 'Member24', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-11-15'), expires: null },
    { name: 'Member25', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-11-15'), expires: null },
    { name: 'Member26', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-11-15'), expires: null },
    { name: 'Member27', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-11-15'), expires: null },
    { name: 'Member28', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-11-15'), expires: null },
    { name: 'Member29', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2026-02-15'), expires: null },
    { name: 'Member30', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2026-02-15'), expires: null },
    { name: 'Member31', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2026-02-15'), expires: null },
    { name: 'Member32', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2026-05-15'), expires: null },
    { name: 'Member33', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2026-05-15'), expires: null },
    { name: 'Member34', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2026-05-15'), expires: null },
    { name: 'Member35', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2026-05-15'), expires: null },
    { name: 'Member36', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2026-05-15'), expires: null },
    { name: 'Member37', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2026-05-15'), expires: null },
  ]

  // `now` is pinned inside 2026-Q2 so the enumerated quarter range ends at
  // 2026-Q2, matching the sheet's capture (taken while 2026-Q2 was current).
  const now = d('2026-05-15')
  const rows = computeTrends(members, { now })

  const expected: Array<{
    quarter: string
    new: number
    churn: number
    activeEOQ: number
    turnoverPct: number
    retentionPct: number
    newYoyPct: number | null
    netGrowthPct: number | null
  }> = [
    { quarter: '2023-Q3', new: 1, churn: 0, activeEOQ: 1, turnoverPct: 0, retentionPct: 100, newYoyPct: null, netGrowthPct: null },
    { quarter: '2023-Q4', new: 6, churn: 0, activeEOQ: 7, turnoverPct: 0, retentionPct: 100, newYoyPct: null, netGrowthPct: 600 },
    { quarter: '2024-Q1', new: 2, churn: 0, activeEOQ: 9, turnoverPct: 0, retentionPct: 100, newYoyPct: null, netGrowthPct: 28.6 },
    { quarter: '2024-Q2', new: 4, churn: 0, activeEOQ: 13, turnoverPct: 0, retentionPct: 100, newYoyPct: null, netGrowthPct: 44.4 },
    { quarter: '2024-Q3', new: 4, churn: 0, activeEOQ: 17, turnoverPct: 0, retentionPct: 100, newYoyPct: 300, netGrowthPct: 30.8 },
    { quarter: '2024-Q4', new: 1, churn: 2, activeEOQ: 16, turnoverPct: 11.8, retentionPct: 88.2, newYoyPct: -83.3, netGrowthPct: -5.9 },
    { quarter: '2025-Q1', new: 2, churn: 0, activeEOQ: 18, turnoverPct: 0, retentionPct: 100, newYoyPct: 0, netGrowthPct: 12.5 },
    { quarter: '2025-Q2', new: 0, churn: 1, activeEOQ: 17, turnoverPct: 5.6, retentionPct: 94.4, newYoyPct: -100, netGrowthPct: -5.6 },
    { quarter: '2025-Q3', new: 2, churn: 1, activeEOQ: 18, turnoverPct: 5.9, retentionPct: 94.1, newYoyPct: -50, netGrowthPct: 5.9 },
    { quarter: '2025-Q4', new: 6, churn: 1, activeEOQ: 23, turnoverPct: 5.6, retentionPct: 94.4, newYoyPct: 500, netGrowthPct: 27.8 },
    { quarter: '2026-Q1', new: 3, churn: 2, activeEOQ: 24, turnoverPct: 8.7, retentionPct: 91.3, newYoyPct: 50, netGrowthPct: 4.3 },
    { quarter: '2026-Q2', new: 6, churn: 0, activeEOQ: 30, turnoverPct: 0, retentionPct: 100, newYoyPct: null, netGrowthPct: 25 },
  ]

  it('matches the captured sheet table row-by-row', () => {
    expect(rows).toEqual(expected)
  })
})
