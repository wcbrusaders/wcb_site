import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { fetchAllRosterRows, normalizeEmail } from '@/lib/roster'
import { AdminRoster } from '@/components/members/AdminRoster'

// Board-only console. Always reflect live roster (no static caching of member data).
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  if (!session.user.isBoard) redirect('/members')

  const rows = await fetchAllRosterRows()

  // The roster rows come straight from the Google Sheet and have no DB id.
  // Strikes (and enforcement generally) key on the Member.id cuid, so map
  // emailAddress/googleEmail -> id once here and thread it through.
  const dbMembers = await prisma.member.findMany({ select: { id: true, emailAddress: true, googleEmail: true } })
  const idByEmail = new Map<string, string>()
  for (const dm of dbMembers) {
    idByEmail.set(normalizeEmail(dm.emailAddress), dm.id)
    if (dm.googleEmail) idByEmail.set(normalizeEmail(dm.googleEmail), dm.id)
  }

  const members = rows.map((m) => ({
    id: idByEmail.get(m.emailAddress) ?? m.emailAddress,
    name: m.name ?? '(no name)',
    email: m.emailAddress,
    googleEmail: m.googleEmail,
    tier: m.tier,
    current: m.current,
    isBoard: m.isBoard,
    role: m.role,
    partnerEmail: m.partnerEmail,
    expires: m.expires ? m.expires.toISOString().slice(0, 10) : null,
  }))

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Admin — Roster</h1>
          <p className="text-foreground/50 text-sm mt-1">
            Board-only. {members.length} members. Edits write back to the roster and are logged.
          </p>
        </div>
        <Link
          href="/members/admin/enforcement"
          className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20"
        >
          Enforcement &amp; cases →
        </Link>
      </div>
      <AdminRoster members={members} />
    </div>
  )
}
