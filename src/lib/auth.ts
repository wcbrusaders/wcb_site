import NextAuth from 'next-auth'
import type { EmailConfig } from '@auth/core/providers/email'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from './db'
import { isCurrentMember, normalizeEmail } from './roster'
import { sendLoginCode } from './email'

// Augment the session's user with member info looked up from our own `Member` table.
// (Task 11/consumers can rely on these being typed, not `any`.)
declare module 'next-auth' {
  interface Session {
    user?: {
      memberId?: string
      tier?: string | null
      isBoard?: boolean
    } & DefaultSessionUser
  }
}

// Minimal shape of the built-in session user we're extending (avoids re-importing
// the whole next-auth type graph just for name/email/image).
type DefaultSessionUser = {
  name?: string | null
  email?: string | null
  image?: string | null
}

/**
 * Testable, framework-free gate: denies sign-in for anyone who isn't a current
 * WCB member per the roster. Extracted so it can be unit-tested with a fake
 * `isMember` instead of exercising the real NextAuth pipeline.
 */
export function makeSignInCallback(deps: { isMember: typeof isCurrentMember }) {
  return async ({ user }: { user: { email?: string | null } }): Promise<boolean> => {
    if (!user?.email) return false
    const r = await deps.isMember(user.email)
    return r.ok
  }
}

function sixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

// Auth.js v5 (5.0.0-beta.29) email provider: `generateVerificationToken` and
// `sendVerificationRequest` are real fields on `EmailConfig` (see
// node_modules/@auth/core/providers/email.d.ts). The core `sendToken` action
// calls `generateVerificationToken()` for the raw token, hashes it before
// persisting via the adapter's `createVerificationToken`, and passes the raw
// token (plus a magic-link-style `url` containing it as a query param) to
// `sendVerificationRequest`. We ignore `url` and email only the 6-digit code
// via `sendLoginCode`, so users type the code into our own /login form rather
// than clicking a link.
const emailCodeProvider: EmailConfig = {
  id: 'email-code',
  type: 'email',
  name: 'Email code',
  from: process.env.RESEND_FROM ?? 'WCB <noreply@wcbrusaders.com>',
  maxAge: 10 * 60, // code TTL: 10 minutes
  generateVerificationToken: async () => sixDigitCode(),
  sendVerificationRequest: async ({ identifier, token }) => {
    await sendLoginCode(identifier, token)
  },
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/login', verifyRequest: '/login?sent=1' },
  providers: [emailCodeProvider],
  callbacks: {
    signIn: makeSignInCallback({ isMember: isCurrentMember }),
    async session({ session }) {
      if (session.user?.email) {
        const e = normalizeEmail(session.user.email)
        const m = await prisma.member.findFirst({
          where: { OR: [{ emailAddress: e }, { googleEmail: e }] },
          select: { id: true, tier: true, isBoard: true },
        })
        session.user.memberId = m?.id
        session.user.tier = m?.tier
        session.user.isBoard = m?.isBoard ?? false
      }
      return session
    },
  },
})
