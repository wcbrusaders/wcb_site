import { test, expect } from 'vitest'
import { notifyOfficersCheckout } from './notify'

const INPUT = { memberName: 'Jordan L.', title: 'pH Meter', category: 'equipment', dueAt: new Date('2026-08-24T00:00:00Z') }

test('posts a message with item + due date to the webhook', async () => {
  let body: any = null
  const fakeFetch = (async (_u: string, init: any) => { body = JSON.parse(init.body); return { ok: true } }) as any
  await notifyOfficersCheckout(INPUT, { fetch: fakeFetch, webhookUrl: 'https://discord/webhook' })
  expect(body.content).toContain('pH Meter')
  expect(body.content).toContain('2026-08-24')
})

test('unset webhook -> no-op, no fetch, no throw', async () => {
  let called = false
  const fakeFetch = (async () => { called = true; return { ok: true } }) as any
  await expect(notifyOfficersCheckout(INPUT, { fetch: fakeFetch, webhookUrl: '' })).resolves.toBeUndefined()
  expect(called).toBe(false)
})

test('fetch throws -> swallowed (still resolves)', async () => {
  const fakeFetch = (async () => { throw new Error('discord down') }) as any
  await expect(notifyOfficersCheckout(INPUT, { fetch: fakeFetch, webhookUrl: 'https://discord/webhook' })).resolves.toBeUndefined()
})
