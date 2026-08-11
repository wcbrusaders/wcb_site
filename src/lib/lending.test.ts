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
  expect(out[0].archivableCopyId).toBe('c1') // one available copy -> archivable
})

test('listTitles: no available copies -> archivableCopyId null', async () => {
  const titles = [
    { id: 'T1', category: 'book', title: 'Dune', description: null, author: 'H', isbn: '111', notes: null,
      copies: [
        { id: 'c2', status: 'out', loans: [{ id: 'L2', copyId: 'c2', memberId: 'me', dueAt: new Date('2027-01-01'), renewedCount: 1, returnedAt: null }] },
      ] },
  ]
  const db = { loanableItem: { findMany: async () => titles } } as any
  const out = await listTitles('book', 'me', {}, { db })
  expect(out[0].archivableCopyId).toBeNull()
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
  const txLike = {
    loan: { update: async ({ data }: any) => { Object.assign(upd.loan, data); return { ...loan, ...data } } },
    copy: { update: async ({ data }: any) => { Object.assign(upd.copy, data); return data } },
  }
  return {
    _upd: upd,
    loan: { findUnique: async () => loan, update: txLike.loan.update },
    copy: { update: txLike.copy.update },
    $transaction: async (fn: any) => fn(txLike),
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

import { addTitle, archiveCopy } from './lending'

test('addTitle: creates title + N available copies with addedById', async () => {
  let title: any = null; const copies: any[] = []
  const db = { loanableItem: { create: async ({ data }: any) => { title = data; return { id: 'T1' } } },
    copy: { create: async ({ data }: any) => { copies.push(data); return { id: 'c' + copies.length } } } } as any
  const r = await addTitle({ category: 'book', title: 'Dune', author: 'H', isbn: '1', copies: 3 }, 'officer', { db })
  expect(r.id).toBe('T1')
  expect(title.addedById).toBe('officer')
  expect(copies.length).toBe(3)
  expect(copies.every(c => c.status === 'available' && c.itemId === 'T1')).toBe(true)
})

test('addTitle: defaults to 1 copy; equipment seeds currentCondition', async () => {
  const copies: any[] = []
  const db = { loanableItem: { create: async () => ({ id: 'T1' }) },
    copy: { create: async ({ data }: any) => { copies.push(data); return { id: 'c1' } } } } as any
  await addTitle({ category: 'equipment', title: 'pH Meter', initialCondition: 'New' }, 'officer', { db })
  expect(copies.length).toBe(1)
  expect(copies[0].currentCondition).toBe('New')
})

test('archiveCopy: available -> archived; out -> blocked (no update)', async () => {
  const okDb = { copy: { findUnique: async () => ({ id: 'c1', status: 'available' }), update: async ({ data }: any) => data } } as any
  expect((await archiveCopy('c1', { db: okDb })).ok).toBe(true)
  let updated = false
  const outDb = { copy: { findUnique: async () => ({ id: 'c1', status: 'out' }), update: async () => { updated = true; return {} } } } as any
  const r = await archiveCopy('c1', { db: outDb })
  expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe('out')
  expect(updated).toBe(false)
})

import { EQUIPMENT_SUBCATEGORIES } from './lending'

test('EQUIPMENT_SUBCATEGORIES: 8 categories, Other is last', () => {
  expect(EQUIPMENT_SUBCATEGORIES.length).toBe(8)
  expect(EQUIPMENT_SUBCATEGORIES[EQUIPMENT_SUBCATEGORIES.length - 1]).toBe('Other')
  expect(EQUIPMENT_SUBCATEGORIES[0]).toBe('Kegging & Serving')
})

test('listTitles: returns subcategory on each title', async () => {
  const rows = [{ id:'i1', category:'equipment', title:'CO2 regulator', description:null, author:null, isbn:null, notes:null, subcategory:'Kegging & Serving',
    copies:[{ id:'c1', status:'available', loans:[] }] }]
  const db = { loanableItem: { findMany: async () => rows } } as any
  const out = await listTitles('equipment', 'me', {}, { db })
  expect(out[0].subcategory).toBe('Kegging & Serving')
})

import { groupBySubcategory } from './lending'

const T = (id: string, subcategory: string | null): any => ({ id, category:'equipment', title:id, description:null, author:null, isbn:null, notes:null, subcategory, availableCount:1, totalCount:1, myLoan:null, archivableCopyId:'c'+id })

test('groupBySubcategory: canonical order, empties dropped, null/unknown -> Other last', () => {
  const titles = [ T('a','Measurement'), T('b','Kegging & Serving'), T('c',null), T('d','ZzzUnknown'), T('e','Kegging & Serving') ]
  const groups = groupBySubcategory(titles)
  // order follows EQUIPMENT_SUBCATEGORIES, not input order; empty cats absent
  expect(groups.map(g => g.subcategory)).toEqual(['Kegging & Serving','Measurement','Other'])
  expect(groups[0].items.map(i => i.id)).toEqual(['b','e']) // both Kegging items
  // null AND unrecognized both land in Other
  expect(groups[2].items.map(i => i.id).sort()).toEqual(['c','d'])
})

test('groupBySubcategory: empty input -> empty array', () => {
  expect(groupBySubcategory([])).toEqual([])
})

import { canSetPhoto } from './lending'

test('canSetPhoto: board can always; member only when no photo', () => {
  expect(canSetPhoto({ isBoard: true, hasPhoto: true })).toBe(true)
  expect(canSetPhoto({ isBoard: true, hasPhoto: false })).toBe(true)
  expect(canSetPhoto({ isBoard: false, hasPhoto: false })).toBe(true)
  expect(canSetPhoto({ isBoard: false, hasPhoto: true })).toBe(false) // member cannot overwrite
})

test('listTitles: returns photoUrl on each title', async () => {
  const rows = [{ id:'i1', category:'equipment', title:'Kettle', description:null, author:null, isbn:null, notes:null, subcategory:'Other', photoUrl:'https://blob/x.jpg',
    copies:[{ id:'c1', status:'available', loans:[] }] }]
  const db = { loanableItem: { findMany: async () => rows } } as any
  const out = await listTitles('equipment', 'me', {}, { db })
  expect(out[0].photoUrl).toBe('https://blob/x.jpg')
})
