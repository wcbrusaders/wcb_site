import { test, expect } from 'vitest'
import { channelBadge, daysUntil, isUrgent, deliverBannerState, humanDate, relDays, compTimeline } from './comp-format'

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

test('isUrgent: upcoming and within 7 days (7 yes, 8 no, today yes, PAST no)', () => {
  expect(isUrgent(plus(7), NOW)).toBe(true)
  expect(isUrgent(plus(8), NOW)).toBe(false)
  expect(isUrgent(plus(0), NOW)).toBe(true)     // today
  expect(isUrgent(plus(-1), NOW)).toBe(false)   // past is NOT urgent (was the '-6 days' bug)
})

test('deliverBannerState: hidden when shipped, upcoming/passed otherwise', () => {
  // shipped (officer already set shippedAt) -> nag gone regardless of date
  expect(deliverBannerState(plus(3), plus(-1), NOW)).toBe('hidden')
  expect(deliverBannerState(plus(-6), '2026-08-25T00:00:00Z', NOW)).toBe('hidden')
  // not shipped, future/today deadline -> upcoming countdown
  expect(deliverBannerState(plus(3), null, NOW)).toBe('upcoming')
  expect(deliverBannerState(plus(0), null, NOW)).toBe('upcoming')
  // not shipped, past deadline -> passed (quiet 'was <date>', not a negative countdown)
  expect(deliverBannerState(plus(-6), null, NOW)).toBe('passed')
})

test('humanDate: short "Mon D" (UTC), tolerant of Date | ISO string', () => {
  expect(humanDate(new Date('2026-09-20T12:00:00Z'))).toBe('Sep 20')
  expect(humanDate('2026-01-05T12:00:00Z')).toBe('Jan 5')
  expect(humanDate(null)).toBe('—')
})

test('relDays: relative label for a date vs now', () => {
  expect(relDays(plus(19), NOW)).toBe('in 19d')
  expect(relDays(plus(1), NOW)).toBe('in 1d')
  expect(relDays(plus(0), NOW)).toBe('today')
  expect(relDays(plus(-1), NOW)).toBe('passed')
  expect(relDays(plus(-6), NOW)).toBe('passed')
})

test('compTimeline: 3-step state (register -> arrives -> delivered)', () => {
  // register within 7d (upcoming), arrival far out (future), not shipped
  const base = { registrationDeadline: plus(5), shippingDeadline: plus(19), shippedAt: null, deliveryStatus: null, deliveredAt: null }
  const t1 = compTimeline(base, NOW)
  expect(t1.map((s) => s.key)).toEqual(['register', 'arrives', 'delivered'])
  expect(t1.find((s) => s.key === 'delivered')!.state).toBe('pending')
  expect(t1.find((s) => s.key === 'register')!.state).toBe('upcoming')
  expect(t1.find((s) => s.key === 'arrives')!.state).toBe('future')

  // past register, shipped + delivered: register done, arrives done, delivered done
  const t2 = compTimeline({ registrationDeadline: plus(-30), shippingDeadline: plus(-10), shippedAt: plus(-12), deliveryStatus: 'delivered', deliveredAt: plus(-8) }, NOW)
  expect(t2.find((s) => s.key === 'register')!.state).toBe('done')
  expect(t2.find((s) => s.key === 'delivered')!.state).toBe('done')
  expect(t2.find((s) => s.key === 'delivered')!.date).toEqual(plus(-8))
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
