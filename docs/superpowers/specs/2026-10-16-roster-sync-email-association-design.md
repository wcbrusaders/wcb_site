# Roster Sync — Associate All Known Emails to One Member — Design

**Status:** brainstormed w/ Jordan 2026-10-16. Ready to plan.
**Repo:** wcb_site.

## Problem

The members-site roster sync (`syncRoster` in `src/lib/roster.ts`) creates a
DUPLICATE `Member` row when a member's primary roster email changes (or when
they paid/registered under a secondary email that later isn't their primary).

Concrete live bug (Peter Pray):
- Site DB has TWO rows: `petehpray@gmail.com` (current/active, correct) AND
  `petehpray@yahoo.com` (googleEmail=petehpray@gmail.com, `former`, stale).
- Roster sheet (source of truth) has ONE correct row: Peter, gmail primary,
  Current=Yes, Expires 09/01/2027.
- Dashboard shows him "lapsed" intermittently because `auth.ts`'s session
  lookup `member.findFirst({ where:{ OR:[{emailAddress:e},{googleEmail:e}] }})`
  (no orderBy) can resolve his gmail LOGIN to the stale yahoo row (whose
  googleEmail == his gmail) → that row is `former`.

Root cause: the "all known emails = one member" association exists in the READ /
match paths (auth lookup, discord-nudge, bot backfill, readMembersForMatching
which reads Email Address + Google Email + Partner Email + Payment Emails) but
NOT in the sync's WRITE path:
- `mapSheetRow` only reads `Email Address` + `Google Email` + `Partner Email` —
  it never reads the **Payment Emails** alias column.
- `syncRoster` upserts strictly `where: { emailAddress: <primary> }`. A changed
  primary → no match → NEW row created; the old row then gets swept to `former`.

## Schema facts (constrain the fix)
- `Member.emailAddress String? @unique`; `googleEmail` NOT unique; `partnerEmail`
  NOT unique; NO payment-alias column on Member (Payment Emails lives only on the
  sheet, read ad hoc by readMembersForMatching).
- So "match by alias" must be done by querying existing rows'
  emailAddress/googleEmail against the sheet row's set of known emails. No schema
  migration required for the core fix.

## Design

### A. mapSheetRow reads Payment Emails
Add the sheet's `Payment Emails` column (comma/semicolon-joined) to the
`MemberRecord` the sync consumes, as a normalized `string[]` of alias emails
(call it `altEmails` or reuse a knownEmails list). Keep existing fields.

### B. syncRoster matches on ALL known emails before upsert
For each sheet row with a primary email, the set of known emails =
{ emailAddress, googleEmail, ...paymentEmails } (all normalized, deduped).
Matching ladder (deterministic, current-preferring):
1. Try `member.findUnique({ where:{ emailAddress: primary } })` (fast path,
   unchanged for the common case).
2. If no primary match, look for an EXISTING member whose `emailAddress` OR
   `googleEmail` equals ANY of this row's known emails (the alias case). If
   exactly one such member exists AND it's a *different* row than any primary
   match, UPDATE that existing member in place (set its emailAddress to the new
   primary + commonFields) rather than creating a new row — i.e. RECONCILE the
   identity. Mark it seen.
3. If still none, create (today's behavior).
Ambiguity rule: if the known-emails lookup returns MULTIPLE distinct existing
members (a genuine conflict), do NOT guess/merge — log a warning and fall back
to the safe primary-upsert, leaving reconciliation for a human (mirrors the
honorary-name multi-match handling already in the file). Never silently merge
two real members.

Reconcile = update the found row's emailAddress to the sheet's current primary.
Because emailAddress is @unique, guard: if changing it would collide with
another row, log + skip the rename (don't throw).

### C. Sweep must not re-orphan
The sweep deactivates DB members whose emailAddress isn't in `seenEmails`. Once
B reconciles the alias row (its emailAddress becomes the current primary, which
IS seen), the sweep won't touch it. Verify: a reconciled member is added to
`seenEmails` under its NEW primary so the sweep leaves it active. No member
should be swept to `former` if any of its known emails was seen this run.

### D. Clean up the existing Peter orphan
After the fix: the next sync should reconcile Peter automatically (his yahoo row
reconciles into the gmail identity OR the yahoo row is recognized as the same
member). If an orphan `former` duplicate still remains that the sync can't
reconcile (because the sheet no longer lists the yahoo email anywhere), do a
one-time data cleanup: delete the stale `former` duplicate whose googleEmail
collides with a current member's emailAddress. (Peter is the ONLY such collision
in the whole DB — verified 2026-10-16.) Do this via the tunnel, read-verify
first, supervised.

### E. (defensive) auth.ts prefer-current tiebreaker
`auth.ts`'s session member lookup uses `findFirst` with no orderBy — on any
email collision it can pick an arbitrary (possibly stale) row. Add
`orderBy: [{ current: 'desc' }, { updatedAt: 'desc' }]` so a login always
resolves to the current/most-recent record. Cheap belt-and-suspenders even once
duplicates are prevented.

## Out of scope
- Persisting Payment Emails as a Member column (not needed; matched from the
  sheet each sync). Could revisit if alias matching needs to survive without the
  sheet.
- Merging historical duplicates beyond the one known collision (Peter).

## Testing
- mapSheetRow: reads Payment Emails into the alt-emails list (comma/semicolon
  split, normalized, deduped; blank → empty).
- syncRoster matching: (a) primary match updates in place (unchanged); (b) a row
  whose primary is NEW but whose googleEmail/payment-alias matches an existing
  member reconciles that member (no new row, emailAddress updated, left active,
  marked seen → not swept); (c) multiple existing matches → warn + safe
  primary-upsert, no merge; (d) unique-collision on rename → skip rename, log,
  no throw; (e) a member whose ONLY seen email is an alias is NOT swept.
- auth prefer-current: findFirst-equivalent returns the current row when two
  collide.
All against the existing fake-db test pattern in roster.test.ts.

## Rollout
Site deploy (Vercel). Then trigger `sync-roster` cron once (supervised) and
verify Peter is a single current record; clean up any residual orphan via tunnel.
