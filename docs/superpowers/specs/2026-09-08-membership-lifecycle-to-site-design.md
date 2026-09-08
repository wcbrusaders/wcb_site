# Membership Lifecycle → Site (PayPal intake, smart matching, reminders) — Design

**Date:** 2026-09-08
**Status:** Design (brainstormed) → review
**Repos:** wcb_site (gains the lifecycle), wcb_bot (loses PayPal intake), Google Apps Script (loses reminders/lapsing)

## Problem / motivation

A paying member (Peter Pray) kept getting "membership expired" reminder emails 8 days
**after** renewing. Root cause, confirmed by inventory: the renewal automation matches a
PayPal payment to a member by the **payer's email only** (bot `check_existing_member`,
column C). Peter's original row is under `petehpray@gmail.com`; he renewed paying with
`petehpray@yahoo.com`. No match → the bot created a **duplicate** new-member row (yahoo,
current) and never touched his **original** row (gmail, still expired). The Google Apps
Script then correctly dunned the stale expired row. (Fixed for Peter manually 2026-09-08:
updated the gmail row to Expires 9/1/2027, reset reminders, deleted the yahoo duplicate.)

This is systemic — any member paying from a different email than their roster email gets a
duplicate + gets mis-dunned. The membership lifecycle is also split across **three**
systems that don't share a key:
- **Bot (FastAPI/`membership_automation.py`)** — receives PayPal IPN, writes the roster **sheet**, sends welcome/renewal emails (Gmail API), adds to Google Group.
- **Google Apps Script** (bound to the roster sheet) — sends ALL expiry reminders (pre/post), moves lapsed members to the Lapsed tab, syncs Google Group membership. Runs daily 9:00 AM.
- **Site (`enforcement_sync` in the bot, reading the site DB)** — a separate loop that already reconciles Discord ban/suspend + group removal off the site **DB**'s `status`/`statusUntil`.

## Decisions (settled in brainstorming)

1. **The roster sheet REMAINS the source of truth.** It is load-bearing (site roster sync
   reads it daily as the DB's source; the board hand-edits it; honorary/partner rows live
   there; payments tab). We do NOT move source-of-truth to the DB. Instead the **site
   becomes a smarter writer to the sheet** — exactly what the bot does today, minus the
   duplicate bug.
2. **The site owns PayPal intake + member matching.** PayPal's IPN is repointed at a new
   site route; the site matches the payment to an existing member and writes the correct
   existing sheet row (renewal) or creates a new one (genuinely new) — never a duplicate.
3. **The site owns reminders + lapsing** via a daily Vercel cron reading the sheet. The
   Apps Script's reminder + lapse logic is **retired in lockstep** (same change window) so
   the two never both send — double-dunning is the top migration risk.
4. **Matching ladder** (high→low confidence; auto-act only on high confidence):
   1. Exact match on any known member email — `emailAddress`, `googleEmail`, `partnerEmail`, or a stored alias.
   2. Normalized-email match — lowercase, trim, strip gmail dots + `+tags`.
   3. **Name match → board review, never auto-merge.** PayPal sends first/last name; a name
      hit against an existing member is surfaced as a "likely renewal for X — confirm?"
      item on the admin site + officer notification. One-click confirm renews the existing
      row AND records the new payment email as an **alias** so it exact-matches next time.
   4. No match at all → treat as a new member (the current NEW MEMBER behavior).
5. **Alias memory.** When a board confirm (or a future form field) ties a new payment email
   to an existing member, store it so it never mis-matches again. Aliases accumulate; the
   member's login email is never overwritten.
6. **Google Group management stays where it is for now** (Apps Script `syncGroupMembership`
   + bot enforcement loop, both via the shared OAuth token with `admin.directory.group`).
   It is the piece with the real Google-Admin dependency; migrating it is out of scope here
   and can come later — the site already holds the same OAuth creds, so it CAN move.
7. **PayPal IPN authenticity WILL be verified** on the site (the bot currently skips it).

## Out of scope (explicit)

- Moving source-of-truth to the DB / retiring the sheet.
- Migrating Google Group / Drive / Calendar access management off the Apps Script + bot.
- The bot's brewing-knowledge brain (untouched; not membership).
- Changing how members pay (the hosted PayPal button/link stays:
  `https://www.paypal.com/ncp/payment/UQ6VG5K69FC92`). Members still can't be forced to
  supply a clean key — hence the matching ladder + optional note parsing.
- Stripe or any second processor.

## Architecture (target)

```
PayPal payment ──IPN──▶ [SITE] /api/webhooks/paypal (Node runtime, verified)
                              │
                              ├─ parse payload (email, name, amount, note)
                              ├─ log payment → sheet "Payments" tab (idempotent)
                              ├─ MATCH to member (ladder §4)
                              │     exact/normalized/alias  → auto
                              │     name-only               → PendingMatch (board review)
                              │     none                    → new member
                              ├─ RENEWAL: write existing sheet row (Expires/PaymentDate/Current)
                              │           + credit remaining days (early renewal)
                              ├─ NEW: append sheet row (+ join date/tenure; couple placeholder)
                              ├─ add access email(s) to Google Group (reuse OAuth creds)
                              └─ send welcome | renewal email (Resend, real subjects)

[SITE] Vercel cron daily ──▶ read sheet ──▶ pre/post-expiration reminders (Resend)
                                          └─ move lapsed → Lapsed tab (matches Apps Script rules)
   ⟂ Apps Script reminder + lapse functions DISABLED in the same deploy.

[SITE] admin ──▶ Pending matches queue: confirm→renew existing + store alias, or reject→new
          └──▶ Couple/partner completion: set partner name + email on the placeholder row
```

## Components

### 1. PayPal IPN receiver — `src/app/api/webhooks/paypal/route.ts`
- `export const runtime = 'nodejs'` (Prisma + IPN verification POST-back; can't be Edge).
- Verify authenticity: PayPal IPN verification handshake (POST the payload back to PayPal
  `cmd=_notify-validate`, expect `VERIFIED`). Reject non-verified. (This closes the gap the
  bot left open.)
- Filter to completed `web_accept`/`cart`/`express_checkout` (mirror bot's guards).
- Idempotency: a payment already logged (same txn id / date+amount+source) must not
  double-process — guard before mutating.
- Hand off to the lifecycle service (below). Return 200 fast (PayPal expects it); do the
  work inline or in a deferred task, but ensure it completes (Vercel has no bot-style
  background process — run it within the request, it's short).

### 2. Matching service — `src/lib/membership/match.ts` (pure, tested)
- `matchPayment({ email, firstName, lastName }, members) → MatchResult`
  where `MatchResult = { kind: 'exact'|'normalized'|'alias', member } | { kind: 'name-review', candidates } | { kind: 'none' }`.
- Reuse `normalizeEmail` (roster.ts). Add `normalizeGmail` (strip dots + `+tag` for gmail).
- Add a name normalizer + comparison (case/space/punctuation-insensitive; exact normalized
  name = candidate). NO fuzzy Levenshtein in v1 — exact-normalized only, to avoid false
  merges. Pure function over a members array so it's unit-testable with fixtures (NOT real
  members).
- Emails checked: `emailAddress`, `googleEmail`, `partnerEmail`, and the new alias set.

### 3. Alias storage
- The sheet is source of truth, so aliases live **in the sheet**: a new column (e.g.
  `Payment Emails` / `Known Emails`, comma-joined) on Sheet1, OR reuse an existing free
  column. Roster sync maps it into a `Member.paymentEmails`/alias field so matching (which
  runs against DB-synced members OR a live sheet read) can use it. **Open question:** new
  sheet column vs. DB-only field. Since matching happens at payment time and must be
  correct immediately (before the next daily sync), the receiver should match against a
  **live sheet read**, not the possibly-stale DB — so the alias must be readable from the
  sheet. Leaning: new sheet column, written by the confirm action.

### 4. Sheet write path — extend `src/lib/roster.ts::setRosterField`
- Today it only writes `'Google Email' | 'Partner Email'`. Extend the allowed columns to
  include `Expires`, `Payment Date`, `Current`, `Tier`, `Name`, `Last Reminder Sent`,
  `Reminder Count`, and the alias column. Keep the raw-row scan-by-email row resolver.
- Add a **row-locate-by-row-number** path (not just by email) — needed to (a) update a
  matched member's row when the payment email ≠ that row's Email Address, and (b) complete
  a couple placeholder row whose email is `NEEDS UPDATE`. (This also unblocks the
  partner-name gap raised separately.)
- Note the `< 26 columns` single-letter assumption in `realWriteCell`; the roster has
  columns through T — verify/extend column-letter resolution for 2-letter columns.

### 5. Lifecycle service — `src/lib/membership/process-payment.ts`
- Ports the bot's `process_membership_payment` logic to TS: tier from amount ($40 Single /
  $65 Couple), early-renewal day-credit proration (`calculate_expiration`), renewal vs new,
  couple placeholder creation + board alert, note-email extraction for Google access.
- Renewal writes the **matched** row (not payer-email lookup). New member appends. Couple
  creates the placeholder (unchanged behavior) but the board can now COMPLETE it on the site
  (§7).
- Google Group add: reuse the site's OAuth creds (roster.ts already builds a Google client)
  to call Admin Directory `members.insert` — same as the bot. Fail-soft.

### 6. Emails — `src/lib/email.ts` (extend) + templates
- Add a small template layer (the current file is one hardcoded-subject function). Port the
  4 live templates (welcome_single/couple, renewal_single/couple) AND wire the 7 currently-
  **orphaned** expiration/reminder/lapsed templates that only ever existed as dead assets.
- **Fix the subject bug:** the bot sends welcome/renewal with the default subject "Message
  from Wake County Brusaders" (no subject passed). Give each its real subject.
- All via Resend (`RESEND_API_KEY`/`RESEND_FROM`, already configured). From
  `WCB <noreply@wcbrusaders.com>` — NOTE the current club emails come from
  `club@wcbrusaders.com` (Gmail); decide whether reminders should keep that from-address
  for reply-to continuity (Apps Script uses `replyTo: club@`).

### 7. Reminder + lapse cron — `src/app/api/cron/membership/route.ts` + `vercel.json`
- Daily (align with Apps Script's 9:00 AM, or the existing 04:00 sync window — decide).
- Reads the sheet (source of truth), computes days-to-expiry, sends pre-expiration
  (14/7/2) and post-expiration (2/4) reminders, respects Opt Out (`STOP`) + Last-Reminder
  ≥2-day spacing (mirror the Apps Script rules exactly so behavior doesn't change), and
  moves >7-days-expired members to the Lapsed tab. Writes Last Reminder Sent / Reminder
  Count back to the sheet.
- **Cutover:** in the SAME change, disable the Apps Script's `processReminder` +
  `processLapsedMembers` (leave its group-sync alone). Bearer `CRON_SECRET` like existing crons.

### 8. Admin: pending-match review + couple completion — `src/app/members/admin/...`
- A board-gated queue of `name-review` payments: shows "$X from <email> (<PayPal name>) —
  looks like <existing member>? [Confirm renewal] [It's someone new]". Confirm → renews the
  existing row + stores the alias. Reject → creates a new member.
- Couple/partner completion (the separately-raised gap): a control to set the partner's
  **name + email** on the placeholder row (needs §4's row-number write) + optionally send
  the partner their welcome via Resend.
- Reuse `requireBoard()` + `recordAudit` patterns.

## Data model touch (minimal)
- If aliases go in the sheet: one new Sheet1 column + a `Member` field via roster sync (no
  destructive DB change; nullable string). If a `PendingMatch` queue needs persistence: a
  small new Prisma model (id, paymentPayload JSON, candidateMemberIds, createdAt, resolved).
  Prod `prisma db push` (coordinated) only if we add the model.

## Migration order (each step shippable + reversible)
1. **Matching service + tests** (pure, no side effects). No behavior change yet.
2. **Sheet write-path extension** (`setRosterField` columns + row-number locate) + tests.
3. **Email template layer + subject fix** on the site (Resend). No trigger yet.
4. **PayPal IPN receiver on the site** (verified) → lifecycle service → writes sheet, sends
   welcome/renewal, group add. **Repoint PayPal IPN from the bot to the site.** Retire the
   bot's `paypal_handler` + `membership_automation` intake (leave the code, stop the route).
5. **Reminder/lapse cron on the site** + **disable Apps Script reminder/lapse in the same
   deploy** (the double-dunning-critical step).
6. **Admin pending-match queue + couple completion.**
7. (Later / separate) Google Group management migration; not in this project.

## Privacy / safety
- IPN payloads contain PII (names, emails, amounts) — never log raw payloads; log matched
  member id + outcome only. Verify IPN authenticity before acting.
- Board-only for the pending-match queue + couple completion (existing gate).
- Auto-act only on high-confidence email matches; name-only is always human-confirmed — no
  silent merges of two different people who share a name.
- Idempotency on payments (don't double-renew / double-email on IPN retries).

## Open questions for review
- **Alias storage:** new Sheet1 column vs DB-only. (Leaning: sheet column, so payment-time
  matching reads current truth without waiting on the daily sync.)
- **Reminder from-address:** keep `club@wcbrusaders.com` (Gmail, Apps-Script parity + reply
  handling) or move to Resend `noreply@`? The Apps Script also parses STOP replies in Gmail
  — if reminders move to Resend/noreply, the opt-out reply handling needs a new home.
- **PayPal IPN vs the hosted-button return:** confirm the hosted `ncp/payment` button can
  still fire IPN to an arbitrary URL (IPN is account-level in PayPal settings, not per
  button — verify the IPN notification URL is repointable).
- **Cron time:** 9:00 AM parity vs the site's existing 04:00 sync slot.
- **Opt-out (STOP) handling:** the Apps Script reads Gmail for "STOP" replies to unsubscribe.
  If the site sends reminders, does it also take over STOP handling, or does that stay in
  the Apps Script (which would then still need to run)? This affects how cleanly the Apps
  Script can be retired.
