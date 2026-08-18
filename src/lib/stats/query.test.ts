import { describe, it, expect, vi } from 'vitest'
import { getStats } from './query'

const NOW = new Date('2026-08-18T12:00:00Z')

// Fake db returning canned aggregate rows.
function fakeDb(pageRows: any[], memberActiveRows: any[]) {
  return {
    pageViewDay: { findMany: vi.fn(async () => pageRows) },
    memberActiveDay: {
      findMany: vi.fn(async () => memberActiveRows),
      // distinct-per-day count is computed in-lib from findMany rows
    },
  }
}

describe('getStats', () => {
  it('totals public vs member views and counts distinct active members over the window', async () => {
    const pageRows = [
      { day: '2026-08-18', area: 'public', count: 10 },
      { day: '2026-08-18', area: 'members', count: 4 },
      { day: '2026-08-17', area: 'public', count: 6 },
    ]
    const memberActiveRows = [
      { day: '2026-08-18', memberId: 'm1' },
      { day: '2026-08-18', memberId: 'm2' },
      { day: '2026-08-17', memberId: 'm1' },
    ]
    const stats = await getStats({ db: fakeDb(pageRows, memberActiveRows) as any, now: NOW, days: 30 })
    expect(stats.publicViews).toBe(16) // 10 + 6
    expect(stats.memberViews).toBe(4)
    // distinct members across the window (m1, m2) = 2
    expect(stats.distinctMembers).toBe(2)
    // per-day series present
    expect(stats.byDay.find((d) => d.day === '2026-08-18')).toMatchObject({ public: 10, members: 4, activeMembers: 2 })
    expect(stats.byDay.find((d) => d.day === '2026-08-17')).toMatchObject({ public: 6, members: 0, activeMembers: 1 })
  })

  it('returns zeros when there is no data', async () => {
    const stats = await getStats({ db: fakeDb([], []) as any, now: NOW, days: 30 })
    expect(stats.publicViews).toBe(0)
    expect(stats.memberViews).toBe(0)
    expect(stats.distinctMembers).toBe(0)
  })
})
