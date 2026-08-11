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
