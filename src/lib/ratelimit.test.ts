import { test, expect } from 'vitest'
import { checkRateLimit, _resetRateLimit } from './ratelimit'

test('allows up to N then blocks', () => {
  _resetRateLimit()
  const key = 'e@x.com'
  for (let i = 0; i < 5; i++) expect(checkRateLimit(key, { max: 5, windowMs: 1000 }).ok).toBe(true)
  expect(checkRateLimit(key, { max: 5, windowMs: 1000 }).ok).toBe(false)
})
