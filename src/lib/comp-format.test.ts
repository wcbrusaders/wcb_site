import { test, expect } from 'vitest'
import { channelBadge, daysUntil, isUrgent } from './comp-format'

test('channelBadge maps each channel to label + variant', () => {
  expect(channelBadge('club_ship')).toEqual({ label: 'Club ships', variant: 'club' })
  expect(channelBadge('self_ship')).toEqual({ label: 'I ship it', variant: 'self' })
  expect(channelBadge('dropoff')).toEqual({ label: 'Drop-off', variant: 'drop' })
})

test('channelBadge falls back to neutral for an unknown channel (never throws)', () => {
  expect(channelBadge('mystery')).toEqual({ label: 'mystery', variant: 'neutral' })
  expect(channelBadge('')).toEqual({ label: '', variant: 'neutral' })
})

const NOW = new Date('2026-09-01T00:00:00Z')
const plus = (d: number) => new Date(NOW.getTime() + d * 86400000)

test('daysUntil uses ceil day math (matches the banner)', () => {
  expect(daysUntil(plus(7), NOW)).toBe(7)
  expect(daysUntil(plus(0), NOW)).toBe(0)
  expect(daysUntil(new Date(NOW.getTime() + 0.5 * 86400000), NOW)).toBe(1) // half a day -> ceil to 1
})

test('isUrgent: <=7 days is urgent (7 yes, 8 no, today yes)', () => {
  expect(isUrgent(plus(7), NOW)).toBe(true)
  expect(isUrgent(plus(8), NOW)).toBe(false)
  expect(isUrgent(plus(0), NOW)).toBe(true)     // today
  expect(isUrgent(plus(-1), NOW)).toBe(true)    // already past -> still urgent (member reminder)
})

// Date fields serialize to ISO STRINGS when a server component passes them to a
// client component (RSC boundary). daysUntil/isUrgent must tolerate a string (or
// a number) date, not throw `.getTime is not a function`. This is the prod bug
// that 500'd the competitions page.
test('daysUntil/isUrgent accept an ISO string date (RSC-serialized), not just a Date', () => {
  const iso7 = plus(7).toISOString()
  expect(() => daysUntil(iso7, NOW)).not.toThrow()
  expect(daysUntil(iso7, NOW)).toBe(7)
  expect(isUrgent(iso7, NOW)).toBe(true)
  expect(isUrgent(plus(8).toISOString(), NOW)).toBe(false)
})
