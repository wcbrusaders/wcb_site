import { test, expect } from 'vitest'
import { normalizeEmail } from './roster'

test('normalizeEmail lowercases and trims', () => {
  expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com')
})
