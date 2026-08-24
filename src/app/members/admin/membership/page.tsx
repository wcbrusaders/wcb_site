import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getMembershipReports } from '@/lib/metrics'
import { PageHeader, SectionLabel, EmptyState } from '@/components/ui'
import { InfoCard, Row } from '@/components/members/InfoCard'

export const dynamic = 'force-dynamic'

// Small inline bar (no chart lib — matches the site-stats page convention).
function Bar({ label, value, max, hint }: { label: string; value: number; max: number; hint?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-24 shrink-0 text-foreground/50 tabular-nums">{label}</span>
      <div className="flex-1 h-4">
        <span
          className="block h-full rounded"
          style={{ width: `${pct}%`, background: 'color-mix(in srgb, #ff9500 75%, transparent)' }}
          title={hint ?? String(value)}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-foreground/60 tabular-nums">{value}</span>
    </div>
  )
}

const fmtPct = (n: number | null) => (n == null ? '—' : `${n}%`)
const fmtUsd = (n: number) => `$${n.toFixed(2)}`

export default async function MembershipReportsPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  if (!session.user.isBoard) redirect('/members')

  const r = await getMembershipReports()
  const k = r.kpis

  const seasonMax = Math.max(1, ...r.seasonality.map((s) => s.joins))
  const generated = new Date(r.generatedAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <PageHeader
        back={{ href: '/members/admin', label: 'Admin' }}
        eyebrow="🛡️ Board"
        title="Membership reports"
        lead="Membership health computed from the club's own records — the same metrics as the roster workbook, always current. Board-only."
      />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <InfoCard title="Members" icon="🧑‍🤝‍🧑">
          <Row label="Active" value={String(k.activeMembers)} />
          <Row label="Lapsed (all-time)" value={String(k.lapsedAllTime)} />
          <Row label="Total (ever)" value={String(k.totalEver)} />
        </InfoCard>
        <InfoCard title="Retention" icon="📈">
          <Row label="Retention rate" value={fmtPct(k.retentionPct)} />
          <Row label="Overall turnover" value={fmtPct(k.overallTurnoverPct)} />
          <Row label="Rolling 12-mo turnover" value={fmtPct(k.rolling12moTurnoverPct)} />
        </InfoCard>
        <InfoCard title="Growth & tenure" icon="🌱">
          <Row label="New (last 12 mo)" value={String(k.newLast12mo)} />
          <Row label="New (this year)" value={String(k.newThisYear)} />
          <Row label="Avg tenure" value={`${k.avgTenureMonths} mo (${k.avgTenureYears} yr)`} />
        </InfoCard>
        <InfoCard title="Renewals" icon="⏰">
          <Row label="Expiring (next 30 days)" value={String(k.expiringNext30)} />
          <Row label="Lapsed (last 12 mo)" value={String(k.lapsedLast12mo)} />
          <Row label="Avg tenure at lapse" value={`${k.avgTenureAtLapseMonths} mo`} />
        </InfoCard>
        <InfoCard title="Longest-tenured" icon="🏅">
          <Row label="Member" value={k.longestTenuredMember ?? '—'} />
        </InfoCard>
      </div>

      {/* Trends (per quarter) */}
      <SectionLabel icon="📊">Trends by quarter</SectionLabel>
      {r.trends.length === 0 ? (
        <EmptyState icon="📊">No quarterly data yet.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-foreground/50 text-left">
              <tr>
                <th className="py-1 pr-3 font-medium">Quarter</th>
                <th className="py-1 px-2 font-medium text-right">New</th>
                <th className="py-1 px-2 font-medium text-right">Churn</th>
                <th className="py-1 px-2 font-medium text-right">Active</th>
                <th className="py-1 px-2 font-medium text-right">Turnover</th>
                <th className="py-1 px-2 font-medium text-right">Retention</th>
                <th className="py-1 px-2 font-medium text-right">Net growth</th>
              </tr>
            </thead>
            <tbody>
              {r.trends.map((t) => (
                <tr key={t.quarter} className="border-t" style={{ borderColor: '#242424' }}>
                  <td className="py-1 pr-3">{t.quarter}</td>
                  <td className="py-1 px-2 text-right">{t.new}</td>
                  <td className="py-1 px-2 text-right">{t.churn}</td>
                  <td className="py-1 px-2 text-right">{t.activeEOQ}</td>
                  <td className="py-1 px-2 text-right">{fmtPct(t.turnoverPct)}</td>
                  <td className="py-1 px-2 text-right">{fmtPct(t.retentionPct)}</td>
                  <td className="py-1 px-2 text-right">{t.netGrowthPct == null ? '—' : `${t.netGrowthPct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tier mix */}
      <SectionLabel icon="🎟️">Tier mix</SectionLabel>
      <div className="grid gap-2 sm:grid-cols-2">
        {r.tierMix.map((t) => (
          <div key={t.tier} className="flex justify-between text-sm rounded-lg border px-3 py-2" style={{ borderColor: '#242424' }}>
            <span className="text-foreground/60">{t.tier}</span>
            <span className="tabular-nums">{t.count}</span>
          </div>
        ))}
      </div>

      {/* Seasonality */}
      <SectionLabel icon="🗓️">Joins by month (all-time)</SectionLabel>
      <div className="space-y-1.5">
        {r.seasonality.map((s) => (
          <Bar key={s.month} label={s.month} value={s.joins} max={seasonMax} hint={`${s.joins} joins in ${s.month}`} />
        ))}
      </div>

      {/* Cohort retention */}
      <SectionLabel icon="👥">Cohort retention (by join quarter)</SectionLabel>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-foreground/50 text-left">
            <tr>
              <th className="py-1 pr-3 font-medium">Cohort</th>
              <th className="py-1 px-2 font-medium text-right">Joined</th>
              <th className="py-1 px-2 font-medium text-right">Still active</th>
              <th className="py-1 px-2 font-medium text-right">Retention</th>
            </tr>
          </thead>
          <tbody>
            {r.cohorts.map((c) => (
              <tr key={c.cohort} className="border-t" style={{ borderColor: '#242424' }}>
                <td className="py-1 pr-3">{c.cohort}</td>
                <td className="py-1 px-2 text-right">{c.joined}</td>
                <td className="py-1 px-2 text-right">{c.stillActive}</td>
                <td className="py-1 px-2 text-right">{fmtPct(c.retentionPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Revenue */}
      <SectionLabel icon="💵">Revenue by quarter</SectionLabel>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-foreground/50 text-left">
            <tr>
              <th className="py-1 pr-3 font-medium">Quarter</th>
              <th className="py-1 px-2 font-medium text-right">Net dues</th>
              <th className="py-1 px-2 font-medium text-right">Payments</th>
              <th className="py-1 px-2 font-medium text-right">New</th>
              <th className="py-1 px-2 font-medium text-right">Renewals</th>
            </tr>
          </thead>
          <tbody>
            {r.revenue.map((rev) => (
              <tr key={rev.quarter} className="border-t" style={{ borderColor: '#242424' }}>
                <td className="py-1 pr-3">{rev.quarter}</td>
                <td className="py-1 px-2 text-right">{fmtUsd(rev.netDues)}</td>
                <td className="py-1 px-2 text-right">{rev.duesPayments}</td>
                <td className="py-1 px-2 text-right">{rev.newMembers}</td>
                <td className="py-1 px-2 text-right">{rev.renewals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-8 text-[11px] text-foreground/40">
        Computed from the club roster + payment records. Generated {generated}. Events income isn&apos;t tracked yet (shown as $0 in totals).
      </p>
    </div>
  )
}
