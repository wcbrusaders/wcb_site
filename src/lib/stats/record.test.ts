import { describe, it, expect, vi } from 'vitest'
import { classifyArea, todayUtc, recordView } from './record'

describe('classifyArea', () => {
  it('classifies member routes as members', () => {
    expect(classifyArea('/members')).toBe('members')
    expect(classifyArea('/members/resources')).toBe('members')
    expect(classifyArea('/members/admin/stats')).toBe('members')
  })
  it('classifies public site routes as public', () => {
    expect(classifyArea('/')).toBe('public')
    expect(classifyArea('/join')).toBe('public')
    expect(classifyArea('/bot')).toBe('public')
    expect(classifyArea('/board')).toBe('public')
    expect(classifyArea('/code-of-conduct')).toBe('public')
  })
  it('excludes api, login, next internals, and the stats beacon itself (returns null)', () => {
    expect(classifyArea('/api/artifacts/x')).toBeNull()
    expect(classifyArea('/api/stats')).toBeNull()
    expect(classifyArea('/login')).toBeNull()
    expect(classifyArea('/_next/static/chunk.js')).toBeNull()
    expect(classifyArea('/favicon.svg')).toBeNull()
  })
})

describe('todayUtc', () => {
  it('formats a Date as YYYY-MM-DD in UTC', () => {
    expect(todayUtc(new Date('2026-08-18T23:59:59Z'))).toBe('2026-08-18')
    expect(todayUtc(new Date('2026-01-05T00:00:00Z'))).toBe('2026-01-05')
  })
})

function fakeDb() {
  const pageViewUpserts: any[] = []
  const memberActiveUpserts: any[] = []
  return {
    pageViewUpserts,
    memberActiveUpserts,
    pageViewDay: { upsert: vi.fn(async (a: any) => { pageViewUpserts.push(a); return {} }) },
    memberActiveDay: { upsert: vi.fn(async (a: any) => { memberActiveUpserts.push(a); return {} }) },
  }
}

const NOW = new Date('2026-08-18T12:00:00Z')

describe('recordView', () => {
  it('increments PageViewDay(public) for a public path and writes no member row when anonymous', async () => {
    const db = fakeDb()
    await recordView('/join', null, { db: db as any, now: NOW })
    expect(db.pageViewUpserts).toHaveLength(1)
    expect(db.pageViewUpserts[0].where).toEqual({ day_area: { day: '2026-08-18', area: 'public' } })
    expect(db.pageViewUpserts[0].update).toEqual({ count: { increment: 1 } })
    expect(db.memberActiveUpserts).toHaveLength(0)
  })

  it('increments PageViewDay(members) AND upserts MemberActiveDay for a signed-in member on a member path', async () => {
    const db = fakeDb()
    await recordView('/members/resources', 'm1', { db: db as any, now: NOW })
    expect(db.pageViewUpserts[0].where).toEqual({ day_area: { day: '2026-08-18', area: 'members' } })
    expect(db.memberActiveUpserts).toHaveLength(1)
    expect(db.memberActiveUpserts[0].where).toEqual({ day_memberId: { day: '2026-08-18', memberId: 'm1' } })
  })

  it('does nothing for an excluded path', async () => {
    const db = fakeDb()
    await recordView('/api/stats', 'm1', { db: db as any, now: NOW })
    expect(db.pageViewUpserts).toHaveLength(0)
    expect(db.memberActiveUpserts).toHaveLength(0)
  })

  it('never throws even if the db write fails (fail-soft)', async () => {
    const db = { pageViewDay: { upsert: vi.fn(async () => { throw new Error('db down') }) }, memberActiveDay: { upsert: vi.fn() } }
    await expect(recordView('/', null, { db: db as any, now: NOW })).resolves.toBeUndefined()
  })
})
