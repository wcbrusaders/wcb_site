import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listMemberComps, listPastComps } from '@/lib/competitions'
import { AddCompetitionForm } from '@/components/members/AddCompetitionForm'
import { CompetitionCard } from '@/components/members/CompetitionCard'

export default async function CompetitionsPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  const memberId = session.user.memberId
  const isBoard = !!session.user.isBoard

  const comps = await listMemberComps(memberId)
  const past = await listPastComps()

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl font-bold">Competitions</h1>
      <p className="text-foreground/50 text-sm mt-1">Track the comps you&apos;ve entered and your beers. Officers coordinate club shipping.</p>

      <div className="mt-6"><AddCompetitionForm /></div>

      {comps.length === 0 ? (
        <p className="text-foreground/60">No active competitions. Add one above.</p>
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
    </div>
  )
}
