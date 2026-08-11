import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listActiveHoldings } from '@/lib/lending'
import { HoldingsMemberCard } from '@/components/members/HoldingsMemberCard'

export default async function HoldingsPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  if (!session.user.isBoard) redirect('/members')

  const members = await listActiveHoldings()

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl font-bold">Current holdings</h1>
      <p className="text-foreground/50 text-sm mt-1">Everything currently checked out, by member. Board only.</p>
      {members.length === 0 ? (
        <p className="mt-8 text-foreground/60">No items are currently checked out.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {members.map((m) => <HoldingsMemberCard key={m.memberId} member={m} />)}
        </div>
      )}
    </div>
  )
}
