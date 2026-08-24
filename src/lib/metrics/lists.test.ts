import { describe, it, expect } from 'vitest'
import { computeTenureLeaderboard, computeExpiringSoon, computePaymentMix, computeGrowthSummary } from './lists'
import type { TrendRow } from './trends'
import type { MemberLite, PaymentLite } from './types'

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

// Fixed "now" so tenureMonths / expiring windows are deterministic.
const NOW = d('2026-08-24')

describe('computeTenureLeaderboard', () => {
  const members: MemberLite[] = [
    // Current members, varied joinDates (earliest = longest-tenured first).
    { name: 'Alice Anderson', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2020-08-24'), expires: d('2027-08-24') }, // 72 complete months
    { name: 'Bob Baker', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2021-08-24'), expires: d('2027-08-24') }, // 60 complete months
    { name: 'Carla Cruz', tier: 'Couple', current: true, membershipState: 'active', joinDate: d('2022-08-24'), expires: d('2027-08-24') }, // 48 complete months
    { name: 'Dan Diaz', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2023-08-24'), expires: d('2027-08-24') }, // 36 complete months
    { name: 'Erin Evans', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-08-24'), expires: d('2027-08-24') }, // 24 complete months
    { name: 'Finn Foster', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2025-08-24'), expires: d('2027-08-24') }, // 12 complete months — would be 6th, dropped by limit=5
    // Non-current members with even earlier joinDates — must be EXCLUDED
    // despite being "longest tenured" by date, since they're not current.
    { name: 'Gina Gomez', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: d('2010-01-01'), expires: d('2011-01-01') },
    { name: 'Hank Hill', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: d('2012-01-01'), expires: d('2013-01-01') },
    // Current member with null joinDate — excluded (no tenure to compute).
    { name: 'Ivy Ingram', tier: 'Single', current: true, membershipState: 'active', joinDate: null, expires: d('2027-08-24') },
  ]

  it('returns top-5 current members sorted by earliest joinDate first, with completeMonths tenure', () => {
    const result = computeTenureLeaderboard(members, { now: NOW })

    expect(result).toEqual([
      { name: 'Alice Anderson', joinDate: '2020-08-24', tenureMonths: 72 },
      { name: 'Bob Baker', joinDate: '2021-08-24', tenureMonths: 60 },
      { name: 'Carla Cruz', joinDate: '2022-08-24', tenureMonths: 48 },
      { name: 'Dan Diaz', joinDate: '2023-08-24', tenureMonths: 36 },
      { name: 'Erin Evans', joinDate: '2024-08-24', tenureMonths: 24 },
    ])
  })

  it('respects a custom limit', () => {
    const result = computeTenureLeaderboard(members, { now: NOW }, 2)

    expect(result).toEqual([
      { name: 'Alice Anderson', joinDate: '2020-08-24', tenureMonths: 72 },
      { name: 'Bob Baker', joinDate: '2021-08-24', tenureMonths: 60 },
    ])
  })

  it('returns an empty list when no current members have a joinDate', () => {
    const noJoinDates: MemberLite[] = [
      { name: 'Ivy Ingram', tier: 'Single', current: true, membershipState: 'active', joinDate: null, expires: null },
    ]
    expect(computeTenureLeaderboard(noJoinDates, { now: NOW })).toEqual([])
  })
})

describe('computeExpiringSoon', () => {
  const members: MemberLite[] = [
    // Expired in the past — must be excluded (before window start).
    { name: 'Past Pat', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-01-01'), expires: d('2026-08-01') },
    // Expires today (now) — inclusive lower bound, daysLeft 0.
    { name: 'Today Tom', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-01-01'), expires: d('2026-08-24') },
    // Expires in 10 days — inside window.
    { name: 'Soon Sue', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-01-01'), expires: d('2026-09-03') },
    // Expires in 30 days — inside window.
    { name: 'Mid Mike', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-01-01'), expires: d('2026-09-23') },
    // Expires exactly at windowDays boundary (60 days out) — inclusive upper bound.
    { name: 'Edge Ed', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-01-01'), expires: d('2026-10-23') },
    // Expires 61 days out — just beyond window, excluded.
    { name: 'Beyond Bea', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-01-01'), expires: d('2026-10-24') },
    // Non-current member expiring inside window — excluded (not current).
    { name: 'Lapsed Lou', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: d('2024-01-01'), expires: d('2026-09-03') },
    // Current member with null expires — excluded.
    { name: 'Null Nora', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-01-01'), expires: null },
  ]

  it('returns current members expiring within [now, now+windowDays], soonest first, with daysLeft', () => {
    const result = computeExpiringSoon(members, { now: NOW, windowDays: 60 })

    expect(result).toEqual([
      { name: 'Today Tom', expires: '2026-08-24', daysLeft: 0 },
      { name: 'Soon Sue', expires: '2026-09-03', daysLeft: 10 },
      { name: 'Mid Mike', expires: '2026-09-23', daysLeft: 30 },
      { name: 'Edge Ed', expires: '2026-10-23', daysLeft: 60 },
    ])
  })

  it('returns an empty list when no current members fall in the window', () => {
    const noneInWindow: MemberLite[] = [
      { name: 'Far Fran', tier: 'Single', current: true, membershipState: 'active', joinDate: d('2024-01-01'), expires: d('2027-01-01') },
    ]
    expect(computeExpiringSoon(noneInWindow, { now: NOW, windowDays: 30 })).toEqual([])
  })

  it('supports a narrower 30-day window (excludes members outside it)', () => {
    const result = computeExpiringSoon(members, { now: NOW, windowDays: 30 })

    expect(result).toEqual([
      { name: 'Today Tom', expires: '2026-08-24', daysLeft: 0 },
      { name: 'Soon Sue', expires: '2026-09-03', daysLeft: 10 },
      { name: 'Mid Mike', expires: '2026-09-23', daysLeft: 30 },
    ])
  })
})

describe('computePaymentMix', () => {
  it('groups by source with count/total, sorted by count desc, plus avgDues and totalPayments', () => {
    const payments: PaymentLite[] = [
      { date: d('2026-01-10'), netDues: 45, source: 'Stripe' },
      { date: d('2026-02-10'), netDues: 45, source: 'Stripe' },
      { date: d('2026-03-10'), netDues: 40.5, source: 'Stripe' },
      { date: d('2026-04-10'), netDues: 50, source: 'PayPal' },
      { date: d('2026-05-10'), netDues: 33.33, source: 'PayPal' },
      { date: d('2026-06-10'), netDues: 100, source: 'Check' },
    ]
    // Stripe: count 3, total 45+45+40.5 = 130.5
    // PayPal: count 2, total 50+33.33 = 83.33
    // Check: count 1, total 100
    // all: sum = 130.5 + 83.33 + 100 = 313.83, count 6 -> avg 52.305 -> round2 52.31 (banker's-neutral half-up: 52.305*100=5230.5 -> round 5231 -> 52.31)

    const result = computePaymentMix(payments)

    expect(result.bySource).toEqual([
      { source: 'Stripe', count: 3, total: 130.5 },
      { source: 'PayPal', count: 2, total: 83.33 },
      { source: 'Check', count: 1, total: 100 },
    ])
    expect(result.totalPayments).toBe(6)
    expect(result.avgDues).toBe(52.31)
  })

  it('returns an empty summary when there are no payments', () => {
    expect(computePaymentMix([])).toEqual({ bySource: [], avgDues: 0, totalPayments: 0 })
  })

  it('rounds per-source totals to 2 decimal places', () => {
    const payments: PaymentLite[] = [
      { date: d('2026-01-10'), netDues: 10.005, source: 'Stripe' },
      { date: d('2026-02-10'), netDues: 10.005, source: 'Stripe' },
    ]
    // 10.005 + 10.005 = 20.01 exactly (float-safe sum for this fixture).
    const result = computePaymentMix(payments)
    expect(result.bySource).toEqual([{ source: 'Stripe', count: 2, total: 20.01 }])
    expect(result.avgDues).toBe(10.01) // 20.01 / 2 = 10.005 -> round2 -> 10.01 (JS float rounds up here)
  })
})

describe('computeGrowthSummary', () => {
  const tr = (quarter: string, activeEOQ: number, newCount: number, netGrowthPct: number | null): TrendRow => ({
    quarter, new: newCount, churn: 0, activeEOQ, turnoverPct: 0, retentionPct: 100,
    newYoyPct: null, netGrowthPct,
  })

  it('empty trends -> zeroed summary', () => {
    expect(computeGrowthSummary([])).toEqual({
      currentActive: 0, latestNetGrowthPct: null, recordActive: 0, recordActiveQuarter: null,
      atRecord: false, bestRecruitmentQuarter: null, bestRecruitmentNew: 0, consecutiveGrowthQuarters: 0,
    })
  })

  it('surfaces current active, record, best recruitment, and growth streak', () => {
    const trends = [
      tr('2025-Q1', 10, 3, null),   // first
      tr('2025-Q2', 9, 1, -10),     // dip (breaks any streak before it)
      tr('2025-Q3', 14, 6, 55.6),   // best recruitment (6) + growth
      tr('2025-Q4', 16, 3, 14.3),   // growth
      tr('2026-Q1', 16, 2, 0),      // flat -> NOT >0, breaks trailing streak
      tr('2026-Q2', 20, 5, 25),     // growth (record active = 20)
    ]
    const g = computeGrowthSummary(trends)
    expect(g.currentActive).toBe(20)
    expect(g.latestNetGrowthPct).toBe(25)
    expect(g.recordActive).toBe(20)
    expect(g.recordActiveQuarter).toBe('2026-Q2')
    expect(g.atRecord).toBe(true)
    expect(g.bestRecruitmentQuarter).toBe('2025-Q3')
    expect(g.bestRecruitmentNew).toBe(6)
    // trailing positive-growth run from the end: 2026-Q2(+25) then 2026-Q1(0) stops it -> 1
    expect(g.consecutiveGrowthQuarters).toBe(1)
  })

  it('counts a multi-quarter trailing growth streak', () => {
    const trends = [
      tr('2025-Q3', 14, 6, 55.6),
      tr('2025-Q4', 16, 3, 14.3),
      tr('2026-Q2', 20, 5, 25),
    ]
    // all three have netGrowthPct > 0 -> streak 3
    expect(computeGrowthSummary(trends).consecutiveGrowthQuarters).toBe(3)
  })
})
