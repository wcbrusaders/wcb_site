# Membership Sync — Phase 1: full roster (incl. lapsed) + payments

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. Spec: `docs/superpowers/specs/2026-08-24-membership-as-managed-data-design.md`.

**Goal:** The site DB holds the FULL, correct roster — all current members (`Sheet1`, ~33) AND lapsed members (`Lapsed Members` tab, ~8, marked lapsed) — plus a `Payment` table synced from the `Payments` tab. This makes membership counts correct at the source (32 active + ~8 lapsed vs today's 31/0), everywhere including the Discord bot. Reports/admin UI/cron are later phases.

**Architecture:** Extend `src/lib/roster.ts` to read multiple tabs and tag each row's source; add `membershipState` to `Member` + make `emailAddress` nullable (honorary have none); add a `Payment` model + a payments sync. Sheet stays the source of truth (per spec — no Stripe/PayPal-direct yet).

**Tech Stack:** Next.js/TS, Prisma (`prisma db push`, NOT migrate), Vitest, Google Sheets v4 (existing OAuth in roster.ts).

## Global Constraints
- Sheet remains source of truth for members + payments (do NOT retire it).
- **DB changes via `prisma db push`** (repo convention; no migrate). The PROD push is a PAUSED step (Fly tunnel; user coordinates) — do NOT push to prod yourself.
- Fail-soft sync; never delete member rows (deactivate only).
- Follow existing `roster.ts` patterns (cell()/truthy()/parseDate()/normalizeEmail(), the SyncDeps injection seam for tests).
- Tests: Vitest (`npx vitest run <file>`). Existing roster tests must stay green.
- Commits: message via file/heredoc; stage explicit paths; no `git add -A`.

## Confirmed facts (grounded in the real workbook + code)
- Workbook "Member Roster", 11 tabs. SOURCE tabs: `Sheet1` (current, 33 rows), `Lapsed Members` (8 rows), `Payments` (55 rows: Date, Net Dues, Source).
- `Sheet1` header has `"Current"`; `Lapsed Members` header has `"Current?"` (with `?`) and `"Tenure at Lapse (mo)"`. `cell()` uses exact `headers.indexOf(name)` — a lookup for `'Current'` will MISS `'Current?'`. So for the Lapsed tab, FORCE lapsed state; don't rely on the Current column.
- `Member.emailAddress String @unique` (line 12) — currently NOT null. `syncRoster` (line 152) upserts `where: { emailAddress }` and has a deactivate-sweep (lines 181-184) that flips `current=false` for any existing member NOT seen this run.
- `Payments` rows: `["Date","Net Dues","Source"]` e.g. `["2023-10-02","12.34","Stripe"]`.

## Task 1: Schema — membershipState + nullable email + Payment model

**Files:** `prisma/schema.prisma`; (generate client).

- [ ] **Step 1:** Modify `Member`:
  - `emailAddress String? @unique` (nullable; unique-when-present — Postgres allows multiple NULLs under a unique index, which is what we want for email-less honorary).
  - Add `membershipState String @default("active")` — values `active | lapsed | honorary | former`.
  - Keep `current` (derived-ish; sync still sets it). Do NOT drop columns.
  Add `Payment`:
  ```
  model Payment {
    id        String   @id @default(cuid())
    date      DateTime
    netDues   Float
    source    String        // 'Stripe' | 'PayPal' | ...
    createdAt DateTime @default(now())
    @@unique([date, netDues, source])   // idempotent re-sync key (best-effort dedup)
    @@index([date])
  }
  ```
- [ ] **Step 2:** `npx prisma generate` — confirm the client typechecks (`npx tsc --noEmit`). Do NOT `db push` to prod (paused for T-final).
- [ ] **Step 3:** Commit `feat(db): membershipState + nullable email + Payment model`.

## Task 2: mapSheetRow handles both member tabs + honorary (no email)

**Files:** `src/lib/roster.ts`; Test `src/lib/roster.test.ts` (extend).

**Interfaces:** `MemberRecord` gains `membershipState: string` and allows `emailAddress: string | null`.

- [ ] **Step 1: failing test** — `mapSheetRow(headers, row, { tab: 'lapsed' })` returns a record with `current=false`, `membershipState='lapsed'` even if the row's `Current?`=TRUE. `mapSheetRow(currentHeaders, row, { tab: 'current' })` → `membershipState='active'`, current per the Current column. A row with NO email (honorary) is NOT dropped — returns a record with `emailAddress=null` (previously `if(!email) return null` dropped it). Add a `tier`/name for honorary.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement: add a `tab: 'current'|'lapsed'` arg (default 'current' for back-comat). Stop returning null on blank email — instead set `emailAddress: email ? normalizeEmail(email) : null`. Set `membershipState`: lapsed tab → `'lapsed'` + `current=false`; current tab → `'active'` + current per column. (Honorary detection: if you can tell from tier=='Honorary', set state 'honorary'; otherwise leave to the tab. Keep it simple — tab drives it.)
- [ ] **Step 4:** Run — PASS. Existing mapSheetRow tests: update the ones that assumed blank-email→null (they now expect a null-email record) — verify intent, don't weaken.
- [ ] **Step 5:** Commit `feat(roster): map current+lapsed tabs; keep email-less honorary`.

## Task 3: fetch both member tabs + payments

**Files:** `src/lib/roster.ts`; Test.

- [ ] **Step 1: failing test** — `fetchAllRosterRows` (or a new `fetchAllMembers`) returns rows from BOTH `Sheet1` and `Lapsed Members`, each tagged. `fetchPayments()` returns `[{date, netDues, source}]` from the `Payments` tab (skip header, skip blank rows, parse amount as float, skip rows with unparseable date/amount). Use a fake Sheets client (SyncDeps-style) — do NOT hit the network in tests.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement: read `Sheet1` (tab 'current') + `Lapsed Members` (tab 'lapsed'), concat, mapping each with its tab. New `fetchPayments()` reads the `Payments` range, maps rows → {date:Date, netDues:number, source:string}, drops invalid. Keep the existing `fetchAllRosterRows` name working (current tab) if other callers use it — grep for callers first; prefer a new `fetchAllMembers()` and have syncRoster use it.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(roster): fetch lapsed tab + payments`.

## Task 4: syncRoster upserts all members (state-aware) + syncPayments

**Files:** `src/lib/roster.ts`; Test.

**The deactivate-sweep subtlety (critical):** today's sweep flips `current=false` for any existing member not seen this run. Now that lapsed members ARE seen (from the Lapsed tab, already `current=false`/state=lapsed), that's fine. But: (a) upsert must key correctly incl. null-email honorary — you CANNOT `upsert where:{emailAddress}` when email is null. For null-email members, key on a stable natural key: `name` + tier (or match an existing row by name). Simplest safe approach: upsert email-keyed members as today; for null-email members, find-by-name-then-create/update (documented, with a warning log if multiple name matches). (b) Set `membershipState` on every upsert. (c) The sweep should set BOTH `current=false` AND `membershipState='former'` for genuinely-vanished members (in neither tab) — a member who fell off entirely, distinct from an explicitly-lapsed one.

- [ ] **Step 1: failing test** (fake db + fake fetch via SyncDeps): syncing a current member → state 'active', current true; a lapsed-tab member → state 'lapsed', current false; a null-email honorary → created/updated matched by name, not crashing on the email key; a previously-synced member now in NEITHER tab → swept to current=false + state 'former'. `syncPayments` upserts payment rows idempotently (re-run doesn't duplicate — the @@unique).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement per above. Add `syncPayments(deps)`. Keep return shape `{synced, deactivated}` + add `{payments}`.
- [ ] **Step 4:** PASS + existing roster tests green. `npx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(roster): state-aware member sync (incl lapsed/honorary) + payments`.

## Task 5: wire the cron route + bot counts read membershipState

**Files:** `src/app/api/cron/sync-roster/route.ts` (also run payments); bot `data/site_reader.py` counts (separate repo — note only, do in the bot repo).

- [ ] **Step 1:** The existing `sync-roster` cron calls `syncRoster`; also call `syncPayments`. Keep CRON_SECRET gate. Test the route's happy path if there's an existing route test pattern; else manual.
- [ ] **Step 2 (NOTE, bot repo — separate change):** the bot's `get_member_data` counts already use `current` (fixed earlier); once membershipState exists, optionally switch active/lapsed to read `membershipState`. Not required for counts to be correct (current is now right for lapsed). Log as a follow-up; do NOT edit the bot repo from this site task.
- [ ] **Step 3:** Commit `feat(cron): sync payments alongside roster`.

## Task 6: PROD push + verify (PAUSE for user)
- [ ] `prisma db push` to PROD via the Fly tunnel (mv .env aside pattern; user coordinates — this alters the prod schema: nullable email + membershipState + Payment table).
- [ ] Run the sync (cron endpoint or a one-off) against prod.
- [ ] Verify: `Member` now has ~41 rows (33 active + 8 lapsed); active/lapsed counts correct; honorary (Cat Pearce) present with null email; `Payment` has ~55 rows. The Discord bot's "how many members" now reports the right numbers.

## Self-Review
- Scope: schema (T1), map both tabs + honorary (T2), fetch lapsed+payments (T3), state-aware sync + payments (T4), cron (T5), prod (T6). ✅
- Risks: null-email upsert keying (T4 handles via name-match, documented); `Current?` vs `Current` header (T2 forces lapsed state from tab, not column); deactivate-sweep now interacts with lapsed rows (T4 test covers vanished→former vs lapsed); unique-null-email (Postgres allows multiple NULLs under unique — fine). prod db push is paused/user-coordinated.
- No placeholders: real tab names, real headers incl. the `?`, real Payment columns, exact fns/lines to extend.
