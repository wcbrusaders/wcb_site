import { describe, it, expect } from 'vitest'
import { computeRevenue } from './revenue'
import type { MemberLite, PaymentLite } from './types'

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

function member(name: string, joinDate: string | null): MemberLite {
  return {
    name,
    tier: 'Single',
    current: true,
    membershipState: 'active',
    joinDate: joinDate ? d(joinDate) : null,
    expires: null,
  }
}

function payment(date: string, netDues: number): PaymentLite {
  return { date: d(date), netDues, source: 'test' }
}

describe('computeRevenue — small hand-computed fixture', () => {
  // Quarters exercised (2025-Q1 .. 2026-Q2), hand-computed below:
  //
  // 2025-Q1: payments 60.00 + 20.00 = 80.00 (2 payments); joins: M1, M2 (2 new)
  //          -> duesPayments 2, newMembers 2, renewals max(0, 2-2)=0
  // 2025-Q2: payments 30.00 + 30.00 + 30.00 = 90.00 (3 payments); joins: M3 (1 new)
  //          -> duesPayments 3, newMembers 1, renewals max(0, 3-1)=2
  //          (more payments than new joins -> renewals > 0, mirrors 2025-Q1 capture)
  // 2025-Q3: payments 45.00 (1 payment); joins: M4, M5 (2 new)
  //          -> duesPayments 1, newMembers 2, renewals max(0, 1-2)=0
  //          (payments < new joins -> renewals floors at 0, not negative)
  // 2025-Q4: NO payments; joins: M6 (1 new)
  //          -> duesPayments 0, newMembers 1, renewals max(0, 0-1)=0
  // 2026-Q1: payments 25.50 (1 payment); NO joins
  //          -> duesPayments 1, newMembers 0, renewals max(0, 1-0)=1
  //          (payments but 0 joins -> renewals === duesPayments)
  // 2026-Q2: payments 10.00 + 10.00 = 20.00 (2 payments); joins: M7, M8 (2 new)
  //          -> duesPayments 2, newMembers 2, renewals max(0, 2-2)=0 (new === payments)
  const members: MemberLite[] = [
    member('M1', '2025-01-10'),
    member('M2', '2025-02-20'),
    member('M3', '2025-05-15'),
    member('M4', '2025-07-05'),
    member('M5', '2025-09-25'),
    member('M6', '2025-11-11'),
    member('M7', '2026-04-01'),
    member('M8', '2026-06-30'),
  ]

  const payments: PaymentLite[] = [
    payment('2025-01-15', 60.0),
    payment('2025-03-01', 20.0),
    payment('2025-04-10', 30.0),
    payment('2025-05-20', 30.0),
    payment('2025-06-15', 30.0),
    payment('2025-08-01', 45.0),
    payment('2026-02-14', 25.5),
    payment('2026-05-01', 10.0),
    payment('2026-06-01', 10.0),
  ]

  const now = d('2026-06-15') // within 2026-Q2

  const rows = computeRevenue(members, payments, { now })

  it('produces one row per quarter from the earliest of (first payment, first join) through now', () => {
    expect(rows.map((r) => r.quarter)).toEqual([
      '2025-Q1',
      '2025-Q2',
      '2025-Q3',
      '2025-Q4',
      '2026-Q1',
      '2026-Q2',
    ])
  })

  it('sums netDues per quarter to 2 decimal places', () => {
    expect(rows.map((r) => r.netDues)).toEqual([80.0, 90.0, 45.0, 0, 25.5, 20.0])
  })

  it('eventsIncome is always 0 (no source yet)', () => {
    expect(rows.every((r) => r.eventsIncome === 0)).toBe(true)
  })

  it('totalRevenue equals netDues (since eventsIncome is 0)', () => {
    expect(rows.map((r) => r.totalRevenue)).toEqual(rows.map((r) => r.netDues))
  })

  it('counts duesPayments per quarter', () => {
    expect(rows.map((r) => r.duesPayments)).toEqual([2, 3, 1, 0, 1, 2])
  })

  it('counts newMembers per quarter as ALL members whose joinDate falls in the quarter, regardless of payer', () => {
    expect(rows.map((r) => r.newMembers)).toEqual([2, 1, 2, 1, 0, 2])
  })

  it('renewals = max(0, duesPayments - newMembers): more payments than joins -> renewals > 0', () => {
    // 2025-Q2: 3 payments, 1 new -> 2 renewals.
    const q = rows.find((r) => r.quarter === '2025-Q2')!
    expect(q.duesPayments).toBe(3)
    expect(q.newMembers).toBe(1)
    expect(q.renewals).toBe(2)
  })

  it('renewals = 0 when newMembers equals duesPayments', () => {
    // 2025-Q1: 2 payments, 2 new -> 0 renewals. 2026-Q2: 2 payments, 2 new -> 0 renewals.
    const q1 = rows.find((r) => r.quarter === '2025-Q1')!
    expect(q1.duesPayments).toBe(2)
    expect(q1.newMembers).toBe(2)
    expect(q1.renewals).toBe(0)

    const q2 = rows.find((r) => r.quarter === '2026-Q2')!
    expect(q2.duesPayments).toBe(2)
    expect(q2.newMembers).toBe(2)
    expect(q2.renewals).toBe(0)
  })

  it('renewals floors at 0 (never negative) when newMembers exceeds duesPayments', () => {
    // 2025-Q3: 1 payment, 2 new -> max(0, 1-2) = 0, not -1.
    const q = rows.find((r) => r.quarter === '2025-Q3')!
    expect(q.duesPayments).toBe(1)
    expect(q.newMembers).toBe(2)
    expect(q.renewals).toBe(0)
  })

  it('renewals equals duesPayments when a quarter has payments but 0 joins', () => {
    // 2026-Q1: 1 payment, 0 new -> renewals 1.
    const q = rows.find((r) => r.quarter === '2026-Q1')!
    expect(q.duesPayments).toBe(1)
    expect(q.newMembers).toBe(0)
    expect(q.renewals).toBe(1)
  })

  it('a quarter with 0 payments and some joins has duesPayments 0 and renewals 0', () => {
    // 2025-Q4: 0 payments, 1 new -> duesPayments 0, renewals max(0, 0-1) = 0.
    const q = rows.find((r) => r.quarter === '2025-Q4')!
    expect(q.duesPayments).toBe(0)
    expect(q.newMembers).toBe(1)
    expect(q.renewals).toBe(0)
    expect(q.netDues).toBe(0)
    expect(q.totalRevenue).toBe(0)
  })
})

describe('computeRevenue — captured sheet values (real data pattern)', () => {
  // Reproduces the exact captured rows from the live roster sheet's Revenue
  // tab, confirming renewals = duesPayments - newMembers against real
  // combinations (not just the small hand-fixture above).
  //   2023-Q4: netDues 178.89, 6 payments, 6 new -> renewals 0
  //   2024-Q1: netDues 56.46,  2 payments, 2 new -> renewals 0
  //   2024-Q2: netDues 174.73, 4 payments, 4 new -> renewals 0
  //   2025-Q1: netDues 329.64, 8 payments, 2 new -> renewals 6
  //   2025-Q4: netDues 343.59, 9 payments, 6 new -> renewals 3
  //   2026-Q1: netDues 215.08, 5 payments, 3 new -> renewals 2
  //   2026-Q2: netDues 406.36, 10 payments, 6 new -> renewals 4
  function paymentsSummingTo(prefix: string, quarterStartIso: string, amounts: number[]): PaymentLite[] {
    // Spread payments across distinct days within the quarter so each is a
    // distinct payment row; exact day doesn't matter, only that it's in-range.
    return amounts.map((amt, i) => {
      const start = new Date(quarterStartIso)
      const dt = new Date(start.getTime() + i * 24 * 60 * 60 * 1000)
      return { date: dt, netDues: amt, source: `${prefix}${i}` }
    })
  }

  function joiners(names: string[], joinDateIso: string): MemberLite[] {
    return names.map((name, i) => {
      const start = new Date(joinDateIso)
      const dt = new Date(start.getTime() + i * 24 * 60 * 60 * 1000)
      return {
        name,
        tier: 'Single',
        current: true,
        membershipState: 'active',
        joinDate: dt,
        expires: null,
      }
    })
  }

  const members: MemberLite[] = [
    ...joiners(['A1', 'A2', 'A3', 'A4', 'A5', 'A6'], '2023-10-05T00:00:00.000Z'), // 2023-Q4: 6 new
    ...joiners(['B1', 'B2'], '2024-01-10T00:00:00.000Z'), // 2024-Q1: 2 new
    ...joiners(['C1', 'C2', 'C3', 'C4'], '2024-04-10T00:00:00.000Z'), // 2024-Q2: 4 new
    ...joiners(['D1', 'D2'], '2025-01-10T00:00:00.000Z'), // 2025-Q1: 2 new
    ...joiners(['E1', 'E2', 'E3', 'E4', 'E5', 'E6'], '2025-10-05T00:00:00.000Z'), // 2025-Q4: 6 new
    ...joiners(['F1', 'F2', 'F3'], '2026-01-10T00:00:00.000Z'), // 2026-Q1: 3 new
    ...joiners(['G1', 'G2', 'G3', 'G4', 'G5', 'G6'], '2026-04-05T00:00:00.000Z'), // 2026-Q2: 6 new
  ]

  const payments: PaymentLite[] = [
    ...paymentsSummingTo('q4-23-', '2023-10-01T00:00:00.000Z', [29.82, 29.82, 29.82, 29.81, 29.81, 29.81]), // sums to 178.89, 6 payments
    ...paymentsSummingTo('q1-24-', '2024-01-05T00:00:00.000Z', [28.23, 28.23]), // 56.46, 2 payments
    ...paymentsSummingTo('q2-24-', '2024-04-05T00:00:00.000Z', [43.69, 43.68, 43.68, 43.68]), // 174.73, 4 payments
    ...paymentsSummingTo('q1-25-', '2025-01-05T00:00:00.000Z', [41.21, 41.21, 41.21, 41.21, 41.2, 41.2, 41.2, 41.2]), // 329.64, 8 payments
    ...paymentsSummingTo('q4-25-', '2025-10-01T00:00:00.000Z', [
      38.18, 38.18, 38.18, 38.18, 38.18, 38.18, 38.17, 38.17, 38.17,
    ]), // 343.59, 9 payments
    ...paymentsSummingTo('q1-26-', '2026-01-05T00:00:00.000Z', [43.02, 43.02, 43.02, 43.01, 43.01]), // 215.08, 5 payments
    ...paymentsSummingTo('q2-26-', '2026-04-05T00:00:00.000Z', [
      40.64, 40.64, 40.64, 40.64, 40.64, 40.64, 40.63, 40.63, 40.63, 40.63,
    ]), // 406.36, 10 payments
  ]

  const now = d('2026-06-15')

  const rows = computeRevenue(members, payments, { now })
  const byQuarter = new Map(rows.map((r) => [r.quarter, r]))

  it.each([
    ['2023-Q4', 178.89, 6, 6, 0],
    ['2024-Q1', 56.46, 2, 2, 0],
    ['2024-Q2', 174.73, 4, 4, 0],
    ['2025-Q1', 329.64, 8, 2, 6],
    ['2025-Q4', 343.59, 9, 6, 3],
    ['2026-Q1', 215.08, 5, 3, 2],
    ['2026-Q2', 406.36, 10, 6, 4],
  ] as const)('%s: netDues %f, duesPayments %i, newMembers %i, renewals %i', (quarter, netDues, duesPayments, newMembers, renewals) => {
    const row = byQuarter.get(quarter)
    expect(row, `expected a row for ${quarter}`).toBeDefined()
    expect(row!.netDues).toBe(netDues)
    expect(row!.duesPayments).toBe(duesPayments)
    expect(row!.newMembers).toBe(newMembers)
    expect(row!.renewals).toBe(renewals)
    expect(row!.eventsIncome).toBe(0)
    expect(row!.totalRevenue).toBe(netDues)
  })
})

describe('computeRevenue — edge cases', () => {
  it('returns an empty array when there are no members and no payments', () => {
    expect(computeRevenue([], [], { now: d('2026-01-01') })).toEqual([])
  })

  it('rounds netDues to 2 decimal places even with floating-point-prone sums', () => {
    const members: MemberLite[] = [member('M1', '2025-01-10')]
    const payments: PaymentLite[] = [
      payment('2025-01-01', 0.1),
      payment('2025-01-02', 0.2),
    ]
    const rows = computeRevenue(members, payments, { now: d('2025-01-15') })
    const q1 = rows.find((r) => r.quarter === '2025-Q1')!
    expect(q1.netDues).toBe(0.3)
  })

  it('starts enumeration at the earliest of (first payment date, first joinDate)', () => {
    // Payment predates any join.
    const members: MemberLite[] = [member('M1', '2025-06-01')]
    const payments: PaymentLite[] = [payment('2025-01-15', 10)]
    const rows = computeRevenue(members, payments, { now: d('2025-06-15') })
    expect(rows[0].quarter).toBe('2025-Q1')
    expect(rows.map((r) => r.quarter)).toEqual(['2025-Q1', '2025-Q2'])
  })

  it('members with a null joinDate are excluded from newMembers counts', () => {
    const members: MemberLite[] = [member('M1', null), member('M2', '2025-02-01')]
    const payments: PaymentLite[] = [payment('2025-02-10', 10)]
    const rows = computeRevenue(members, payments, { now: d('2025-03-01') })
    const q1 = rows.find((r) => r.quarter === '2025-Q1')!
    expect(q1.newMembers).toBe(1)
  })
})
