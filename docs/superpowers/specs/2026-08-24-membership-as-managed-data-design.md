# Membership as Managed Data + Month-over-Month Metrics — Design

**Date:** 2026-08-24
**Status:** Design (brainstormed) → review → writing-plans
**Repo:** wcb_site (site owns member data + admin UI). Bot consumes read-only.

## Problem / motivation

Membership currently lives in a messy multi-sheet Google workbook (current members,
expired, honorary, metrics…). The site's roster sync (`src/lib/roster.ts`) reads only
ONE tab (`TAB = 'Sheet1'`, current members) and DROPS any row without an email
(`mapSheetRow`: `if (!email) return null`). Consequences:
- The `Member` table has only 31 rows — all `current=true`, zero lapsed — so the admin
  page and the Discord bot report wrong counts ("31 members, 0 lapsed") when the real
  roster is ~32 active + ~5-6 lapsed ≈ 37.
- Honorary members without email (e.g. Cat Pearce) can never be represented.
- There's no history, so no month-over-month metrics are possible from a live table.

Jordan's goal (reframed during brainstorming): stop treating the spreadsheet as the
source of truth. Make **membership first-class managed data in the site**, with the
**admin page as its home** — all members (current / expired / honorary) plus
**month-over-month membership metrics** — migrating OFF the workbook rather than
syncing from it.

## REVISED SCOPE (2026-08-24, after seeing the real workbook + user corrections)

The workbook is **NOT retired**. Two corrections from Jordan:
1. **Members + join dates + payments keep coming FROM the sheet in perpetuity** — until
   a future refactor makes the site ingest Stripe/PayPal directly. The sheet stays the
   source of truth for WHO is a member and WHAT was paid. We just sync ALL of it, not
   only `Sheet1`.
2. **The 9 report tabs are DERIVED (spreadsheet formulas), not source data** — the site
   COMPUTES them from members + payments rather than copying them.

**The real workbook (11 tabs, "Member Roster"):**
- SOURCE data (sync into DB):
  - `Sheet1` — 33 current members. Cols: Name, Tier, Email Address, Payment Date,
    Expires, Current, Last Reminder Sent, Reminder Count, Partner Email, Linked To,
    Opt Out, Drive Access Status, Google Email, Partner Google Email, Calendar Access
    Status, Board Member, Tenure (months), Join Date, Referred By, Role.
  - `Lapsed Members` — 8 lapsed (same shape + "Tenure at Lapse (mo)"). **The current
    sync ignores this tab — this is the missing ~8 that made counts wrong.**
  - `Payments` — 55 dated dues txns: Date, Net Dues (amount), Source (Stripe/PayPal).
- DERIVED reports (site COMPUTES from Member + Payment; do NOT port formulas):
  - `Metrics` (KPIs: active count, rolling-12mo turnover %, members expiring next 30d,
    longest-tenured, avg tenure at lapse), `Trends` (per-quarter New/Churn/Active-EOQ/
    Turnover%/Retention%/New-YoY%/Net-Growth%), `Renewal Pipeline` (members expiring by
    month), `Tier Mix` (members per tier), `Seasonality` (joins by month), `Cohort
    Retention` (by join-quarter: joined/still-active/retention%/tested?), `Revenue`
    (per-quarter Net Dues/Events Income[all 0 today]/Total/Dues Payments/New/Renewals),
    `Referrals` (program tally).
- All 9 reports derive from member rows (joinDate/expires/tier/current/status) + payment
  rows grouped by quarter/month/tier/cohort. Events Income isn't tracked yet (all 0) —
  future input, not blocking.

## Decisions (settled in brainstorming)

1. **Members are keyed by internal ID, not email.** The `Member` table already has a
   cuid `id`; make `emailAddress` **nullable**. Honorary/email-less members are full
   records (name + tier + state), they simply can't log in (fine — honorary don't need
   site access). Email stays unique *when present*.
2. **Explicit membership STATE**, not inferred. A member's lifecycle state is a real
   field: `active | lapsed | honorary | former` (distinct from the existing
   enforcement `status` = active/interim/banned, which stays as-is and is separate).
   The Discord bot's counts read this (active vs lapsed) instead of the ambiguous
   `current` boolean.
3. **Month-over-month metrics need history → a snapshot table.** Add
   `MembershipSnapshot` (one row per month) capturing the aggregate picture. Two data
   sources feed it:
   - **One-time import** of the workbook's existing member-metrics sheet as the
     historical snapshots (uses work already done in the sheet).
   - **A monthly job** (cron) that records the current month's snapshot going forward,
     so history is self-maintaining and the workbook can be retired.
4. **Admin page becomes the home.** A membership admin view shows: the full member list
   filterable by state (current/lapsed/honorary/former), and the month-over-month
   metrics (totals, active, lapsed, honorary, new joins, non-renewals) as a table/chart.
5. **Migrate off the workbook.** After import + admin CRUD, the workbook is no longer
   the source of truth. (Keep the sync temporarily as a fallback/import path if useful,
   but the DB is authoritative.)

## Data model (wcb_site Prisma)

### `Member` (modify)
- `emailAddress String?` — make **nullable + unique-when-present** (honorary have none).
- Add `membershipState String` — `active | lapsed | honorary | former` (default derived
  on migration from current data: all 31 existing → `active`).
- Keep existing: name, tier, joinDate, expires, paymentDate, isBoard, role, `current`
  (can be derived from state or kept for compatibility), enforcement `status`/`statusUntil`.
- Migration: existing rows → membershipState='active'. Then import the expired + honorary
  members from the workbook as `lapsed`/`honorary` rows (honorary with null email).

### `MembershipSnapshot` (new)
One row per month (the time-series that powers MoM metrics):
```
model MembershipSnapshot {
  id             String   @id @default(cuid())
  month          String   @unique   // 'YYYY-MM'
  total          Int
  active         Int
  lapsed         Int
  honorary       Int
  newJoins       Int      // joined during this month
  nonRenewals    Int      // lapsed during this month
  recordedAt     DateTime @default(now())
  source         String   // 'imported' | 'monthly-job' | 'manual'
}
```

## Data inputs needed (Jordan's question, answered)

**Per member (roster):** name; email (nullable); tier (Single/Couple/Honorary/Sponsor);
membershipState (active/lapsed/honorary/former); joinDate; expires (paid-through);
paymentDate; board/role. Most already exist as columns; the gaps are nullable email +
the explicit membershipState + importing the non-current members.

**For MoM metrics (the genuinely new input):** monthly snapshots — {month, total,
active, lapsed, honorary, newJoins, nonRenewals}. Historical months come from importing
the metrics sheet once; future months from the monthly job. (A live roster CANNOT
produce history — this is why the snapshot table exists.)

## Components

- **Migration + backfill script** (`scripts/`): (a) Prisma migration making email
  nullable + adding membershipState + MembershipSnapshot; (b) import expired/honorary
  members from the workbook sheets into `Member`; (c) import the metrics sheet rows into
  `MembershipSnapshot` as historical `source='imported'`.
- **Monthly snapshot job** (cron / scheduled route): compute current-month aggregates
  from `Member`, upsert a `MembershipSnapshot` row (`source='monthly-job'`). Idempotent
  per month.
- **Admin membership page** (`src/app/members/admin/…`): member list (filter by state,
  incl. honorary/lapsed) + MoM metrics table/chart from `MembershipSnapshot`. Officer-
  gated (existing admin auth).
- **Admin CRUD** (later / as needed): add/edit a member directly (so honorary + changes
  don't require the sheet). Optional in phase 1.
- **Bot impact:** `get_member_data` counts scope reads `membershipState` for active/
  lapsed instead of `current`. Its scoped/privacy design is unchanged. (Bot already
  fixed to be counts-only/no-names — this just feeds it correct numbers once the data
  is complete.)

## Privacy / safety

- Admin membership view is officer-gated (existing pattern). Honorary/lapsed names are
  visible to officers on the admin page (that's the point), NOT to the Discord bot.
- The bot's member access is unchanged: counts-only aggregates, board/tenure/own scopes,
  no roster dump, no naming lapsed — enforced structurally in `get_member_data`.
- Making email nullable must not break auth: login is email-based, so email-less
  (honorary) members simply have no login path — verify the auth/adapter tolerates a
  null-email Member (they're never a `User` row).

## Phasing (REVISED — sheet stays source; reports computed; end-to-end build)

- **Phase 1 — expanded sync (source data):** sync `Sheet1` + `Lapsed Members` into
  `Member` (lapsed → current=false / membershipState='lapsed'); add a `Payment` table and
  sync the `Payments` tab (date, netDues, source). Member email nullable (honorary by id).
  Result: DB has the FULL, correct roster (32 active + ~8 lapsed) + payments. The Discord
  bot's counts immediately become correct (it reads current/membershipState).
- **Phase 2 — metrics engine:** a module that COMPUTES the reports from Member + Payment:
  KPIs, Trends (per-quarter), Renewal Pipeline (by month), Tier Mix, Seasonality, Cohort
  Retention (by join-quarter), Revenue (per-quarter). Pure aggregations; unit-tested
  against the known sheet values (2026-Q2: 30 active, 6 new, 0 churn, 100% retention;
  rolling-12mo turnover 11.1%; longest-tenured Jordan LaFontaine; etc.) so our numbers
  match the workbook.
- **Phase 3 — admin reports page:** display all computed reports (tables/charts) on the
  admin site, officer-gated.
- **Phase 4 — biweekly auto-generate:** a scheduled job (Vercel cron, ~every 2 weeks)
  that re-runs the sync + recomputes reports + writes a `MembershipSnapshot` row (history
  going forward). This is the "auto generate every 2 weeks" ask.

Note: the sheet remains the source for members/join-dates/payments until a LATER refactor
makes the site ingest Stripe/PayPal directly (explicitly out of scope here).

## Open questions for review

- Exact set of workbook tabs + their column headers (the bot's MEMBER_ROSTER_SHEET_ID
  404'd — need the SITE's sheet ID / a look at the real tabs to map the import). Confirm
  tab names for current / expired / honorary / metrics.
- Does `membershipState` fully replace `current`, or keep both (derive `current` from
  state) for backward-compat with existing site code that reads `current`?
- Metrics sheet's exact columns → map to MembershipSnapshot fields.
- Auth: confirm a null-email Member can't break the NextAuth flow.

## Future work (captured, not yet built)
- **Event→signup attribution (Jordan, 2026-08-24):** correlate calendar events /
  meeting topics with joins in the days after, to find which events RECRUIT (e.g.
  the Martin Keene / Brulosophy exBEERiment meeting → ~4 signups that week). High
  value, but its own project — needs: (1) a calendar-events data source INTO the
  site (the Discord bot reads Google Calendar today; the site doesn't — either
  share that or sync events to a table); (2) a temporal correlation model (joins
  within N days of an event = proxy attribution, not ground truth); (3) ideally
  event TAGGING (guest-speaker / exBEERiment / social / comp) so you compare event
  TYPES, not one-offs; (4) strongest form needs a join→source field (an optional
  "what brought you?" at signup — same data gap as referrals). Phase 5+ candidate.

## Out of scope
- Discord bot changes beyond pointing counts at `membershipState`/`current` (already
  privacy-safe; bot never shows payment amounts or the reports — those are admin-only).
- Site ingesting Stripe/PayPal transactions DIRECTLY (a future refactor; for now Payments
  sync from the sheet).
- Events Income (Revenue tab is all 0 today — no source yet).
- Retiring the workbook (members/payments keep syncing from it until the Stripe/PayPal
  refactor).
