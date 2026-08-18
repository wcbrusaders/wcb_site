import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getStats } from '@/lib/stats/query'
import { PageHeader, SectionLabel, EmptyState } from '@/components/ui'
import { InfoCard, Row } from '@/components/members/InfoCard'

export const dynamic = 'force-dynamic'

export default async function StatsPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  if (!session.user.isBoard) redirect('/members')

  const stats = await getStats({ days: 30 })
  const maxDay = Math.max(1, ...stats.byDay.map((d) => d.public + d.members))

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <PageHeader
        back={{ href: '/members/admin', label: 'Admin' }}
        eyebrow="🛡️ Board"
        title="Site stats"
        lead="How the site is used over the last 30 days. Aggregate counts only — no individual browsing history. (Vercel Analytics has the richer public dashboard.)"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <InfoCard title="Main site" icon="🌐">
          <Row label="Views (30d)" value={String(stats.publicViews)} />
        </InfoCard>
        <InfoCard title="Member features" icon="🔑">
          <Row label="Views (30d)" value={String(stats.memberViews)} />
        </InfoCard>
        <InfoCard title="Active members" icon="🧑‍🤝‍🧑">
          <Row label="Distinct (30d)" value={String(stats.distinctMembers)} />
        </InfoCard>
      </div>

      <SectionLabel icon="📊">By day</SectionLabel>
      {stats.byDay.length === 0 ? (
        <EmptyState icon="📊">No traffic recorded yet — check back once the site sees some visits.</EmptyState>
      ) : (
        <div className="space-y-1.5">
          {stats.byDay.map((d) => {
            const total = d.public + d.members
            const pubPct = Math.round((d.public / maxDay) * 100)
            const memPct = Math.round((d.members / maxDay) * 100)
            return (
              <div key={d.day} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-foreground/50 tabular-nums">{d.day}</span>
                <div className="flex-1 flex items-center gap-0.5 h-4">
                  <span className="h-full rounded-l" style={{ width: `${pubPct}%`, background: 'color-mix(in srgb, #7f9cf5 70%, transparent)' }} title={`${d.public} public`} />
                  <span className="h-full rounded-r" style={{ width: `${memPct}%`, background: 'color-mix(in srgb, #ff9500 75%, transparent)' }} title={`${d.members} member`} />
                </div>
                <span className="w-28 shrink-0 text-right text-foreground/60 tabular-nums">
                  {total} · {d.activeMembers} mbr
                </span>
              </div>
            )
          })}
          <div className="flex items-center gap-4 mt-3 text-[11px] text-foreground/45">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: 'color-mix(in srgb, #7f9cf5 70%, transparent)' }} /> Main site</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: 'color-mix(in srgb, #ff9500 75%, transparent)' }} /> Member features</span>
            <span>· “mbr” = distinct members active that day</span>
          </div>
        </div>
      )}
    </div>
  )
}
