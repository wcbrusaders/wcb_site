import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { fetchAllRosterRows } from '@/lib/roster'

// Board-only admin hub. Always live (no static caching).
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  if (!session.user.isBoard) redirect('/members')

  // Lightweight counts for the area cards. Roster count comes from the sheet;
  // the rest are cheap DB counts. Each is fail-soft so one slow source can't
  // blank the whole hub.
  const [rosterCount, loansOut, reviewCount, openCases] = await Promise.all([
    fetchAllRosterRows().then((r) => r.length).catch(() => null),
    prisma.loan.count({ where: { returnedAt: null } }).catch(() => null),
    prisma.draftArticle.count({ where: { status: 'in_review' } }).catch(() => null),
    prisma.enforcementCase.count({ where: { status: 'open' } }).catch(() => null),
  ])

  const areas = [
    {
      href: '/members/admin/roster',
      title: 'Roster',
      desc: 'View members; edit Google/partner email. Writes back to the sheet, logged.',
      badge: rosterCount != null ? `${rosterCount} members` : null,
    },
    {
      href: '/members/holdings',
      title: 'Holdings',
      desc: 'Everything currently checked out, by member. Mark items returned.',
      badge: loansOut != null ? `${loansOut} out` : null,
    },
    {
      href: '/members/admin/knowledge',
      title: 'Knowledge review',
      desc: 'Approve or reject AI-drafted meeting notes before members see them.',
      badge: reviewCount ? `${reviewCount} to review` : null,
    },
    {
      href: '/members/admin/enforcement',
      title: 'Enforcement & cases',
      desc: 'Conduct cases, cooldowns, and removal votes (with board safeguards).',
      badge: openCases ? `${openCases} open` : null,
    },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl font-bold">Admin</h1>
      <p className="text-foreground/50 text-sm mt-1">Board-only console. Pick an area.</p>
      <div className="mt-6 grid sm:grid-cols-2 gap-3">
        {areas.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="block rounded-2xl border border-border/60 bg-card-bg/30 hover:border-accent/40 p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold text-lg">{a.title}</div>
              {a.badge && (
                <span className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
                  {a.badge}
                </span>
              )}
            </div>
            <div className="text-sm text-foreground/55 mt-1">{a.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
