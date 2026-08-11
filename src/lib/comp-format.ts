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
  return daysUntil(date, now) <= 7
}
