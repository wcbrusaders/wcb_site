import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getMemberDashboard, formatTenure, membershipStatus, visibleCards } from '@/lib/dashboard'
import { InfoCard, Row } from '@/components/members/InfoCard'
import { FeatureNav } from '@/components/members/FeatureNav'

function fmtDate(d: Date | null): string | null {
  return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null
}

export default async function MembersPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')
  const email = session.user.email
  const rec = await getMemberDashboard(email)

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-4xl mx-auto px-6 py-24">
        <p className="text-accent font-medium tracking-wide uppercase text-sm mb-4">Members Hub</p>
        <h1 className="text-3xl md:text-4xl font-bold mb-2">
          Welcome{rec?.name ? `, ${rec.name}` : ''}
        </h1>
        <p className="text-foreground/50 mb-10">{email}</p>

        {!rec ? (
          <div className="rounded-2xl border border-border/50 bg-card-bg/30 p-6 md:p-8 mb-12">
            <p className="text-foreground/70">
              We couldn&apos;t load your membership details — they may still be syncing.
              Contact an officer if this persists.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 mb-12">
            {visibleCards(rec).includes('membership') && (
              <InfoCard title="Membership">
                <Row label="Status" value={membershipStatus(rec)} />
                <Row label="Tier" value={rec.tier} />
                <Row label="Board" value={rec.isBoard ? 'Board Member' : null} />
              </InfoCard>
            )}
            {visibleCards(rec).includes('timeline') && (
              <InfoCard title="Timeline">
                <Row label="Joined" value={fmtDate(rec.joinDate)} />
                <Row label="Member for" value={formatTenure(rec.joinDate) || null} />
                <Row label="Renews" value={fmtDate(rec.expires)} />
                <Row label="Last payment" value={fmtDate(rec.paymentDate)} />
              </InfoCard>
            )}
            {visibleCards(rec).includes('connections') && (
              <InfoCard title="Connections">
                <Row label="Linked partner" value={rec.partnerEmail} />
              </InfoCard>
            )}
            {visibleCards(rec).includes('access') && (
              <InfoCard title="Resources Access">
                <Row
                  label="Drive & Calendar"
                  value={rec.resourceAccess ? 'You have access' : 'Not currently granted'}
                />
              </InfoCard>
            )}
          </div>
        )}

        <h2 className="text-xl font-semibold mb-4">Member Features</h2>
        <FeatureNav />
      </main>
    </div>
  )
}
