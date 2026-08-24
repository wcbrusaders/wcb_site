import { test, expect } from 'vitest'
import { computeMembershipReports, getMembershipReports } from './index'
import type { MemberLite, PaymentLite } from './types'

const NOW = new Date('2026-08-24T00:00:00.000Z')

const members: MemberLite[] = [
  { name: 'Alice', tier: 'Single', current: true, membershipState: 'active', joinDate: new Date('2025-11-01'), expires: new Date('2026-11-01') },
  { name: 'Bob', tier: 'Couple', current: true, membershipState: 'active', joinDate: new Date('2024-02-10'), expires: new Date('2026-02-10') },
  { name: 'Carol', tier: 'Single', current: false, membershipState: 'lapsed', joinDate: new Date('2024-01-05'), expires: new Date('2025-06-01') },
]
const payments: PaymentLite[] = [
  { date: new Date('2025-11-02'), netDues: 30, source: 'Stripe' },
  { date: new Date('2024-02-11'), netDues: 65, source: 'PayPal' },
]

test('computeMembershipReports returns all six report sections + generatedAt', () => {
  const r = computeMembershipReports(members, payments, { now: NOW })
  // every section present and the right shape
  expect(r.kpis.activeMembers).toBe(2) // Alice + Bob current
  expect(r.kpis.lapsedAllTime).toBe(1) // Carol
  expect(Array.isArray(r.trends)).toBe(true)
  expect(r.tierMix).toEqual(expect.arrayContaining([{ tier: 'Single', count: 1 }, { tier: 'Couple', count: 1 }])) // current only: Alice(Single)+Bob(Couple); Carol lapsed excluded
  expect(r.seasonality).toHaveLength(12)
  expect(Array.isArray(r.cohorts)).toBe(true)
  expect(Array.isArray(r.revenue)).toBe(true)
  expect(r.generatedAt).toBe(NOW.toISOString())
})

test('getMembershipReports fetches via injected db then computes', async () => {
  const fakeDb = {
    member: { findMany: async () => members },
    payment: { findMany: async () => payments },
  } as any
  const r = await getMembershipReports({ db: fakeDb, now: NOW })
  expect(r.kpis.totalEver).toBe(3)
  expect(r.generatedAt).toBe(NOW.toISOString())
})
