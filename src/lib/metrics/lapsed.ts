import type { prisma } from '../db'

// The board-editable "why did they leave" capture. This is intentionally
// SEPARATE from the pure metrics pipeline (kpis/trends/etc, which run on the
// PII-minimal MemberLite): this list needs the member `id` (to edit) and the
// site-owned lapse fields, and it's mutable data, not a computed report.

/**
 * Fixed set of lapse reasons the board can pick from on the membership admin
 * page. Kept here so the UI dropdown, the server action's validation, and the
 * summary roll-up all agree. 'unknown' is the default read for an
 * un-investigated departure; free-text nuance goes in lapseNote.
 */
export const LAPSE_REASONS = [
  'life got busy',
  'lost interest',
  'cost',
  'moved away',
  'got what they needed',
  'came back',
  'unknown',
  'other',
] as const

export type LapseReason = (typeof LAPSE_REASONS)[number]

export type LapsedMemberRow = {
  id: string
  name: string
  tier: string | null
  state: string // 'lapsed' | 'former'
  expires: string | null // ISO date-only, or null
  tenureMonths: number | null // whole months joinDate->expires, null if either missing
  lapseReason: string | null
  lapseNote: string | null
}

/** Complete (whole) months between two UTC dates — same convention as kpis.ts. */
function completeMonths(from: Date, to: Date): number {
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  if (to.getUTCDate() < from.getUTCDate()) months -= 1
  return months < 0 ? 0 : months
}

function isoDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

/**
 * Fetch members who have left (membershipState 'lapsed' or 'former'), most
 * recently expired first, with their tenure-at-lapse and any recorded reason.
 * Board-only data (has names) — callers must be behind the admin gate. Pure
 * over the injected db handle for testability.
 */
export async function fetchLapsedMembers(
  db: Pick<typeof prisma, 'member'>,
): Promise<LapsedMemberRow[]> {
  const rows = await db.member.findMany({
    where: { membershipState: { in: ['lapsed', 'former'] } },
    select: {
      id: true,
      name: true,
      tier: true,
      membershipState: true,
      joinDate: true,
      expires: true,
      lapseReason: true,
      lapseNote: true,
    },
  })

  return rows
    .map((m) => ({
      id: m.id,
      name: m.name ?? 'Unknown',
      tier: m.tier,
      state: m.membershipState,
      expires: isoDate(m.expires),
      tenureMonths: m.joinDate && m.expires ? completeMonths(m.joinDate, m.expires) : null,
      lapseReason: m.lapseReason,
      lapseNote: m.lapseNote,
      // keep the raw expires for sorting, dropped from the returned shape below
      _sort: m.expires ? m.expires.getTime() : 0,
    }))
    .sort((a, b) => b._sort - a._sort)
    .map(({ _sort, ...row }) => row)
}
