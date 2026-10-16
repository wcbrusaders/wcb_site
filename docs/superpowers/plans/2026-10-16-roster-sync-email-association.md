# Roster Sync — Associate All Known Emails to One Member — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Stop the roster sync from creating duplicate `Member` rows when a member's primary email changes / they have a secondary (Google/payment) email — by matching an incoming sheet row against ALL of an existing member's known emails and reconciling into that one record.

**Spec:** `docs/superpowers/specs/2026-10-16-roster-sync-email-association-design.md` (read it — ambiguity + collision rules are load-bearing).

**Tech:** Next.js, TypeScript, Prisma, Vitest. Site repo.

## Global Constraints
- TDD: failing test first, watch fail, minimal code. Vitest. Full suite stays green (baseline 611).
- `npx tsc --noEmit` = 0; `npx next build` compiles.
- NO schema migration — match aliases by querying existing rows' emailAddress/googleEmail against the sheet row's known-email set. (Payment Emails read from the sheet, not persisted.)
- `Member.emailAddress` is `@unique`; `googleEmail`/`partnerEmail` are NOT. Renaming a row's emailAddress must guard against colliding with another row's unique emailAddress (log + skip, never throw).
- NEVER silently merge two genuinely-distinct existing members. On multi-match ambiguity: warn + fall back to the safe primary-upsert (mirrors the existing honorary-name multi-match handling).
- Reconciled/alias-matched members MUST be marked "seen" so the end-of-run sweep doesn't deactivate them. No member may be swept to `former` if ANY of its known emails was seen this run.
- Commit only touched files via explicit `git add` (never `-A`).

---

### Task 1: mapSheetRow reads Payment Emails → altEmails

**Files:** Modify `src/lib/roster.ts` (`MemberRecord` type ~5-19, `mapSheetRow` ~71-110). Test: `src/lib/roster.test.ts`.

**Interfaces:**
- `MemberRecord` gains `altEmails: string[]` — normalized, deduped list of a member's NON-primary known emails (Google Email, Partner Email, and the comma/semicolon-split Payment Emails column). Primary `emailAddress` is NOT included in altEmails.
- `mapSheetRow` populates it by reading the `Payment Emails` column (plus the already-read Google/Partner emails) → normalize each via `normalizeEmail`, split on `,`/`;`, drop blanks, dedupe, exclude the primary.

- [ ] Step 1: failing tests — mapSheetRow with a "Payment Emails" cell of `"a@x.com, b@x.com"` → altEmails includes both (normalized); googleEmail/partnerEmail also included; primary excluded; blank Payment Emails → altEmails may still contain google/partner; a row with none → `[]`. Semicolon-joined also splits.
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement — add `altEmails` to the type + build it in mapSheetRow. Reuse `cell(headers,row,'Payment Emails')`; a small helper to collect+normalize+dedupe+exclude-primary.
- [ ] Step 4: run → PASS; full `npx vitest run` green.
- [ ] Step 5: commit `src/lib/roster.ts src/lib/roster.test.ts` — "feat(roster): mapSheetRow reads Payment Emails into altEmails".

---

### Task 2: syncRoster matches on all known emails + reconciles (the core fix)

**Files:** Modify `src/lib/roster.ts` (`syncRoster` ~261-368, the per-row upsert ~300-313 + the sweep ~335-360). Test: `src/lib/roster.test.ts` (extend the existing `syncRoster` describe + fake db).

**Interfaces:**
- Consumes `MemberRecord.altEmails` (Task 1).
- New matching before the upsert, for a row with a primary email. knownEmails = `[emailAddress, googleEmail, ...altEmails]` normalized+deduped (skip null/blank).
  1. `findUnique({ where:{ emailAddress: primary } })` → if found, update in place (today's path).
  2. else: find existing members where `emailAddress` IN knownEmails OR `googleEmail` IN knownEmails. (Do this with `findMany({ where:{ OR:[{emailAddress:{in:knownEmails}},{googleEmail:{in:knownEmails}}] } })`.)
     - exactly 1 distinct match → RECONCILE: update that member by id with commonFields AND set its `emailAddress = primary` — guarded: if another row already has `emailAddress === primary`, skip the rename (log warn), still update the other fields.
     - >1 distinct matches → `console.warn` (conflict) + fall back to primary upsert (create/update on primary). Do NOT merge.
     - 0 → create (today's path).
  3. Whichever member ends up representing this row: add its FINAL emailAddress to `seenEmails` (and if reconcile renamed it, the new primary is what's seen).
- Sweep unchanged in shape, BUT: because reconciled rows now carry the current primary (which is seen), they won't be swept. Add a safety: also collect every known email seen this run into a `seenAnyEmail` set, and in the sweep, do NOT deactivate a member if its emailAddress OR googleEmail is in `seenAnyEmail`. (Belt-and-suspenders against an alias-only row being swept.)

- [ ] Step 1: failing tests (extend fake db to support findMany OR on emailAddress/googleEmail + findUnique + update by id):
  - (a) primary match → updates in place, no new row (unchanged behavior still green).
  - (b) sheet row primary = `petehpray@gmail.com`; existing DB member has emailAddress=`petehpray@yahoo.com`, googleEmail=`petehpray@gmail.com`, former. knownEmails for the row include gmail (primary) + maybe a payment alias of yahoo. Reconcile: the existing yahoo member is updated (current=true per sheet, membershipState active, emailAddress renamed to gmail) → NO new row; marked seen; NOT swept.
  - (c) the rename collides (another row already has the target primary) → skip rename, update other fields, warn, no throw.
  - (d) two distinct existing members match knownEmails → warn + safe primary-upsert, no merge (both rows still exist).
  - (e) a member whose only-seen email is an alias is NOT swept to former.
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement the matching ladder + sweep safety.
- [ ] Step 4: run file tests + full `npx vitest run` green; `npx tsc --noEmit` 0.
- [ ] Step 5: commit — "fix(roster): sync matches all known emails + reconciles instead of duplicating".

---

### Task 3: auth.ts prefer-current tiebreaker

**Files:** Modify `src/lib/auth.ts` (session member lookup ~74-82). Test: wherever the lookup is unit-testable (the spec notes auth has an extracted testable fn ~line 30; if so test it, else a focused test of the query shape).

**Interfaces:** the member lookup gains `orderBy: [{ current: 'desc' }, { updatedAt: 'desc' }]` so a login email that matches multiple rows resolves to the current/most-recent one.

- [ ] Step 1: failing test — two members match the login email (one current/active, one former); lookup returns the CURRENT one. (Use the extracted testable fn + a fake db, mirroring existing auth tests if present; otherwise assert the query includes the orderBy.)
- [ ] Step 2: run → FAIL.
- [ ] Step 3: add the orderBy.
- [ ] Step 4: run → PASS; full suite green.
- [ ] Step 5: commit `src/lib/auth.ts` (+ test) — "fix(auth): session member lookup prefers the current record on email collision".

---

## Post-implementation (controller + Jordan, NOT tasks)
- Whole-branch review (opus): focus the matching ladder (never merges two real members; rename-collision guarded; sweep can't re-orphan a reconciled/alias member).
- Deploy (Vercel) after merge.
- SUPERVISED: trigger `sync-roster` cron once; verify Peter is a SINGLE current record. If a residual stale `former` duplicate remains (sheet no longer lists the yahoo email so the sync can't see it to reconcile), do the one-time tunnel cleanup: delete the `former` row whose googleEmail collides with a current member's emailAddress (Peter is the only such collision — verified 2026-10-16). Read-verify before delete.
