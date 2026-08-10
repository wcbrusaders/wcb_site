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

- **Data source = DB, not live Sheet/Group.** The dashboard reads only the `Member` table (the auth fast-path), so it is fast and unaffected by a Google outage. The richer fields are synced into the DB by extending the existing sync — no live Google call on page view.
- **Drive/Calendar access = GROUND TRUTH from a Google Group, not the sheet.** The sheet's `Drive Access Status` / `Calendar Access Status` columns are hand-maintained and may be wrong. Instead, the sync reads membership of a single Google Group (`MEMBER_ACCESS_GROUP_EMAIL`) that grants both Drive + Calendar access, and stores a real `resourceAccess Boolean` on `Member`. The dashboard shows a truthful "Resources access: yes/no" derived from actual group membership. The sheet's access-status columns are NOT synced.
  - **Creds:** the Group read uses the Directory API (`admin.directory.group.member.readonly`), which the hub's minimal `spreadsheets.readonly` token lacks. Rather than re-mint with admin consent, the sync **reuses the bot's existing credentials** (which already hold `admin.directory.group`). Server-side only, never in the browser. Tradeoff: couples the hub sync to the bot's broader-scoped token — acceptable for a backend chore.
  - **Fail-soft on Group-read error:** if the Directory call fails during a sync, leave each member's `resourceAccess` unchanged (do not flip everyone to false). A Group/Directory outage must never corrupt the flag or break the roster gate.
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
Sync now also carries: joinDate, paymentDate, referredBy (from the sheet), and
resourceAccess (from Google Group membership — reusing the bot's Directory creds).
All additive/nullable.
```

## Data model (Prisma — additive)

Extend `Member` with nullable columns (existing `tier`, `current`, `isBoard`, `partnerEmail`, `expires` unchanged):

- `joinDate DateTime?` — fixed fact; tenure is computed from this
- `paymentDate DateTime?` — last payment date
- `referredBy String?`
- `resourceAccess Boolean?` — **derived from Google Group membership** (not the sheet). `true` = in the access group, `false` = confirmed not in it, `null` = never determined (group read hasn't run / failed on first sync). Nullable so a Group-read failure leaves it unchanged rather than forcing false.

**Not synced:** `Tenure (months)` (computed instead), `Drive Access Status` / `Calendar Access Status` (replaced by Group-truth `resourceAccess`), `Opt Out`, `Last Reminder Sent`, `Reminder Count` (not member-facing).

## Components (bounded units)

### ① Sync extension — sheet fields + Google Group membership
Two additive changes to the sync:
- **Sheet fields** via the existing `cell(headers, row, 'Join Date')` pattern: `joinDate`, `paymentDate`, `referredBy`. Dates guarded with `isNaN(getTime())` → invalid/blank → `null`. `MemberRecord` + `syncRoster` upsert extend to carry them. Roster-gate logic untouched.
- **Group membership → `resourceAccess`**: a framework-free `fetchAccessGroupMembers()` reads the `MEMBER_ACCESS_GROUP_EMAIL` group's member emails via the Directory API (reusing the bot's `admin.directory.group` creds), returning a normalized `Set<string>` of emails. `syncRoster` calls it once per run and sets each member's `resourceAccess = set.has(emailAddress) || set.has(googleEmail)`. If the Group read throws, catch it and leave `resourceAccess` OUT of the upsert for this run (unchanged) — fail-soft, never flip to false on error, never break the sheet sync or gate.

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
- *Access* — "Resources access" (Drive + Calendar), derived from `resourceAccess` (Google Group membership): "You have access" / "Not currently granted"; omitted entirely if `resourceAccess` is `null` (never determined)

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

- **`mapSheetRow` extensions:** `joinDate`, `paymentDate`, `referredBy` map from correct headers; blank → `null`; malformed date → `null`; the existing fields still map (no regression).
- **`syncRoster` with Group membership (DI'd fake `fetchGroupMembers`):** a member in the group set → `resourceAccess: true` in the upsert; not in the set → `false`; `emailAddress` OR `googleEmail` match either way; **Group-read throws → `resourceAccess` omitted from the upsert (unchanged), sheet sync + deactivation still complete** (fail-soft). Mutation-resistant: the fake set must actually be consulted (assert a member absent from the set gets `false`, not that everyone gets the same value).
- **`formatTenure`:** `null` → empty; future → empty; `<1yr` → "N mo"; `≥1yr` → "Y yr M mo"; exact-year boundary; month rollover.
- **`getMemberDashboard`:** fake DB — hit returns record; miss returns `null`; email normalized; matches on `emailAddress` OR `googleEmail`.
- **`membershipStatus` / `visibleCards`:** status rule (inactive / active / renews-soon-within-30d); all-blank → only `membership` card; `access` card present iff `resourceAccess !== null`; full record shows all cards.

**Verification bar per task:** `tsc --noEmit` clean, `vitest run` green, `npm run build` compiles. Manual smoke at the end: log in as a real member → see the correct card. No live-deploy E2E needed (read-only display).

## Success criteria

- A logged-in member sees their own membership info on `/members`: status, tier, board badge, join date, computed (never-stale) tenure, renewal date, last payment, linked partner, and resources (Drive/Calendar) access **derived from real Google Group membership, not the hand-maintained sheet column**.
- Sparse rows render cleanly (no "undefined", no empty cards).
- A session with no `Member` row shows a graceful fail-soft state, not a crash.
- `/members` is a hub: info cards + visible "Coming soon" nav for Library / Equipment / Shop, so the next specs wire in without re-architecting.
- The dashboard reads only the DB — no Google dependency at view time.
- Auth gate and the 15-min sync continue working unchanged; all changes are additive.
- `mapSheetRow`, `getMemberDashboard`, `formatTenure`, `visibleCards` are framework-free and unit-tested.
