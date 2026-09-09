import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listMemberComps, listPastComps, listOfficerComps } from '@/lib/competitions'
import { buildDonateUrl } from '@/lib/paypal-donate-url'
import { AddCompetitionForm } from '@/components/members/AddCompetitionForm'
import { CompetitionCard } from '@/components/members/CompetitionCard'
import { OfficerCompetitions } from '@/components/members/OfficerCompetitions'
import { PageHeader, EmptyState } from '@/components/ui'

// The club PayPal merchant id is a public payment identifier but is kept a
// SERVER env var (not NEXT_PUBLIC_*) — this page is a server component, so we
// build the donate URL here (where process.env is available) and pass only
// the resulting string down to the client CompetitionCard. If the env var is
// unset, buildDonateUrl still returns a URL (with an empty `business`) rather
// than throwing — a missing env var shouldn't crash the page.
const CHIP_IN_AMOUNT = 15

export default async function CompetitionsPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  const memberId = session.user.memberId
  const isBoard = !!session.user.isBoard

  // Pass isBoard so the contributor list (payer names) is only included for
  // board viewers — non-board members get the public total but not the names.
  const comps = await listMemberComps(memberId, { isBoard })
  const past = await listPastComps()

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <PageHeader eyebrow="🏆 Members" title="Competitions" lead="Track the comps you've entered and your beers. Officers coordinate club shipping." />

      <div className="mb-6"><AddCompetitionForm /></div>

      {comps.length === 0 ? (
        <EmptyState icon="🏆">No active competitions. Add one above.</EmptyState>
      ) : (
        <div className="space-y-4">
          {comps.map((c) => {
            const donateUrl = buildDonateUrl({
              merchantId: process.env.CLUB_PAYPAL_MERCHANT_ID ?? '',
              compId: c.id,
              compName: c.name,
              amount: CHIP_IN_AMOUNT,
            })
            return <CompetitionCard key={c.id} comp={c} viewerIsBoard={isBoard} viewerId={memberId} donateUrl={donateUrl} />
          })}
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
