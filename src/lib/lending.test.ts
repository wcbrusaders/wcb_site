import { test, expect } from 'vitest'
import { coverUrl, listTitles } from './lending'
import { checkoutTitle } from './lending'
import { returnLoan, renewLoan, canRenew, RENEW_CAP } from './lending'

test('coverUrl: valid ISBN -> Open Library URL; trims; null/blank -> null', () => {
  expect(coverUrl(' 9780312429980 ')).toBe('https://covers.openlibrary.org/b/isbn/9780312429980-L.jpg')
  expect(coverUrl(null)).toBeNull()
  expect(coverUrl('')).toBeNull()
})

test('listTitles: per-title available/total counts, excludes all-archived, maps my active loan', async () => {
  // title T1: 3 copies (1 available, 1 out to me, 1 out to other) -> available 1 / total 3, myLoan set
  // title T2: 2 copies both archived -> excluded
  const titles = [
    { id: 'T1', category: 'book', title: 'Dune', description: null, author: 'H', isbn: '111', notes: null,
      copies: [
        { id: 'c1', status: 'available', loans: [] },
        { id: 'c2', status: 'out', loans: [{ id: 'L2', copyId: 'c2', memberId: 'me', dueAt: new Date('2027-01-01'), renewedCount: 1, returnedAt: null }] },
        { id: 'c3', status: 'out', loans: [{ id: 'L3', copyId: 'c3', memberId: 'other', dueAt: new Date('2027-01-01'), renewedCount: 0, returnedAt: null }] },
      ] },
    { id: 'T2', category: 'book', title: 'Gone', description: null, author: null, isbn: null, notes: null,
      copies: [] }, // Prisma filtered out archived copies
  ]
  const db = { loanableItem: { findMany: async ({ where }: any) => {
    expect(where.category).toBe('book')
    return titles
  } } } as any
  const out = await listTitles('book', 'me', {}, { db })
  expect(out.map(t => t.id)).toEqual(['T1']) // T2 all-archived -> excluded
  expect(out[0].availableCount).toBe(1)
  expect(out[0].totalCount).toBe(3) // non-archived copies only (c1,c2,c3 are non-archived => 3)
  expect(out[0].myLoan?.loanId).toBe('L2')
})

function fakeCheckoutDb(category: string, availableCopyIds: string[], claimable: Set<string>) {
  const created: any[] = []
  const flipped: string[] = []
  return {
    _created: created, _flipped: flipped,
    loanableItem: { findUnique: async () => ({ id: 'T1', category }) },
    copy: {
      findMany: async ({ where }: any) => {
        expect(where.itemId).toBe('T1'); expect(where.status).toBe('available')
        return availableCopyIds.map(id => ({ id }))
      },
      updateMany: async ({ where }: any) => {
        // claim succeeds only if this copy is in `claimable`
        if (where.status === 'available' && claimable.has(where.id)) { flipped.push(where.id); return { count: 1 } }
        return { count: 0 }
      },
    },
    loan: { create: async ({ data }: any) => { created.push(data); return { id: 'L1', ...data } } },
    $transaction: async (fn: any) => fn({
      copy: { updateMany: async ({ where }: any) => (where.status === 'available' && claimable.has(where.id) ? (flipped.push(where.id), { count: 1 }) : { count: 0 }) },
      loan: { create: async ({ data }: any) => { created.push(data); return { id: 'L1', ...data } } },
    }),
  } as any
}

const NOW = new Date('2026-08-10T00:00:00Z')

test('checkoutTitle: book with an available copy -> claims it, loan created, dueAt now+30d', async () => {
  const db = fakeCheckoutDb('book', ['c1', 'c2'], new Set(['c1']))
  const r = await checkoutTitle('T1', 'm1', {}, { db, now: NOW })
  expect(r.ok).toBe(true)
  if (r.ok) { expect(r.copyId).toBe('c1'); expect(r.dueAt.toISOString().slice(0,10)).toBe('2026-09-09') }
  expect(db._created[0].conditionOut).toBeUndefined()
})

test('checkoutTitle: race — first candidate lost, retries next available copy', async () => {
  const db = fakeCheckoutDb('book', ['c1', 'c2'], new Set(['c2'])) // c1 not claimable (taken), c2 is
  const r = await checkoutTitle('T1', 'm1', {}, { db, now: NOW })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.copyId).toBe('c2')
})

test('checkoutTitle: no copies claimable -> unavailable, no loan', async () => {
  const db = fakeCheckoutDb('book', ['c1'], new Set()) // c1 lost the race
  const r = await checkoutTitle('T1', 'm1', {}, { db, now: NOW })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.reason).toBe('unavailable')
  expect(db._created.length).toBe(0)
})

test('checkoutTitle: equipment records conditionOut, dueAt now+14d', async () => {
  const db = fakeCheckoutDb('equipment', ['c1'], new Set(['c1']))
  const r = await checkoutTitle('T1', 'm1', { conditionOut: 'Good', noteOut: 'clean' }, { db, now: NOW })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.dueAt.toISOString().slice(0,10)).toBe('2026-08-24')
  expect(db._created[0].conditionOut).toBe('Good')
})

function fakeLoanDb(loan: any) {
  const upd: any = { loan: {}, copy: {} }
  return {
    _upd: upd,
    loan: { findUnique: async () => loan, update: async ({ data }: any) => { Object.assign(upd.loan, data); return { ...loan, ...data } } },
    copy: { update: async ({ data }: any) => { Object.assign(upd.copy, data); return data } },
  } as any
}

test('returnLoan: holder returns equipment -> returnedAt set, copy available + currentCondition updated', async () => {
  const loan = { id: 'L1', copyId: 'c1', memberId: 'm1', returnedAt: null, copy: { id: 'c1', item: { category: 'equipment' } } }
  const db = fakeLoanDb(loan)
  const r = await returnLoan('L1', 'm1', false, { conditionIn: 'Fair', noteIn: 'scuffed' }, { db, now: new Date('2026-08-10') })
  expect(r.ok).toBe(true)
  expect(db._upd.loan.conditionIn).toBe('Fair')
  expect(db._upd.copy.status).toBe('available')
  expect(db._upd.copy.currentCondition).toBe('Fair')
})

test('returnLoan: non-holder non-board -> forbidden, no change', async () => {
  const loan = { id: 'L1', copyId: 'c1', memberId: 'm1', returnedAt: null, copy: { id: 'c1', item: { category: 'book' } } }
  const db = fakeLoanDb(loan)
  const r = await returnLoan('L1', 'other', false, {}, { db })
  expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe('forbidden')
  expect(db._upd.loan.returnedAt).toBeUndefined()
})

test('returnLoan: board returns anyone', async () => {
  const loan = { id: 'L1', copyId: 'c1', memberId: 'm1', returnedAt: null, copy: { id: 'c1', item: { category: 'book' } } }
  const db = fakeLoanDb(loan)
  expect((await returnLoan('L1', 'officer', true, {}, { db, now: new Date('2026-08-10') })).ok).toBe(true)
})

test('renewLoan: holder under cap -> extends dueAt +30d (book), bumps count', async () => {
  const loan = { id: 'L1', copyId: 'c1', memberId: 'm1', returnedAt: null, renewedCount: 0, dueAt: new Date('2026-08-20'), copy: { id: 'c1', item: { category: 'book' } } }
  const db = fakeLoanDb(loan)
  const r = await renewLoan('L1', 'm1', { db })
  expect(r.ok).toBe(true); if (r.ok) expect(r.dueAt.toISOString().slice(0,10)).toBe('2026-09-19')
  expect(db._upd.loan.renewedCount).toBe(1)
})

test('renewLoan: at cap -> cap_reached, no change', async () => {
  const loan = { id: 'L1', copyId: 'c1', memberId: 'm1', returnedAt: null, renewedCount: RENEW_CAP, dueAt: new Date('2026-08-20'), copy: { id: 'c1', item: { category: 'book' } } }
  const db = fakeLoanDb(loan)
  const r = await renewLoan('L1', 'm1', { db })
  expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe('cap_reached')
  expect(db._upd.loan.renewedCount).toBeUndefined()
})

test('canRenew: seam returns true', () => { expect(canRenew({ id: 'c1' })).toBe(true) })
