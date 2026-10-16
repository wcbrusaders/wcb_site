import { test, expect, vi } from 'vitest'
import { makeSignInCallback, resolveSessionMember } from './auth'

test('signIn allows a current member', async () => {
  const cb = makeSignInCallback({ isMember: async () => ({ ok: true, member: { emailAddress: 'a@x.com' } as any }) })
  expect(await cb({ user: { email: 'a@x.com' } } as any)).toBe(true)
})

test('signIn denies a non-member', async () => {
  const cb = makeSignInCallback({ isMember: async () => ({ ok: false }) })
  expect(await cb({ user: { email: 'no@x.com' } } as any)).toBe(false)
})

test('signIn denies when no email', async () => {
  const cb = makeSignInCallback({ isMember: async () => ({ ok: true, member: {} as any }) })
  expect(await cb({ user: {} } as any)).toBe(false)
})

test('signIn calls isMember with the user email and tracks its verdict', async () => {
  const isMember = vi.fn(async (email: string) =>
    email === 'member@x.com' ? { ok: true as const, member: { emailAddress: email } as any } : { ok: false as const },
  )
  const cb = makeSignInCallback({ isMember })
  expect(await cb({ user: { email: 'member@x.com' } } as any)).toBe(true)
  expect(isMember).toHaveBeenCalledWith('member@x.com')
  expect(await cb({ user: { email: 'stranger@x.com' } } as any)).toBe(false)
  expect(isMember).toHaveBeenCalledWith('stranger@x.com')
  expect(isMember).toHaveBeenCalledTimes(2)
})

// Fake db whose findFirst honors where(OR emailAddress/googleEmail) + orderBy.
function fakeDb(rows: any[]) {
  return {
    member: {
      findFirst: async (args: any) => {
        const ors: any[] = args.where.OR
        let hits = rows.filter((r) => ors.some((c) => Object.entries(c).every(([k, v]) => r[k] === v)))
        const ob: any[] = args.orderBy ?? []
        hits = [...hits].sort((a, b) => {
          for (const o of ob) {
            const [k, dir] = Object.entries(o)[0] as [string, string]
            const av = a[k] instanceof Date ? a[k].getTime() : Number(a[k])
            const bv = b[k] instanceof Date ? b[k].getTime() : Number(b[k])
            if (av !== bv) return dir === 'desc' ? bv - av : av - bv
          }
          return 0
        })
        return hits[0] ?? null
      },
    },
  } as any
}

test('resolveSessionMember prefers the current row on email collision', async () => {
  const e = 'p@x.com'
  const db = fakeDb([
    { id: 'former', emailAddress: e, current: false, updatedAt: new Date('2026-01-01'), tier: 'Single', isBoard: false },
    { id: 'cur', googleEmail: e, current: true, updatedAt: new Date('2025-01-01'), tier: 'Dual', isBoard: false },
  ])
  const m = await resolveSessionMember(e, { db })
  expect(m?.id).toBe('cur')
})

test('resolveSessionMember falls back to most recently updated when both current', async () => {
  const e = 'p@x.com'
  const db = fakeDb([
    { id: 'old', emailAddress: e, current: true, updatedAt: new Date('2025-01-01') },
    { id: 'new', googleEmail: e, current: true, updatedAt: new Date('2026-01-01') },
  ])
  expect((await resolveSessionMember(e, { db }))?.id).toBe('new')
})

test('resolveSessionMember single match returns it', async () => {
  const db = fakeDb([{ id: 'one', emailAddress: 'a@x.com', current: true, updatedAt: new Date() }])
  expect((await resolveSessionMember('a@x.com', { db }))?.id).toBe('one')
})

test('resolveSessionMember no match returns null', async () => {
  expect(await resolveSessionMember('z@x.com', { db: fakeDb([]) })).toBeNull()
})
