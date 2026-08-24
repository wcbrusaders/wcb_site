# Membership Reports+ : tenure top-5, expiring-soon, payment mix, AI insights

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps `- [ ]`.

**Goal:** Extend the membership reports with 3 more views (top-5 tenure leaderboard, expiring-soon-by-name, payment mix/avg dues) and an on-demand "Generate insights" AI button that has Claude read the computed metrics and return a plain-English analysis. (Referrals dropped — no data yet.)

**Architecture:** Extend `src/lib/metrics/` (pure compute) for the 3 reports; render them on the existing `/members/admin/membership` page. AI insights = a board-gated server action that builds a compact metrics summary and calls Claude via the site's existing `@anthropic-ai/sdk` pattern (`new Anthropic()`, `messages.create`, model `claude-opus-5`, DI for tests), triggered by a small client button.

**Tech Stack:** Next.js/TS, Prisma (read-only), Vitest, `@anthropic-ai/sdk` (already a dep).

## Global Constraints
- Metrics stay pure (arrays + injected `now`); match existing engine style + UTC discipline; reuse `round1`/`quarters.ts`.
- AI insights: board-gated (server action re-checks `isBoard`); send ONLY the already-board-visible aggregate metrics (the same numbers on the page) — NO extra PII, no raw roster rows with emails. On-demand only (cost only on click). Fail-soft (Claude error → friendly message, never crash the page).
- Vitest; `npx tsc --noEmit` clean; `next build` compiles.
- Commits: heredoc/file, explicit `git add`, never `-A`.

## Task 1: tenure top-5 + expiring-soon + payment mix (pure metrics)
**Files:** `src/lib/metrics/kpis.ts` or a new `src/lib/metrics/lists.ts` (+ test); `types.ts`.
- [ ] Step 1: failing tests (hand-computed fixtures):
  - `computeTenureLeaderboard(members, limit=5) -> [{ name, joinDate, tenureMonths }]` — CURRENT members sorted by earliest joinDate asc, top N, with completeMonths tenure. (Reuse `completeMonths` from kpis.ts — export it.)
  - `computeExpiringSoon(members, { now, windowDays }) -> [{ name, expires, daysLeft }]` — CURRENT members with `expires` in [now, now+windowDays], sorted soonest first. Default windows: expose 30/60/90 by letting the caller pass windowDays; return the list; the page can call for 60.
  - `computePaymentMix(payments) -> { bySource: [{ source, count, total }], avgDues, totalPayments }` — group by source (Stripe/PayPal), count+sum each, avg = round2(sum(all)/count).
- [ ] Step 2: FAIL.
- [ ] Step 3: implement in `lists.ts` (new module; keeps kpis.ts focused). Export `completeMonths` from kpis.ts for reuse (don't duplicate). round2 = Math.round(x*100)/100.
- [ ] Step 4: PASS + tsc.
- [ ] Step 5: commit `feat(metrics): tenure top-5, expiring-soon, payment mix`.

## Task 2: data wiring + PROFESSIONAL dashboard redesign (Recharts, zones, comparison chart)
**Files:** `src/lib/metrics/index.ts` (add reports), `src/app/members/admin/membership/page.tsx` (redesign), new client chart components under `src/components/members/reports/`. Add `recharts` dependency.

Design goals (Jordan): professional + easy to digest (real graphs, clear visual separation) + **compare multiple metrics for correlation-spotting**.

- [ ] **Data:** add `tenureTop5`, `expiringSoon` (60d), `paymentMix`, and `growthSummary` (computeGrowthSummary(trends)) to `MembershipReports` + `computeMembershipReports`; update index test. (These are Task-1's fns.)
- [ ] **Add Recharts** (`npm i recharts`). Charts are client components ('use client'); the page stays a server component that fetches + passes data down.
- [ ] **Dashboard zones layout** (replace the single-scroll table page):
  1. **KPI tiles** row — POSITIVE-FIRST framing (Jordan: "I want to know when we're doing something right"). Lead with growth: **Active members** (big, with ↑ vs last qtr), **Net growth %** (latest qtr, green when positive), **New (12 mo)**, **Retention %**. A **momentum callout**: "🏆 Record 30 active" (if `growthSummary.atRecord`), "best recruitment quarter: 2025-Q4 (+6)", "N consecutive quarters of growth". Turnover/lapsed move to a SMALLER secondary row (still shown, not led with, muted color). Use `growthSummary` (T1's computeGrowthSummary).
  2. **Trends — multi-series COMPARISON chart** (the correlation tool): one Recharts chart on a shared **quarter x-axis** with TOGGLEABLE series — New, Churn, Active (EOQ), Retention %, Revenue (net dues). Legend toggles which lines show so you can overlay any two to eyeball correlation (e.g. revenue vs new members). Dual Y-axis for differing scales (counts vs % vs $) or normalize — implementer picks the clean approach; **default-show Active (EOQ) — the growth line** + New. `TrendsCompareChart.tsx` takes trends[] + revenue[] joined by quarter.
     - **MILESTONE MARKERS (Jordan):** overlay labeled Recharts `ReferenceLine`s / annotations on the quarter axis for known events, so growth can be read against what drove it. Marker data = a small curated const array `MILESTONES` in the chart component (NOT from calendar — that's Phase 5): `{ quarter: '2025-Q4', label: 'Reorg/restructure' }` (Dec2025–Jan2026, the sheet's ★), `{ quarter: '2026-Q3', label: 'Bylaws effective (Sep 25 2026)' }`, `{ quarter: '2026-Q4', label: 'NCHF (~Oct 18, annual signups)' }`, and a Brulosophy/Martin-Keene marker once Jordan supplies the date (leave a clearly-labeled TODO const entry + a comment so it's a one-line add). Markers render as vertical reference lines with a short label; keep legible on the dark theme. This is the seed of Phase-5 event-attribution — structure MILESTONES so it could later be fed from real events.
  3. **Composition row** — two charts side-by-side: **tier mix donut** + **joins-by-month bar** (seasonality).
  4. **Tables** for the dense grids: cohort retention + revenue (keep tabular — good for scanning exact numbers).
  5. **Top-5 tenure** list (replaces single longest-tenured) + **Expiring-soon (60d)** as a highlighted actionable callout card (name + date + days-left) + **Payment mix** card (Stripe/PayPal count+total, avg dues).
  - Use System-B surfaces (Card/InfoCard/SectionLabel) for the zone containers so it matches the site. Charts themed to the dark surface (axis/grid/tooltip colors readable on #1c1c1c; accent #ff9500 for primary series).
- [ ] tsc + `next build` (Recharts SSR: charts must be client components; wrap in a client boundary; verify the build compiles the route). Handle empty/short data (few quarters) gracefully.
- [ ] commit `feat(admin): Recharts dashboard — KPI tiles, multi-series comparison chart, composition charts, tenure/expiring/payment`.

NOTE: the multi-series comparison chart is also the future home for **event-attribution** (Phase 5) — event markers on the same quarter/time axis. Build the series-toggle so adding an "events" overlay later is natural.

## Task 3: AI insights — server action + button
**Files:** `src/lib/metrics/insights.ts` (Claude call), `src/app/members/admin/membership/_actions.ts` (server action), a small client component `src/components/members/MembershipInsights.tsx`, wire into the page.
- [ ] Step 1: failing test for `generateInsights(reports, { client })` (DI the Anthropic client like extract-notes.ts): builds a prompt from the metrics summary, calls `client.messages.create`, returns the text. Test with a FAKE client asserting (a) the prompt contains key metrics (active/retention/a trend), (b) NO email/PII strings are in the prompt (guard: the reports objects carry names for tenure/expiring — decide: names are board-visible on the page already, so including first-names is OK; but do NOT include emails/payment-per-member; assert no '@' in the prompt), (c) returns the model's text, (d) a throwing client → returns a friendly error string, not a throw.
- [ ] Step 2: FAIL.
- [ ] Step 3: implement `generateInsights`: compact the reports into a text block (KPIs, the trends table, tier mix, cohort summary, revenue totals, expiring count + soonest few), system prompt = "You are an analyst for a homebrew club board; give a concise, plain-English read: what's healthy, what's at risk, notable trends, and 2-3 concrete suggestions. Board-only context." model `claude-opus-5`, max_tokens ~1500, NON-streaming ok at that size (extract-notes streams at 32k; 1500 is fine non-streamed — but if the SDK requires streaming for the configured max, follow extract-notes' streaming pattern). Fail-soft.
  - Server action `_actions.ts`: `await auth()`, re-check `isBoard` (403 otherwise), call `getMembershipReports()` + `generateInsights()`, return `{ ok, text } | { ok:false, error }`. NEVER expose the key; the action runs server-side.
  - Client `MembershipInsights.tsx`: a "Generate insights" button → calls the action (useTransition/loading state) → renders the returned text (markdown-ish, whitespace-pre-wrap). Board-only (page already gated). Cost note in small text ("uses AI; on-demand").
- [ ] Step 4: PASS + tsc + next build (client/server boundary correct — 'use client' on the component, 'use server' on the action).
- [ ] Step 5: commit `feat(admin): on-demand AI insights on membership reports`.

## Task 4: deploy + verify (PAUSE for user)
- [ ] Merge -> main -> Vercel deploys. Verify on `/members/admin/membership`: top-5 tenure shows the founding core; expiring-soon lists real upcoming renewals; payment mix shows Stripe/PayPal split + avg; "Generate insights" returns a sensible narrative. Confirm the insights prompt carried no emails (spot-check via a server log or the action's behavior).

## Self-Review
- Scope: 3 pure reports (T1) + page wiring (T2) + AI insights action/button (T3) + deploy (T4). Referrals correctly dropped (no data).
- AI safety: board-gated action, aggregate/board-visible data only (no emails/per-member payments), on-demand, fail-soft. Reuses the site's existing Anthropic SDK pattern.
- Pure metrics: reuse completeMonths/round/quarters; UTC; tested vs hand-computed fixtures.
- Risk: client/server boundary for the button (use client) + action ('use server'); next build must pass. Claude max_tokens/streaming — follow extract-notes if streaming required.
