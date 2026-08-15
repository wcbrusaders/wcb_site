import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { normalizeEmail, isAccessBlockedNow } from '@/lib/roster'

// SiteHeader renders ONLY on members pages. Non-members pages (/, /login, /bot)
// have their own headers, so the global header lived in the root layout before
// and double-stacked. Scoping it here fixes that structurally.
//
// This layout also enforces the interim/banned status gate for the whole
// /members/* tree: any board-frozen or removed member is bounced to the
// suspended notice before reaching any member feature. The suspended page
// itself lives under /members (so it gets the same header/session context),
// which means it's also a `children` of this layout — the guard below
// explicitly skips the redirect when the request IS already for
// /members/suspended, otherwise that page would redirect to itself forever.
export default async function MembersLayout({ children }: { children: React.ReactNode }) {
  const h = await headers()
  const pathname = h.get('x-pathname') ?? ''
  const onSuspendedPage = pathname === '/members/suspended'

  if (!onSuspendedPage) {
    const session = await auth()
    const email = session?.user?.email
    if (email) {
      const e = normalizeEmail(email)
      const member = await prisma.member.findFirst({
        where: { OR: [{ emailAddress: e }, { googleEmail: e }] },
        select: { status: true, statusUntil: true },
      })
      if (isAccessBlockedNow(member?.status, member?.statusUntil, new Date())) {
        redirect('/members/suspended')
      }
    }
  }

  return (
    <>
      <SiteHeader />
      {children}
    </>
  )
}
