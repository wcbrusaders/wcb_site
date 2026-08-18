import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listMemberComps, listPastComps, listOfficerComps } from '@/lib/competitions'
import { AddCompetitionForm } from '@/components/members/AddCompetitionForm'
import { CompetitionCard } from '@/components/members/CompetitionCard'
import { OfficerCompetitions } from '@/components/members/OfficerCompetitions'
import { PageHeader, EmptyState } from '@/components/ui'

export default async function CompetitionsPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  const memberId = session.user.memberId
  const isBoard = !!session.user.isBoard

  const comps = await listMemberComps(memberId)
  const past = await listPastComps()

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <PageHeader eyebrow="🏆 Members" title="Competitions" lead="Track the comps you've entered and your beers. Officers coordinate club shipping." />

      <div className="mb-6"><AddCompetitionForm /></div>

      {comps.length === 0 ? (
        <EmptyState icon="🏆">No active competitions. Add one above.</EmptyState>
      ) : (
        <div className="space-y-4">
          {comps.map((c) => <CompetitionCard key={c.id} comp={c} viewerIsBoard={isBoard} viewerId={memberId} />)}
        </div>
      )}

      {past.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-foreground/50 text-sm">Past competitions ({past.length})</summary>
          <ul className="mt-2 space-y-1 text-sm text-foreground/60">
            {past.map((p) => <li key={p.id}><a href={p.homepageUrl} target="_blank" rel="noreferrer" className="hover:text-accent">{p.name}</a> · shipped by {p.shippingDeadline.toISOString().slice(0, 10)}</li>)}
          </ul>
        </details>
      )}

      {isBoard && <OfficerCompetitions comps={await listOfficerComps()} />}
    </div>
  )
}
