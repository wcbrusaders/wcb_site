import type { EntryChannel } from '@/lib/competitions'

export type BadgeVariant = 'club' | 'self' | 'drop' | 'reg' | 'unreg' | 'neutral'

const CHANNEL_BADGES: Record<EntryChannel, { label: string; variant: BadgeVariant }> = {
  club_ship: { label: 'Club ships', variant: 'club' },
  self_ship: { label: 'I ship it', variant: 'self' },
  dropoff: { label: 'Drop-off', variant: 'drop' },
}

// Never throws on an unexpected stored value — falls back to a neutral badge
// showing the raw string.
export function channelBadge(channel: string): { label: string; variant: BadgeVariant } {
  return CHANNEL_BADGES[channel as EntryChannel] ?? { label: channel, variant: 'neutral' }
}

const DAY = 86400000
// `date` may arrive as a Date OR an ISO string: when a server component passes a
// Prisma Date to a client component, the RSC boundary serializes it to a string.
// Normalize with `new Date(...)` (a Date passes through unchanged) so we never
// call `.getTime()` on a raw string. `now` is always a real Date (server-created).
export function daysUntil(date: Date | string | number, now: Date = new Date()): number {
  return Math.ceil((new Date(date).getTime() - now.getTime()) / DAY)
}
export function isUrgent(date: Date | string | number, now: Date = new Date()): boolean {
  const d = daysUntil(date, now)
  // Only upcoming-and-close is urgent — a PAST date is not "urgent", it's passed.
  return d >= 0 && d <= 7
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Human-readable short date "Mon D" in UTC (matches how dates are stored/parsed
// at UTC noon). Tolerant of Date | ISO string | null.
export function humanDate(date: Date | string | number | null): string {
  if (date == null) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

// Relative-days label: "in 19d" / "in 1d" / "today" / "passed". Never a raw
// negative number (that was the '-6 days' bug).
export function relDays(date: Date | string | number, now: Date = new Date()): string {
  const d = daysUntil(date, now)
  if (d < 0) return 'passed'
  if (d === 0) return 'today'
  return `in ${d}d`
}

export type MilestoneState = 'done' | 'upcoming' | 'future' | 'pending'
export interface CompMilestone {
  key: 'register' | 'arrives' | 'delivered'
  label: string
  date: Date | string | null
  state: MilestoneState
}

// The 3-step competition timeline (A+B card). Derives each milestone's state:
//   register: done once its deadline is past, else upcoming (<=7d) / future.
//   arrives:  done once shipped (shippedAt) OR its deadline is past; else
//             upcoming/future by the shipping deadline.
//   delivered: done when deliveryStatus is 'delivered'; pending otherwise.
export function compTimeline(
  c: {
    registrationDeadline: Date | string
    shippingDeadline: Date | string
    shippedAt: Date | string | null
    deliveryStatus: string | null
    deliveredAt: Date | string | null
  },
  now: Date = new Date(),
): CompMilestone[] {
  const reg = daysUntil(c.registrationDeadline, now)
  const ship = daysUntil(c.shippingDeadline, now)
  const registerState: MilestoneState = reg < 0 ? 'done' : reg <= 7 ? 'upcoming' : 'future'
  const arrivesState: MilestoneState = c.shippedAt || ship < 0 ? 'done' : ship <= 7 ? 'upcoming' : 'future'
  const deliveredState: MilestoneState = c.deliveryStatus === 'delivered' ? 'done' : 'pending'
  return [
    { key: 'register', label: 'Register', date: c.registrationDeadline, state: registerState },
    { key: 'arrives', label: 'Beer arrives', date: c.shippingDeadline, state: arrivesState },
    { key: 'delivered', label: 'Delivered', date: c.deliveredAt, state: deliveredState },
  ]
}

// State of the per-card "get your bottles to the shipper" nudge.
//   hidden   — the club shipment is already shipped (officer set shippedAt): the
//              members' job is done, so there's nothing to nag about.
//   upcoming — not shipped yet, deadline today or in the future: show a countdown.
//   passed   — not shipped yet, deadline already gone: show a quiet "deadline was
//              <date>" (NOT a negative countdown, NOT a red alarm).
// Reuses shippedAt (already set for delivery tracking) — no new member input.
export function deliverBannerState(
  deliverByDate: Date | string | number,
  shippedAt: Date | string | null,
  now: Date = new Date(),
): 'hidden' | 'upcoming' | 'passed' {
  if (shippedAt) return 'hidden'
  return daysUntil(deliverByDate, now) >= 0 ? 'upcoming' : 'passed'
}
