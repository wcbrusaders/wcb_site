# Membership Metrics — Phase 2: compute the reports from DB (match the sheet exactly)

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. Spec: `docs/superpowers/specs/2026-08-24-membership-as-managed-data-design.md`.

**Goal:** A metrics module that COMPUTES the roster-workbook reports (KPIs, Trends, Tier Mix, Seasonality, Cohort Retention, Revenue) from the `Member` + `Payment` tables — reproducing the sheet's exact numbers (tested against captured known values). Pure computation; NO prod, NO schema, NO UI (UI is Phase 3).

**Architecture:** New `src/lib/metrics/` module. Each report = a function taking the member+payment rows (fetched once) and returning a typed result. Definitions reverse-engineered from the sheet's actual cell formulas (captured below) so numbers match. Unit-tested against a fixed fixture roster whose expected outputs equal the sheet.

**Tech Stack:** Next.js/TS, Prisma (read-only), Vitest.

## Global Constraints
- **Match the sheet EXACTLY** (user decision). Tests assert equality against the captured sheet values. A mismatch is a bug in our formula, not a reason to change the test.
- Read-only over `Member` + `Payment`. No writes, no prod, no `db push`, no UI.
- Compute from the DB, but honor the sheet's exact definitions (below).
- Vitest (`npx vitest run <file>`); `npx tsc --noEmit` clean.
- Commits: heredoc/file, explicit `git add`, never `-A`.

## The sheet's EXACT formula definitions (captured 2026-08-24 — reproduce these)

Sheet columns referenced: Sheet1 `F`=Current("Yes"/…), `Q`=Tenure (months), `R`=Join Date, `E`=Expires. Lapsed Members `A`=Name, `E`=Expires(=lapse date), `R`=Join Date, `S`=Tenure at Lapse (mo). In OUR DB: current members = `Member.current=true`; lapsed = `Member.membershipState='lapsed'` (their `expires` = lapse date); joinDate/expires/tier are `Member` columns; tenure = months between joinDate and now (compute; the sheet stored it in col Q).

### KPIs (Metrics tab) — expected values in parens (as of capture)
- **Active Members** = count(current=true)  → **32**
- **Lapsed (all-time)** = count(membershipState='lapsed')  → **7**
- **Total (ever)** = active + lapsed  → **39**
- **Overall Turnover %** = round(lapsed/(active+lapsed)*100, 1)  → **17.9**
- **Retention %** = round(active/(active+lapsed)*100, 1)  → **82.1**
- **Avg Tenure (months)** = round(mean(tenure_months of CURRENT members), 1)  → **15.1**; years = round(that/12,1) → **1.3**
  - tenure_months(member) = whole months from joinDate to now (match the sheet's Tenure col; if the sheet used DATEDIF "m", replicate: complete months).
- **New (last 12 mo)** = count(members with joinDate >= today-365)  → **19**
- **New (this year)** = count(joinDate >= Jan 1 this year)  → **11**
- **Lapsed (last 12 mo)** = count(lapsed whose expires/lapse-date >= today-365)  → **4**
- **Rolling 12-mo Turnover %** = round(lapsedLast12/(active+lapsedLast12)*100, 1)  → **11.1**
- **Members Expiring (next 30 days)** = count(current members with expires in [today, today+30])  → **1**
- **Longest-Tenured Member** = name of member with MAX tenure (i.e. earliest joinDate)  → **"Jordan LaFontaine"**
- **Avg Tenure at Lapse (months)** = round(mean(tenure-at-lapse of lapsed members), 1)  → **14.9**
  - tenure-at-lapse = whole months from joinDate to expires(lapse date).

### Trends (per quarter, 2023-Q3 … current) — expected rows captured
For each quarter Q with [start,end):
- **New** = count(ALL members — any state — with joinDate in [start,end)). (Sheet sums Sheet1 joins + Lapsed-tab joins; in our merged table that's all members.)
- **Churn** = count(lapsed members whose expires/lapse-date in [start,end)).
- **Active (EOQ)** = cumulativeSum(New up to & incl Q) − cumulativeSum(Churn up to & incl Q).
- **Turnover %** = round(Churn_Q / Active_{prevQ} * 100, 1) (prev quarter's EOQ active; first quarter → 0 via IFERROR).
- **Retention %** = round(100 − Turnover%, 1) (IFERROR→100).
- **New YoY %** = round((New_Q − New_{Q-4})/New_{Q-4}*100, 1) (blank if no Q-4 or div0).
- **Net Growth %** = round((Active_Q − Active_{prevQ})/Active_{prevQ}*100, 1) (blank if no prev).
Expected (captured): 2026-Q2 → New 6, Churn 0, Active 30, Turnover 0, Retention 100, NetGrowth 25. 2025-Q4 → New 6, Churn 1, Active 23, Turnover 5.6, Retention 94.4, NetGrowth 27.8. (Full table in the spec/capture — encode all 12 quarters as the fixture's expected output.)

### Tier Mix — count members by tier → Single 28, Couple 3 (+ any others). (current members; confirm current-vs-all against sheet: sheet reads Sheet1 = current.)
### Seasonality — count ALL members' joins by calendar month (Jan..Dec) → Jan 2, Feb 3, Mar 2, Apr 2, May 4, Jun 4, Jul 4, Aug 1, Sep 4, Oct 5, Nov 7, Dec 1.
### Cohort Retention — by join-quarter: Joined = count(members joined that quarter, any state); Still Active = of those, count(current=true); Retention% = round(active/joined*100). (Captured: 2023-Q4 joined 6 / active 3 / 50%; 2024-Q2 4/2/50%; etc.)
### Revenue (per quarter) — CORRECTED to the sheet's ACTUAL cell formula (pulled from the live Revenue tab; supersedes the earlier per-payment approximation):
- Net Dues = `SUMIFS(Payments!B, date in [start,end))` = sum(Payment.netDues in quarter), 2dp.
- Dues Payments = `COUNTIFS(Payments!A, date in [start,end))` = count(payments in quarter).
- New Members = `COUNTIFS(Sheet1!R,in-Q)+COUNTIFS('Lapsed'!R,in-Q)` = count(ALL members, any state, joinDate in quarter) — a JOIN count, NOT payer-linked.
- Renewals = `MAX(0, DuesPayments − NewMembers)` — an arithmetic residual, NOT a per-payment classification.
- Events Income = 0 (no source yet). Total = Net Dues + Events.
NOTE: the sheet itself does NOT link payments to payers (the `Payment` table has no memberId FK), so this residual is the SHEET'S OWN definition — matching it is correct per "match the sheet exactly," even though it can misattribute in an edge case (an unpaid new joiner + a separate renewal in the same quarter). If we later want a true per-payment split, that needs a Payment→Member link (future; out of scope). (Captured: 2026-Q2 Net 406.36 / 10 payments / 6 new / 4 renewals; 2025-Q1 8/2/6.)

## Tasks

### Task 1: fetch layer + KPIs
**Files:** `src/lib/metrics/query.ts` (fetch member+payment rows read-only), `src/lib/metrics/kpis.ts`, test `src/lib/metrics/kpis.test.ts`.
- [ ] Step 1: failing test — a FIXTURE roster (hand-built array of member rows matching the real shape: name, current, membershipState, tier, joinDate, expires) whose KPI outputs equal the captured numbers. Include a `now` injection (KPIs use today/365/this-year — inject a fixed `now` = the capture date so "last 12 mo"/"this year" are deterministic). Assert active=32-shaped logic on the fixture (use a smaller deterministic fixture with KNOWN hand-computed answers, PLUS one test that runs the real definitions and asserts the exact formula, not the prod count — keep fixtures self-contained, don't depend on prod).
- [ ] Step 2: FAIL.
- [ ] Step 3: implement `computeKpis(members, {now})` per the exact definitions above. `query.ts` fetches `prisma.member.findMany` + `prisma.payment.findMany` (read-only) for the real callers (Phase 3/4); the compute fns take plain arrays so they're pure/testable.
- [ ] Step 4: PASS + tsc.
- [ ] Step 5: commit `feat(metrics): KPIs computed from member data (matches sheet)`.

### Task 2: Trends (per-quarter)
**Files:** `src/lib/metrics/trends.ts` + test.
- [ ] Quarter enumeration from earliest joinDate to the current quarter. Implement New/Churn/Active-EOQ (cumulative)/Turnover/Retention/YoY/NetGrowth per the exact formulas. Test a fixture whose per-quarter outputs match the captured 12-row table (especially the cumulative Active and the prev-quarter-denominator turnover). Commit.

### Task 3: Tier Mix + Seasonality + Cohort Retention
**Files:** `src/lib/metrics/composition.ts` (+ test). Tier mix (by tier), seasonality (joins by month Jan..Dec, all members), cohort retention (by join-quarter: joined/still-active/retention%). Fixtures assert the captured values. Commit.

### Task 4: Revenue (needs payments)
**Files:** `src/lib/metrics/revenue.ts` (+ test). Per quarter: netDues sum, payment count, new-vs-renewal split (new = payer joined that quarter). Events income 0. Fixture of payments + members asserts captured 2026-Q2 (406.36 / 10 / 6 / 4) etc. Commit.

### Task 5: aggregate entry point
**Files:** `src/lib/metrics/index.ts` — `getMembershipReports()` that fetches via query.ts and returns `{ kpis, trends, tierMix, seasonality, cohorts, revenue }` typed. A light test that it wires the pieces (mock the fetch). This is what Phase 3's admin page + Phase 4's snapshot job call. Commit.

## Self-Review
- Coverage: KPIs (T1), Trends (T2), Tier/Seasonality/Cohort (T3), Revenue (T4), aggregate (T5). ✅
- Match-exact: every metric's definition taken from the captured cell formula; tests assert captured values. ✅
- Pure/testable: compute fns take arrays + injected `now`; query.ts isolates Prisma. No prod/UI/schema.
- Risk: tenure = "complete months" (match DATEDIF "m") — the fixture must pin this; getting month-diff off-by-one would drift avg-tenure. Quarter boundaries [start,end) must match the sheet's DATE()-based ranges exactly.
