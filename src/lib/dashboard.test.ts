import { test, expect } from 'vitest'
import { formatTenure, getMemberDashboard } from './dashboard'

const NOW = new Date('2026-08-10T00:00:00Z')

test('formatTenure: null join date -> empty', () => {
  expect(formatTenure(null, NOW)).toBe('')
})
test('formatTenure: future join date -> empty', () => {
  expect(formatTenure(new Date('2027-01-01T00:00:00Z'), NOW)).toBe('')
})
test('formatTenure: under a year -> "N mo"', () => {
  expect(formatTenure(new Date('2026-05-10T00:00:00Z'), NOW)).toBe('3 mo')
})
test('formatTenure: exactly one year -> "1 yr"', () => {
  expect(formatTenure(new Date('2025-08-10T00:00:00Z'), NOW)).toBe('1 yr')
})
test('formatTenure: years and months -> "Y yr M mo"', () => {
  expect(formatTenure(new Date('2022-05-10T00:00:00Z'), NOW)).toBe('4 yr 3 mo')
})
test('formatTenure: month not yet reached rolls back', () => {
  // join Jun 20, now Aug 10 -> 1 month + partial, floor to 1
  expect(formatTenure(new Date('2026-06-20T00:00:00Z'), NOW)).toBe('1 mo')
})

const ROW = { name: 'Jane', tier: 'Full', current: true, isBoard: false, expires: null, joinDate: new Date('2022-05-10'), paymentDate: null, partnerEmail: null, resourceAccess: true }

test('getMemberDashboard: hit returns the record, matching on emailAddress OR googleEmail', async () => {
  const db = { member: { findFirst: async ({ where }: any) => {
    const or = where.OR
    return (or[0].emailAddress === 'jane@x.com' || or[1].googleEmail === 'jane@x.com') ? ROW : null
  } } } as any
  const r = await getMemberDashboard('  Jane@X.com ', { db }) // normalization exercised
  expect(r?.tier).toBe('Full')
  expect(r?.resourceAccess).toBe(true)
})

test('getMemberDashboard: miss returns null', async () => {
  const db = { member: { findFirst: async () => null } } as any
  expect(await getMemberDashboard('nobody@x.com', { db })).toBeNull()
})
