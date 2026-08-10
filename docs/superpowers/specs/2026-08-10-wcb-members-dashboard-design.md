# WCB Members Dashboard — Design

**Date:** 2026-08-10
**Status:** Approved (brainstorming) → ready for implementation plan
**Scope:** `wcb_site` — the members-area hub + membership dashboard. Read-only display of a member's own roster data, plus a nav shell for future features.

## Problem

The WCB members auth foundation is live (`wcb-site.vercel.app` — email-code login, roster-gated; see `2026-08-09-wcb-auth-module-design.md`). The gated `/members` page is currently a bare proof-of-login stub. Members have no place to see their own membership information, and there is no home for the features coming next (equipment library, book library, shop).

**Goal:** turn `/members` into the members-area **hub** — a dashboard showing each member their own info (status, tier, tenure, key dates, partner link, access status), plus a navigation shell that gives the future features a home without re-architecting later.

This is the **first** of several members-area sub-projects. It was chosen first because it is the thinnest (mostly reads data we already have), it proves the members-area shell, and every later feature lives inside the shell it establishes.

## Out of scope (follow-on specs)

- **Equipment + book library** — a single *generic loanable-item system* (category = book | equipment, with type-specific fields), covering browse + check-out/in. Its own spec.
- **Admin CRUD UI** — adding/editing books + equipment (board-gated). Its own spec, after the lending system.
- **Members' shop** — a small store for members (e.g. surplus gear sold cheap, proceeds donated to the club). A later *transactional* subsystem (payments/donations). This spec leaves a nav slot for it but builds no shop/payment logic.
- **Member-contributed equipment / "Donate equipment" action** — a member offers gear that enters the equipment catalog (likely via an admin approval step). Belongs to the equipment-library + admin specs (a member *write* into the lending system), not this read-only dashboard. Captured here so it is not lost.
- **Member self-service edits** (changing one's own profile), board-only tooling, notifications.

**Boundary rule for THIS spec:** read and display existing roster data + add the sync fields needed to carry it. No writes from members, no new external services, no changes to the auth gate or the sync mechanism beyond additive fields.

## Key decisions (locked in brainstorming)

- **Data source = DB, not live Sheet.** The dashboard reads only the `Member` table (the auth fast-path), so it is fast and unaffected by a Google/Sheets outage. The richer fields are synced into the DB by extending the existing sync — no live Sheet read on page view.
- **Tenure is computed, not stored.** The sheet's `Tenure (months)` column is a stale snapshot. Instead we sync `Join Date` (a fixed fact) and compute tenure live (`now − joinDate`). The `Tenure (months)` column is ignored.
- **`/members` is the members-area HUB**, not a pure info page: membership info cards + a feature-nav shell with visible "Coming soon" cards for Library / Equipment / Shop. Building the shell now means later features drop in.
- **Board members = badge only** in this spec. Admin capabilities are gated on `isBoard` in the later admin spec.
- **Graceful blanks.** Roster rows are sparse (some members lack a Join Date, access status, etc.). Blank field → hidden or a subtle "Not on file"; a card whose fields are all blank is omitted entirely. The dashboard always looks intentional.
- **Fail-soft on a missing Member row.** A logged-in session with no `Member` record (rare race) shows a minimal "details may still be syncing" state using what the session carries — never a crash or an empty scaffold.
- **Additive only.** All schema + sync changes are additive nullable columns and additive reads. The roster gate (`isCurrentMember`) and the 15-min sync are untouched.

## Architecture

```
Member ──► /members (hub, server component, gated)
             await auth() → session.user.email
             └─ getMemberDashboard(email)  ── one indexed DB read ──► Member table
                  (framework-free, testable; no Google call at view time)
             renders:
               • MemberHeader (greeting, tier, board badge, active/expiring)
               • InfoCard × N  (Membership, Timeline, Connections, Access)
               • FeatureNav    (Library / Equipment / Shop — "Coming soon")

Member table freshness rides the EXISTING 15-min roster sync (no new mechanism).
Sync now also carries: joinDate, paymentDate, driveAccessStatus,
calendarAccessStatus, referredBy (all nullable, additive).
```

## Data model (Prisma — additive)

Extend `Member` with nullable columns (existing `tier`, `current`, `isBoard`, `partnerEmail`, `expires` unchanged):

- `joinDate DateTime?` — fixed fact; tenure is computed from this
- `paymentDate DateTime?` — last payment date
- `driveAccessStatus String?`
- `calendarAccessStatus String?`
- `referredBy String?`

**Not synced:** `Tenure (months)` (computed instead), `Opt Out`, `Last Reminder Sent`, `Reminder Count` (not member-facing).

## Components (bounded units)

### ① Sync extension — `mapSheetRow`
Read the new columns via the existing `cell(headers, row, 'Join Date')` pattern. Dates guarded with the existing `isNaN(getTime())` check → invalid/blank date → `null`. `MemberRecord` type + `syncRoster` upsert extend to carry the new fields. Roster-gate logic untouched.

### ② `getMemberDashboard(email)` — framework-free read
- **Signature:** `getMemberDashboard(email: string, deps?) → DashboardRecord | null`
- Normalizes email, one indexed `Member` read matching `emailAddress` OR `googleEmail`. Hit → the display record; miss → `null` (drives the fail-soft state).
- No auth/next imports — mirrors `isCurrentMember` so it is unit-testable with a fake DB.

### ③ `formatTenure(joinDate)` — pure function
- `null` or future date → empty (tenure line hidden).
- `<1yr` → "N mo"; `≥1yr` → "Y yr M mo". Date-only granularity (no timezone traps).

### ④ `visibleCards(record)` — pure display helper
- Decides which info cards to render and which lines to hide, per the graceful-blank rule. Pure → unit-testable without rendering React.

### ⑤ Page + presentational components
`MemberHeader`, `InfoCard` (generic wrapper), `FeatureNav`, composed by `/members/page.tsx`. Matches the existing hand-rolled Tailwind v4 style (CSS-var tokens: `bg-background`, `text-accent`, `card-bg`, `border`). No UI kit introduced. The current T11 proof page is replaced; its `auth()` + `redirect('/login')` guard is kept.

## Data flow

**Happy path:** `/members` → `await auth()` → `getMemberDashboard(session.user.email)` (one DB read) → render header + cards + feature nav. No external call at view time.

**Info cards:**
- *Membership* — tier, status, board badge. **Status rule:** `current === false` → "Inactive"; `current === true` and `expires` within 30 days → "Active — renews soon ({date})"; otherwise → "Active". (`current` is authoritative; `expires` only refines the active label — consistent with the auth module's "don't enforce Expires at login" decision.)
- *Timeline* — join date, computed tenure, renewal (`expires`), last payment date
- *Connections* — linked partner (if `partnerEmail`)
- *Access* — Drive + Calendar access status

**Feature nav shell:** visible-but-disabled "Coming soon" cards for Library, Equipment, Shop.

## Error handling & edge cases

- **No session** → middleware + page `redirect('/login')` (already in place). Never renders unauthenticated.
- **Session but no `Member` row** (rare race: live-fallback login not persisted, or just deactivated) → fail-soft minimal state ("We couldn't load your membership details — they may still be syncing. Contact an officer if this persists."), using session-carried email/tier. Not a crash, not an empty scaffold.
- **Sparse fields** → graceful-blank rule (hide line / "Not on file"; omit all-blank card).
- **Malformed sheet dates** → `isNaN` guard → `null` → treated as missing.
- **Tenure** → `formatTenure(null | future)` → no output → line hidden.
- **No new failure modes for auth/sync** — additive reads + nullable columns only.

## Testing (TDD)

Framework-free unit tests, matching `roster.test.ts` (DI'd fakes, no mocks of things we don't own):

- **`mapSheetRow` extensions:** new fields map from correct headers; blank → `null`; malformed date → `null`; the existing 8 fields still map (no regression).
- **`formatTenure`:** `null` → empty; future → empty; `<1yr` → "N mo"; `≥1yr` → "Y yr M mo"; exact-year boundary; month rollover.
- **`getMemberDashboard`:** fake DB — hit returns record; miss returns `null`; email normalized; matches on `emailAddress` OR `googleEmail`.
- **`visibleCards`:** all-blank card omitted; partially-blank card shows only present lines; full record shows all cards.

**Verification bar per task:** `tsc --noEmit` clean, `vitest run` green, `npm run build` compiles. Manual smoke at the end: log in as a real member → see the correct card. No live-deploy E2E needed (read-only display).

## Success criteria

- A logged-in member sees their own membership info on `/members`: status, tier, board badge, join date, computed (never-stale) tenure, renewal date, last payment, linked partner, Drive/Calendar access.
- Sparse rows render cleanly (no "undefined", no empty cards).
- A session with no `Member` row shows a graceful fail-soft state, not a crash.
- `/members` is a hub: info cards + visible "Coming soon" nav for Library / Equipment / Shop, so the next specs wire in without re-architecting.
- The dashboard reads only the DB — no Google dependency at view time.
- Auth gate and the 15-min sync continue working unchanged; all changes are additive.
- `mapSheetRow`, `getMemberDashboard`, `formatTenure`, `visibleCards` are framework-free and unit-tested.
