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

import { membershipStatus, visibleCards } from './dashboard'

const NOW2 = new Date('2026-08-10T00:00:00Z')

test('membershipStatus: inactive when current=false', () => {
  expect(membershipStatus({ current: false, expires: null }, NOW2)).toBe('Inactive')
})
test('membershipStatus: active', () => {
  expect(membershipStatus({ current: true, expires: new Date('2027-01-01') }, NOW2)).toBe('Active')
})
test('membershipStatus: renews soon when expires within 30d', () => {
  const s = membershipStatus({ current: true, expires: new Date('2026-08-25T00:00:00Z') }, NOW2)
  expect(s.startsWith('Active — renews soon')).toBe(true)
})

const EMPTY = {
  name: null,
  tier: null,
  current: false,
  isBoard: false,
  expires: null,
  joinDate: null,
  paymentDate: null,
  partnerEmail: null,
  resourceAccess: null,
}

test('visibleCards: membership always shown; empty record shows only membership', () => {
  expect(visibleCards(EMPTY)).toEqual(['membership'])
})
test('visibleCards: access hidden when resourceAccess is null (never determined)', () => {
  expect(visibleCards({ ...EMPTY, resourceAccess: null })).toEqual(['membership'])
})
test('visibleCards: access shown when resourceAccess is false (determined: no access)', () => {
  expect(visibleCards({ ...EMPTY, resourceAccess: false })).toEqual(['membership', 'access'])
})
test('visibleCards: timeline/connections/access appear when they have data', () => {
  const r = { ...EMPTY, joinDate: new Date('2022-01-01'), partnerEmail: 'p@x.com', resourceAccess: true }
  expect(visibleCards(r)).toEqual(['membership', 'timeline', 'connections', 'access'])
})
