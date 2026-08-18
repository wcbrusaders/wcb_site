// Aggregate site-usage counter (board stats). Records per-day counts split
// into 'public' vs 'members' areas, plus a per-(day,member) presence row so we
// can count DISTINCT active members. No per-visit history, no path-per-member —
// privacy-safe aggregates only.
//
// Pure classifier (classifyArea/todayUtc) is unit-tested; recordView is a thin,
// fail-soft DB write (never throws into the request path).

import { prisma } from '@/lib/db'

export type Area = 'public' | 'members'

// Paths we never count: API routes (incl. the beacon itself, to avoid
// self-counting), the login flow, Next internals, and static assets.
function isExcluded(pathname: string): boolean {
  if (pathname.startsWith('/api/')) return true
  if (pathname === '/login' || pathname.startsWith('/login/')) return true
  if (pathname.startsWith('/_next/')) return true
  // static asset files (have a dot in the last segment, e.g. favicon.svg)
  const last = pathname.split('/').pop() ?? ''
  if (last.includes('.')) return true
  return false
}

/** Coarse area bucket for a pathname, or null if the path isn't counted. */
export function classifyArea(pathname: string): Area | null {
  if (isExcluded(pathname)) return null
  if (pathname === '/members' || pathname.startsWith('/members/')) return 'members'
  return 'public'
}

/** UTC calendar day as 'YYYY-MM-DD'. */
export function todayUtc(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export interface RecordDeps {
  db?: typeof prisma
  now?: Date
}

/**
 * Record one pageview. Increments the day/area counter, and (if a member is
 * signed in) marks that member active for the day (idempotent via the unique
 * [day,memberId]). Fail-soft: any error is swallowed so counting never breaks
 * a page load.
 */
export async function recordView(
  pathname: string,
  memberId: string | null,
  deps: RecordDeps = {},
): Promise<void> {
  const area = classifyArea(pathname)
  if (!area) return
  const db = deps.db ?? prisma
  const day = todayUtc(deps.now ?? new Date())
  try {
    await db.pageViewDay.upsert({
      where: { day_area: { day, area } },
      update: { count: { increment: 1 } },
      create: { day, area, count: 1 },
    })
    if (memberId) {
      await db.memberActiveDay.upsert({
        where: { day_memberId: { day, memberId } },
        update: {},
        create: { day, memberId },
      })
    }
  } catch {
    // fail-soft: never surface a stats write error into the request
  }
}
