import { test, expect } from 'vitest'
import { normalizeLoginEmail } from './email-normalize'

// This must match @auth/core's send-token default normalizer EXACTLY
// (node_modules/@auth/core/lib/actions/signin/send-token.js): the email
// provider stores the VerificationToken under normalize("NFKC").toLowerCase().trim(),
// keeps only local@firstDomain. If the /login page verifies with a differently-
// cased/spaced email, the stored `identifier` won't match and @auth/core throws
// Verification ("code wrong or expired") even for a correct, fresh code. Mobile
// keyboards auto-capitalize the first letter, so this bit every phone login.

test('lowercases (mobile auto-capitalization is the real-world trigger)', () => {
  expect(normalizeLoginEmail('Jordan@Gmail.com')).toBe('jordan@gmail.com')
  expect(normalizeLoginEmail('ROBNORMAN201@GMAIL.COM')).toBe('robnorman201@gmail.com')
})

test('trims surrounding whitespace', () => {
  expect(normalizeLoginEmail('  jane@example.com  ')).toBe('jane@example.com')
})

test('already-normalized email is unchanged (idempotent)', () => {
  expect(normalizeLoginEmail('a@b.com')).toBe('a@b.com')
})

test('keeps only the first domain after a comma (matches @auth/core)', () => {
  expect(normalizeLoginEmail('user@domain.com,evil.com')).toBe('user@domain.com')
})

test('applies NFKC so fullwidth homoglyphs match what @auth/core stored', () => {
  // Fullwidth "＠" (U+FF20) NFKC-folds to ASCII "@"; fullwidth letters fold to ASCII.
  expect(normalizeLoginEmail('Ｕｓｅｒ＠Ｅｘａｍｐｌｅ.com')).toBe('user@example.com')
})
