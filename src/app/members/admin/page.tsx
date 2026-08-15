import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { fetchAllRosterRows } from '@/lib/roster'
import { AdminRoster } from '@/components/members/AdminRoster'

// Board-only console. Always reflect live roster (no static caching of member data).
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  if (!session.user.isBoard) redirect('/members')

  const rows = await fetchAllRosterRows()
  const members = rows.map((m) => ({
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
      <h1 className="text-2xl font-bold">Admin — Roster</h1>
      <p className="text-foreground/50 text-sm mt-1">
        Board-only. {members.length} members. Edits write back to the roster and are logged.
      </p>
      <AdminRoster members={members} />
    </div>
  )
}
