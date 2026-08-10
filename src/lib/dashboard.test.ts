import { test, expect } from 'vitest'
import { formatTenure } from './dashboard'

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
