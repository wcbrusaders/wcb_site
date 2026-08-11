import { test, expect, vi } from 'vitest'
import { makeSignInCallback } from './auth'

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
