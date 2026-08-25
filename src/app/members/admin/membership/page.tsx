import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getMembershipReports } from '@/lib/metrics'
import { fetchLapsedMembers } from '@/lib/metrics/lapsed'
import { prisma } from '@/lib/db'
import { PageHeader, SectionLabel, EmptyState } from '@/components/ui'
import { InfoCard, Row } from '@/components/members/InfoCard'
import { TrendsCompareChart } from '@/components/members/reports/TrendsCompareChart'
import { TierDonut } from '@/components/members/reports/TierDonut'
import { SeasonalityBars } from '@/components/members/reports/SeasonalityBars'
import { MembershipInsights } from '@/components/members/MembershipInsights'
import { LapsedMembersEditor } from '@/components/members/LapsedMembersEditor'

export const dynamic = 'force-dynamic'

const fmtPct = (n: number | null) => (n == null ? '—' : `${n}%`)
const fmtUsd = (n: number) => `$${n.toFixed(2)}`

// A big-number tile for the positive-first KPI row. `tone` colors the delta.
function KpiTile({
  label,
  value,
  delta,
  tone = 'neutral',
}: {
  label: string
  value: string
  delta?: string
  tone?: 'good' | 'muted' | 'neutral'
}) {
  const deltaColor = tone === 'good' ? '#0ca30c' : tone === 'muted' ? '#898781' : '#c3c2b7'
  return (
    <div className="rounded-2xl border p-5 bg-[linear-gradient(#1c1c1c,#161616)]" style={{ borderColor: '#2c2c2c' }}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-foreground/45 mb-2">{label}</p>
      <p className="text-3xl font-bold text-foreground">{value}</p>
      {delta && <p className="text-xs mt-1.5" style={{ color: deltaColor }}>{delta}</p>}
    </div>
  )
}

// A smaller, muted secondary tile — for the turnover/lapsed row that's
// shown but not led with (positive-first framing).
function SecondaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border px-4 py-3" style={{ borderColor: '#242424' }}>
      <p className="text-[10px] uppercase tracking-widest text-foreground/40 mb-1">{label}</p>
      <p className="text-lg font-semibold text-foreground/70">{value}</p>
    </div>
  )
}

export default async function MembershipReportsPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  if (!session.user.isBoard) redirect('/members')

  const r = await getMembershipReports()
  const lapsedMembers = await fetchLapsedMembers(prisma)
  const k = r.kpis
  const g = r.growthSummary

  const generated = new Date(r.generatedAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

  // Momentum callout lines (positive-first framing) — built from growthSummary.
  const momentumLines: string[] = []
  if (g.atRecord && g.recordActive > 0) {
    momentumLines.push(`🏆 Record ${g.recordActive} active members`)
  }
  if (g.bestRecruitmentQuarter) {
    momentumLines.push(`Best recruitment quarter: ${g.bestRecruitmentQuarter} (+${g.bestRecruitmentNew})`)
  }
  if (g.consecutiveGrowthQuarters >= 2) {
    momentumLines.push(`${g.consecutiveGrowthQuarters} consecutive quarters of growth`)
  }

  const netGrowthTone: 'good' | 'muted' = (g.latestNetGrowthPct ?? 0) > 0 ? 'good' : 'muted'

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <PageHeader
        back={{ href: '/members/admin', label: 'Admin' }}
        eyebrow="🛡️ Board"
        title="Membership reports"
        lead="Membership health computed from the club's own records — the same metrics as the roster workbook, always current. Board-only."
      />

      {/* Zone 1: KPI tiles — positive-first framing. */}
      <div className="grid gap-4 sm:grid-cols-4">
        <KpiTile
          label="Active members"
          value={String(k.activeMembers)}
          delta={g.latestNetGrowthPct != null ? `${g.latestNetGrowthPct > 0 ? '↑' : g.latestNetGrowthPct < 0 ? '↓' : '→'} ${Math.abs(g.latestNetGrowthPct)}% vs last quarter` : undefined}
          tone={g.latestNetGrowthPct != null && g.latestNetGrowthPct > 0 ? 'good' : 'neutral'}
        />
        <KpiTile
          label="Net growth (latest qtr)"
          value={fmtPct(g.latestNetGrowthPct)}
          tone={netGrowthTone}
        />
        <KpiTile label="New (12 mo)" value={String(k.newLast12mo)} />
        <KpiTile label="Retention" value={fmtPct(k.retentionPct)} />
      </div>

      {momentumLines.length > 0 && (
        <div
          className="mt-4 rounded-xl border px-4 py-3 flex flex-col gap-1"
          style={{ borderColor: 'color-mix(in srgb, #0ca30c 30%, #2c2c2c)', background: 'color-mix(in srgb, #0ca30c 8%, transparent)' }}
        >
          {momentumLines.map((line) => (
            <p key={line} className="text-sm text-foreground/85">{line}</p>
          ))}
        </div>
      )}

      {/* Secondary row — turnover/lapsed, muted, shown but not led with. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <SecondaryTile label="Turnover (overall)" value={fmtPct(k.overallTurnoverPct)} />
        <SecondaryTile label="Turnover (rolling 12mo)" value={fmtPct(k.rolling12moTurnoverPct)} />
        <SecondaryTile label="Lapsed (12 mo)" value={String(k.lapsedLast12mo)} />
        <SecondaryTile label="Expiring (60d)" value={String(r.expiringSoon.length)} />
      </div>

      {/* Zone 2: comparison chart — the centerpiece. */}
      <SectionLabel icon="📊">Trends comparison (quarterly)</SectionLabel>
      <TrendsCompareChart trends={r.trends} revenue={r.revenue} />

      {/* Zone 3: composition row. */}
      <SectionLabel icon="🎟️">Composition</SectionLabel>
      <div className="grid gap-4 md:grid-cols-2">
        <TierDonut tierMix={r.tierMix} />
        <SeasonalityBars seasonality={r.seasonality} />
      </div>

      {/* Zone 4: dense tables — cohort retention + revenue. */}
      <SectionLabel icon="👥">Cohort retention (by join quarter)</SectionLabel>
      {r.cohorts.length === 0 ? (
        <EmptyState icon="👥">No cohort data yet.</EmptyState>
      ) : (
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
      )}

      <SectionLabel icon="💵">Revenue by quarter</SectionLabel>
      {r.revenue.length === 0 ? (
        <EmptyState icon="💵">No revenue data yet.</EmptyState>
      ) : (
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
      )}

      {/* Zone 5: tenure top-5, expiring-soon callout, payment mix. */}
      <SectionLabel icon="🏅">Tenure, renewals & payments</SectionLabel>
      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard title="Top 5 tenure" icon="🏅">
          {r.tenureTop5.length === 0 ? (
            <p className="text-sm text-foreground/40">No current members with a join date.</p>
          ) : (
            r.tenureTop5.map((t, i) => (
              <Row key={t.name + t.joinDate} label={`${i + 1}. ${t.name}`} value={`${t.tenureMonths} mo`} />
            ))
          )}
        </InfoCard>

        {/* Expiring-soon — highlighted actionable callout card. */}
        <div
          className="rounded-2xl border p-5 md:p-6"
          style={{
            borderColor: r.expiringSoon.length > 0 ? 'color-mix(in srgb, #eda100 35%, #2c2c2c)' : '#2c2c2c',
            background: r.expiringSoon.length > 0 ? 'color-mix(in srgb, #eda100 6%, #1c1c1c)' : 'linear-gradient(#1c1c1c,#161616)',
          }}
        >
          <p className="text-accent font-semibold tracking-widest uppercase text-[11px] mb-4 flex items-center gap-2">
            <span aria-hidden>⏰</span> Expiring soon (60 days)
          </p>
          {r.expiringSoon.length === 0 ? (
            <p className="text-sm text-foreground/40">Nothing expiring in the next 60 days.</p>
          ) : (
            <ul className="space-y-2">
              {r.expiringSoon.map((e) => (
                <li key={e.name + e.expires} className="flex justify-between gap-3 text-sm">
                  <span className="text-foreground/80">{e.name}</span>
                  <span className="text-foreground/50 text-right tabular-nums">
                    {e.expires} · {e.daysLeft}d
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <InfoCard title="Payment mix" icon="💳">
          {r.paymentMix.bySource.length === 0 ? (
            <p className="text-sm text-foreground/40">No payment records yet.</p>
          ) : (
            <>
              {r.paymentMix.bySource.map((s) => (
                <Row key={s.source} label={s.source} value={`${s.count} · ${fmtUsd(s.total)}`} />
              ))}
              <Row label="Avg dues / payment" value={fmtUsd(r.paymentMix.avgDues)} />
            </>
          )}
        </InfoCard>
      </div>

      {/* Zone 6: why members left — board-editable reason capture. */}
      <SectionLabel icon="🔍">Why members left</SectionLabel>
      <LapsedMembersEditor members={lapsedMembers} />

      {/* Zone 7: on-demand AI analysis over the metrics above. */}
      <SectionLabel icon="✨">AI insights</SectionLabel>
      <MembershipInsights />

      <p className="mt-8 text-[11px] text-foreground/40">
        Computed from the club roster + payment records. Generated {generated}. Events income isn&apos;t tracked yet (shown as $0 in totals).
      </p>
    </div>
  )
}
