import Anthropic from '@anthropic-ai/sdk'
import type { MembershipReports } from './index'

// Board-only, on-demand AI analysis over the already-computed aggregate
// membership metrics. This module owns the ONE thing that makes this feature
// safe to ship: the prompt is built by hand-picking aggregate fields out of
// `reports`, never by JSON.stringify-ing the whole object. That's the wall
// against a future field (email, per-member payment row, raw roster data)
// silently leaking into a third-party LLM call.
//
// PII WALL (read this before touching buildInsightsPrompt):
//   - tenureTop5[].name / expiringSoon[].name + their dates are OK — those
//     are already rendered on this board-gated page, so first names are not
//     new exposure.
//   - NEVER include: emails, per-member payment amounts/dates, or any raw
//     roster row. Only pull in fields that are already aggregate numbers.

const FRIENDLY_ERROR = "Couldn't generate insights right now — try again in a moment."

const SYSTEM_PROMPT =
  'You are an analyst for a homebrew club board. Given a compact summary of ' +
  "the club's membership metrics, give a concise, plain-English read: what's " +
  "healthy, what's at risk, notable trends, and 2-3 concrete suggestions. " +
  'This is board-only context — write for club officers, not the public.'

/**
 * Hand-picks aggregate fields from `reports` into a plain text block. Never
 * blind-JSON.stringify the whole reports object — see the PII WALL note
 * above. Only aggregate numbers + the already board-visible tenure/expiring
 * names+dates go in.
 */
export function buildInsightsPrompt(reports: MembershipReports): string {
  const { kpis, trends, tierMix, cohorts, revenue, tenureTop5, expiringSoon, paymentMix, growthSummary } = reports

  const lines: string[] = []

  lines.push('## KPIs')
  lines.push(`Active members: ${kpis.activeMembers}`)
  lines.push(`Total ever: ${kpis.totalEver}`)
  lines.push(`Lapsed (all time): ${kpis.lapsedAllTime}`)
  lines.push(`Retention: ${kpis.retentionPct}%`)
  lines.push(`Overall turnover: ${kpis.overallTurnoverPct}%`)
  lines.push(`Rolling 12mo turnover: ${kpis.rolling12moTurnoverPct}%`)
  lines.push(`New members (last 12mo): ${kpis.newLast12mo}`)
  lines.push(`New members (this year): ${kpis.newThisYear}`)
  lines.push(`Lapsed (last 12mo): ${kpis.lapsedLast12mo}`)
  lines.push(`Avg tenure: ${kpis.avgTenureMonths} months (${kpis.avgTenureYears} yrs)`)
  lines.push(`Avg tenure at lapse: ${kpis.avgTenureAtLapseMonths} months`)
  lines.push(`Expiring in next 30 days: ${kpis.expiringNext30}`)

  lines.push('')
  lines.push('## Growth summary')
  lines.push(`Current active (latest quarter): ${growthSummary.currentActive}`)
  lines.push(`Latest quarter net growth: ${growthSummary.latestNetGrowthPct ?? 'n/a'}%`)
  lines.push(`Record active membership: ${growthSummary.recordActive}${growthSummary.recordActiveQuarter ? ` (${growthSummary.recordActiveQuarter})` : ''}`)
  lines.push(`At record: ${growthSummary.atRecord ? 'yes' : 'no'}`)
  lines.push(`Best recruitment quarter: ${growthSummary.bestRecruitmentQuarter ?? 'n/a'} (+${growthSummary.bestRecruitmentNew})`)
  lines.push(`Consecutive growth quarters: ${growthSummary.consecutiveGrowthQuarters}`)

  lines.push('')
  lines.push('## Trends by quarter (quarter: new / churn / activeEOQ / turnover% / retention% / netGrowth%)')
  for (const t of trends) {
    lines.push(`${t.quarter}: new=${t.new} churn=${t.churn} activeEOQ=${t.activeEOQ} turnover=${t.turnoverPct}% retention=${t.retentionPct}% netGrowth=${t.netGrowthPct ?? 'n/a'}%`)
  }

  lines.push('')
  lines.push('## Tier mix (current members)')
  for (const row of tierMix) {
    lines.push(`${row.tier}: ${row.count}`)
  }

  lines.push('')
  lines.push('## Cohort retention (by join quarter)')
  for (const c of cohorts) {
    lines.push(`${c.cohort}: joined=${c.joined} stillActive=${c.stillActive} retention=${c.retentionPct ?? 'n/a'}%`)
  }

  lines.push('')
  lines.push('## Revenue by quarter')
  for (const r of revenue) {
    lines.push(`${r.quarter}: netDues=$${r.netDues} payments=${r.duesPayments} new=${r.newMembers} renewals=${r.renewals}`)
  }

  lines.push('')
  lines.push('## Payment mix (source totals)')
  for (const s of paymentMix.bySource) {
    lines.push(`${s.source}: ${s.count} payments, $${s.total} total`)
  }
  lines.push(`Average dues per payment: $${paymentMix.avgDues}`)

  lines.push('')
  lines.push(`## Expiring soon (${expiringSoon.length} total, board-visible names + expiry dates only)`)
  for (const e of expiringSoon.slice(0, 5)) {
    lines.push(`${e.name}: expires ${e.expires} (${e.daysLeft}d left)`)
  }

  lines.push('')
  lines.push('## Tenure leaders (board-visible names + join dates only)')
  for (const t of tenureTop5) {
    lines.push(`${t.name}: joined ${t.joinDate} (${t.tenureMonths} months)`)
  }

  return lines.join('\n')
}

export interface GenerateInsightsDeps {
  client?: Anthropic
}

/**
 * Calls Claude to produce a plain-English analysis of the already-computed
 * membership metrics. Fail-soft by design: ANY error (network, API, malformed
 * response) returns a friendly string rather than throwing — this is an
 * on-demand nice-to-have, never something that should crash the reports page.
 */
export async function generateInsights(
  reports: MembershipReports,
  deps: GenerateInsightsDeps = {}
): Promise<string> {
  try {
    const client = deps.client ?? new Anthropic()
    const user = buildInsightsPrompt(reports)

    const stream = client.messages.stream({
      model: 'claude-opus-5',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: user }],
    })
    const response = await stream.finalMessage()

    // Insights aren't a hard artifact like a saved note — if we hit
    // max_tokens, still return whatever text came back rather than discard it.
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()

    return text || FRIENDLY_ERROR
  } catch {
    return FRIENDLY_ERROR
  }
}
