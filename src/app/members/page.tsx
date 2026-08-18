import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getMemberDashboard, formatTenure, membershipStatus, visibleCards } from '@/lib/dashboard'
import { listOfficerComps, computeBannerItems } from '@/lib/competitions'
import { InfoCard, Row } from '@/components/members/InfoCard'
import { CompBanner } from '@/components/members/CompBanner'

function fmtDate(d: Date | null): string | null {
  return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null
}

export default async function MembersPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')
  const email = session.user.email
  const rec = await getMemberDashboard(email)
  const cards = rec ? visibleCards(rec) : []
  const bannerItems = session.user.memberId
    ? computeBannerItems(await listOfficerComps(), session.user.memberId, !!session.user.isBoard, new Date())
    : []

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-4xl mx-auto px-6 py-24">
        <p className="text-accent font-medium tracking-wide uppercase text-sm mb-4">Members Hub</p>
        <h1 className="text-3xl md:text-4xl font-bold mb-2">
          Welcome{rec?.name ? `, ${rec.name}` : ''}
        </h1>
        <p className="text-foreground/50 mb-10">{email}</p>

        <CompBanner items={bannerItems} />

        <Link href="/members/resources/getting-started"
          className="block rounded-2xl border border-accent/40 bg-accent/[0.06] hover:bg-accent/[0.1] p-5 md:p-6 mt-6">
          <div className="font-bold text-lg">New here? Start here →</div>
          <div className="text-sm text-foreground/60 mt-1">How to borrow gear, enter competitions, join a grain buy, use the bot, and more.</div>
        </Link>

        {!rec ? (
          <div className="rounded-2xl border border-border/50 bg-card-bg/30 p-6 md:p-8 mb-12">
            <p className="text-foreground/70">
              We couldn&apos;t load your membership details — they may still be syncing.
              Contact an officer if this persists.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 mb-12">
            {cards.includes('membership') && (
              <InfoCard title="Membership">
                <Row label="Status" value={membershipStatus(rec)} />
                <Row label="Tier" value={rec.tier} />
                <Row label="Board" value={rec.isBoard ? 'Board Member' : null} />
              </InfoCard>
            )}
            {cards.includes('timeline') && (
              <InfoCard title="Timeline">
                <Row label="Joined" value={fmtDate(rec.joinDate)} />
                <Row label="Member for" value={formatTenure(rec.joinDate) || null} />
                <Row label="Renews" value={fmtDate(rec.expires)} />
                <Row label="Last payment" value={fmtDate(rec.paymentDate)} />
              </InfoCard>
            )}
            {cards.includes('connections') && (
              <InfoCard title="Connections">
                <Row label="Linked partner" value={rec.partnerEmail} />
              </InfoCard>
            )}
            {cards.includes('access') && (
              <InfoCard title="Resources Access">
                <Row
                  label="Drive & Calendar"
                  value={rec.resourceAccess ? 'You have access' : 'Not currently granted'}
                />
              </InfoCard>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
