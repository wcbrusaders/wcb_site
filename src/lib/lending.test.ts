import { test, expect } from 'vitest'
import { coverUrl, listTitles } from './lending'

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
