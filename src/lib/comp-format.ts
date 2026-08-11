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
export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / DAY)
}
export function isUrgent(date: Date, now: Date = new Date()): boolean {
  return daysUntil(date, now) <= 7
}
