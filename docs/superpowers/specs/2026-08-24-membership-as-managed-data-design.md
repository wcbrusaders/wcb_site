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

## Phasing (proposed)

- **Phase 1 — data model + import:** Member email nullable + membershipState;
  MembershipSnapshot table; migration; import expired + honorary members; import metrics
  sheet → historical snapshots. Result: DB has the FULL, correct roster + history.
- **Phase 2 — admin page:** membership list (filterable) + MoM metrics view.
- **Phase 3 — monthly job + retire the workbook:** scheduled snapshot; admin CRUD so the
  sheet is no longer needed.

## Open questions for review

- Exact set of workbook tabs + their column headers (the bot's MEMBER_ROSTER_SHEET_ID
  404'd — need the SITE's sheet ID / a look at the real tabs to map the import). Confirm
  tab names for current / expired / honorary / metrics.
- Does `membershipState` fully replace `current`, or keep both (derive `current` from
  state) for backward-compat with existing site code that reads `current`?
- Metrics sheet's exact columns → map to MembershipSnapshot fields.
- Auth: confirm a null-email Member can't break the NextAuth flow.

## Out of scope
- Discord bot changes beyond pointing counts at `membershipState` (already privacy-safe).
- Payment/dues-amount handling (stays out of the bot; admin-only if surfaced at all).
