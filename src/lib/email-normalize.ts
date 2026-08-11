// Client-safe email normalizer that mirrors @auth/core's email-provider default
// normalizer (node_modules/@auth/core/lib/actions/signin/send-token.js): the
// verification token is stored under the identifier normalize("NFKC") →
// toLowerCase → trim, keeping only local@firstDomain. The /login form MUST send
// this same normalized value on BOTH the send (signIn) and verify (callback)
// requests, or @auth/core's identifier comparison fails and reports the code as
// "wrong or expired" — even for a correct, seconds-old code. Mobile keyboards
// auto-capitalize the first letter, which is why fresh phone logins broke.
//
// Kept dependency-free and in its own module (NOT roster.ts, which imports
// googleapis + prisma) so the client login bundle stays server-code-free.
export function normalizeLoginEmail(email: string): string {
  const trimmed = email.normalize('NFKC').toLowerCase().trim()
  const at = trimmed.indexOf('@')
  if (at === -1) return trimmed
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1).split(',')[0]
  return `${local}@${domain}`
}
