// Read-side aggregation for the board stats page. Pulls the last N days of
// aggregate counters and rolls them into headline totals + a per-day series.
// DI (db/now/days) for testability.

import { prisma } from '@/lib/db'
import { todayUtc } from './record'

export interface StatsDay {
  day: string
  public: number
  members: number
  activeMembers: number
}

export interface StatsView {
  days: number
  publicViews: number
  memberViews: number
  distinctMembers: number
  byDay: StatsDay[] // most recent first
}

export interface StatsDeps {
  db?: typeof prisma
  now?: Date
  days?: number
}

function windowStart(now: Date, days: number): string {
  const d = new Date(now.getTime() - (days - 1) * 86400000)
  return todayUtc(d)
}

export async function getStats(deps: StatsDeps = {}): Promise<StatsView> {
  const db = deps.db ?? prisma
  const now = deps.now ?? new Date()
  const days = deps.days ?? 30
  const since = windowStart(now, days)

  const [pageRows, activeRows] = await Promise.all([
    db.pageViewDay.findMany({ where: { day: { gte: since } } }),
    db.memberActiveDay.findMany({ where: { day: { gte: since } } }),
  ])

  // headline totals
  let publicViews = 0
  let memberViews = 0
  for (const r of pageRows as any[]) {
    if (r.area === 'public') publicViews += r.count
    else if (r.area === 'members') memberViews += r.count
  }
  const distinctMembers = new Set((activeRows as any[]).map((r) => r.memberId)).size

  // per-day series
  const byDayMap = new Map<string, StatsDay>()
  const ensure = (day: string) => {
    let e = byDayMap.get(day)
    if (!e) {
      e = { day, public: 0, members: 0, activeMembers: 0 }
      byDayMap.set(day, e)
    }
    return e
  }
  for (const r of pageRows as any[]) {
    const e = ensure(r.day)
    if (r.area === 'public') e.public += r.count
    else if (r.area === 'members') e.members += r.count
  }
  const activeByDay = new Map<string, Set<string>>()
  for (const r of activeRows as any[]) {
    if (!activeByDay.has(r.day)) activeByDay.set(r.day, new Set())
    activeByDay.get(r.day)!.add(r.memberId)
  }
  for (const [day, set] of activeByDay) ensure(day).activeMembers = set.size

  const byDay = [...byDayMap.values()].sort((a, b) => (a.day < b.day ? 1 : -1))

  return { days, publicViews, memberViews, distinctMembers, byDay }
}
