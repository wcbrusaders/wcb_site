import { test, expect } from 'vitest'
import { generateInsights } from './insights'
import type { MembershipReports } from './index'

// Realistic fixture built from the MembershipReports shape (src/lib/metrics/index.ts).
// Names + dates here mirror what's already board-visible on the reports page
// (tenureTop5 / expiringSoon) — no emails, no per-member payment data.
const reports: MembershipReports = {
  kpis: {
    activeMembers: 42,
    lapsedAllTime: 18,
    totalEver: 60,
    overallTurnoverPct: 30,
    retentionPct: 70,
    avgTenureMonths: 22.5,
    avgTenureYears: 1.9,
    newLast12mo: 9,
    newThisYear: 6,
    lapsedLast12mo: 3,
    rolling12moTurnoverPct: 6.7,
    expiringNext30: 2,
    longestTenuredMember: 'Bob',
    avgTenureAtLapseMonths: 14.2,
  },
  trends: [
    { quarter: '2026-Q1', new: 4, churn: 1, activeEOQ: 38, turnoverPct: 2.6, retentionPct: 97.4, newYoyPct: 10, netGrowthPct: 7.9 },
    { quarter: '2026-Q2', new: 5, churn: 1, activeEOQ: 42, turnoverPct: 2.4, retentionPct: 97.6, newYoyPct: 12, netGrowthPct: 10.5 },
  ],
  tierMix: [
    { tier: 'Single', count: 30 },
    { tier: 'Couple', count: 12 },
  ],
  seasonality: [
    { month: 'Jan', joins: 3 },
    { month: 'Feb', joins: 2 },
  ],
  cohorts: [
    { cohort: '2025-Q4', joined: 8, stillActive: 6, retentionPct: 75 },
  ],
  revenue: [
    { quarter: '2026-Q1', netDues: 1200, eventsIncome: 0, totalRevenue: 1200, duesPayments: 20, newMembers: 4, renewals: 16 },
    { quarter: '2026-Q2', netDues: 1350, eventsIncome: 0, totalRevenue: 1350, duesPayments: 22, newMembers: 5, renewals: 17 },
  ],
  tenureTop5: [
    { name: 'Bob', joinDate: '2024-02-10', tenureMonths: 30 },
    { name: 'Alice', joinDate: '2025-11-01', tenureMonths: 9 },
  ],
  expiringSoon: [
    { name: 'Carol', expires: '2026-09-10', daysLeft: 17 },
    { name: 'Dave', expires: '2026-10-01', daysLeft: 38 },
  ],
  paymentMix: {
    bySource: [
      { source: 'Stripe', count: 30, total: 1500 },
      { source: 'PayPal', count: 12, total: 600 },
    ],
    avgDues: 50,
    totalPayments: 42,
  },
  growthSummary: {
    currentActive: 42,
    latestNetGrowthPct: 10.5,
    recordActive: 42,
    recordActiveQuarter: '2026-Q2',
    atRecord: true,
    bestRecruitmentQuarter: '2026-Q2',
    bestRecruitmentNew: 5,
    consecutiveGrowthQuarters: 2,
  },
  generatedAt: '2026-08-24T00:00:00.000Z',
}

// Fake Anthropic client matching extract-notes.ts's DI pattern: injectable
// `client`, `.messages.stream(args).finalMessage()`.
function fakeClient(capture: { args?: unknown }, text = 'FAKE INSIGHT') {
  return {
    messages: {
      stream: (args: unknown) => {
        capture.args = args
        return {
          finalMessage: async () => ({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text }],
          }),
        }
      },
    },
  }
}

function throwingClient() {
  return {
    messages: {
      stream: () => {
        throw new Error('boom')
      },
    },
  }
}

test('builds a prompt containing key aggregate metrics', async () => {
  const capture: { args?: unknown } = {}
  const client = fakeClient(capture)
  await generateInsights(reports, { client: client as never })

  const args = capture.args as { system: string; messages: { content: string }[] }
  const prompt = args.system + '\n' + args.messages.map((m) => m.content).join('\n')

  // (a) active count / a retention value / a trend quarter
  expect(prompt).toContain('42') // activeMembers
  expect(prompt).toContain('70') // retentionPct
  expect(prompt).toContain('2026-Q2') // a trend quarter
})

test('never includes an email address anywhere in the built prompt', async () => {
  const capture: { args?: unknown } = {}
  const client = fakeClient(capture)
  await generateInsights(reports, { client: client as never })

  const args = capture.args as { system: string; messages: { content: string }[] }
  const prompt = args.system + '\n' + args.messages.map((m) => m.content).join('\n')

  expect(prompt).not.toContain('@')
})

test('returns the model text on success', async () => {
  const capture: { args?: unknown } = {}
  const client = fakeClient(capture, 'FAKE INSIGHT')
  const result = await generateInsights(reports, { client: client as never })
  expect(result).toEqual({ ok: true, text: 'FAKE INSIGHT' })
})

test('fails soft: a throwing client returns an error result, never throws', async () => {
  const client = throwingClient()
  await expect(generateInsights(reports, { client: client as never })).resolves.toEqual({
    ok: false,
    error: expect.stringContaining('try again'),
  })
})

test('an empty model response is an error result, not a blank insight', async () => {
  const capture: { args?: unknown } = {}
  const client = fakeClient(capture, '   ') // whitespace-only → trims to empty
  const result = await generateInsights(reports, { client: client as never })
  expect(result).toEqual({ ok: false, error: expect.stringContaining('try again') })
})
