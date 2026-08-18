import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listActiveHoldings } from '@/lib/lending'
import { HoldingsMemberCard } from '@/components/members/HoldingsMemberCard'
import { PageHeader, EmptyState } from '@/components/ui'

export default async function HoldingsPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  if (!session.user.isBoard) redirect('/members')

  const members = await listActiveHoldings()

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <PageHeader eyebrow="📦 Board" title="Current holdings" lead="Everything currently checked out, by member. Board only." />
      {members.length === 0 ? (
        <EmptyState icon="📦">No items are currently checked out.</EmptyState>
      ) : (
        <div className="space-y-4">
          {members.map((m) => <HoldingsMemberCard key={m.memberId} member={m} />)}
        </div>
      )}
    </div>
  )
}
