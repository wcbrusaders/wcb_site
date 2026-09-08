# Membership Lifecycle → Site (PayPal intake, smart matching, emails, access) — Design

**Date:** 2026-09-08
**Status:** Design (brainstormed) → review
**Repos:** wcb_site (gains the lifecycle), wcb_bot (loses PayPal intake; enforcement loop
gains membership lapse/rejoin), Google Apps Script (loses reminders/lapsing + group sync)

**Two phases:** Phase 1 = smart matching + emails (welcome/renewal/reminder/re-engagement) +
reminder/lapse cron — fixes the Peter duplicate-and-mis-dun bug, the missing partner welcome,
and the rejoin-duplicate. Phase 2 = access de-provision on lapse / re-provision on rejoin
across the site flag, Google Group (→ Drive + Calendar), and Discord (via the bot's
enforcement loop). Phase 2 depends on Phase 1 and ships after it.

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
6. **Access provisioning is PHASE 2** (§9): on lapse the site removes Google Group
   `members@`/`board@` (→ revokes Drive + Calendar) using its OWN OAuth creds (the roster
   sync's known-working creds, NOT the flaky Apps Script `AdminDirectory`), flips the site
   `current` flag (auto via sync), and signals the bot's enforcement loop to pull the
   Discord role; on rejoin it reverses all three. Retires the Apps Script's group sync.
   Phase 2 depends on Phase 1's correct lapse-writing + rejoin-matching.
7. **PayPal IPN authenticity WILL be verified** on the site (the bot currently skips it).

## Out of scope (explicit)

- Moving source-of-truth to the DB / retiring the sheet.
- The bot's brewing-knowledge brain (untouched; not membership).
- Facebook group — it is FREE-FOR-ALL (open to anyone, not gated on membership), so it is
  NOT an access surface: nothing to grant or revoke. Not part of provisioning at all.
- A Facebook recruitment POST (a "benefits of paid membership → join" post to drive
  signups) — desired by Jordan but a separate content/marketing task, explicitly AFTER this
  project. Not scoped here.
- NOTE: Google Group / Drive / Calendar / Discord access de-provision+re-provision is NO
  LONGER out of scope — it moved IN as Phase 2 (§9).
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

**SCOPE — the site sends emails for these purposes (Jordan, 2026-09-08):**
**(1) Welcome (new members), (2) Renewal confirmation, (3) Expiration reminders (pre/post),
(4) Re-engagement (lapsed "we miss you").** All branded HTML matching the existing welcome
look (amber `#d97706` header + details box + CTA buttons).

**Discord invite — in BOTH the email AND the members site (Jordan, 2026-09-08, revised):**
The welcome email includes the actual Discord invite LINK directly (a new member is most
engaged right when they get the email; forcing a site login first adds friction at the worst
moment — many won't visit the members area initially). The members area ALSO hosts the
invite (durable home, rotatable, for returning members / those who lost the email). Both
point at the same invite. KNOWN TRADEOFF (accepted): an in-email invite can be forwarded to
a non-member, slightly weakening the paid-only gate — accepted because invites get shared
regardless, the invite is rotatable if it leaks, and the friction cost of hiding it outweighs
the leak risk for a homebrew club. The site's invite section is still behind the member gate.

**Renewal confirmation is CORE (elevated from optional 2026-09-08):** when a renewal
processes successfully, the member immediately gets a "✅ payment processed successfully —
your membership is active through {expiration}" email. This is the reassurance that would
have defused the Peter incident (pay → confirmed active), so it is first-class, not a
nice-to-have. Fires in REAL TIME at renewal (inside the IPN handler, not the cron), same as
welcome. Uses the existing branded `renewal_single/couple` template (`first_name, tier,
expiration, days_credited`), subject fixed to something like "Membership Renewed — active
through {expiration}".
  - **Only on SUCCESS:** send after the roster write succeeds, so "payment processed
    successfully" is truthful. PayPal already filters to `payment_status=completed`.
  - **Ambiguous match (name-review → board queue):** do NOT send a false "you're all set."
    Either send a softer "we received your payment and are finalizing your membership —
    we'll confirm shortly" note, or hold the confirmation until a board member resolves the
    match. (Implementer: prefer the softer-ack so the payer isn't left silent.)

- Add a small template layer (the current `email.ts` is one hardcoded-subject function).
  All via Resend (`RESEND_API_KEY`/`RESEND_FROM`, already configured).

- **Welcome** — port the existing branded HTML `welcome_single` / `welcome_couple` (they
  DO send today and look good). Variables: `first_name, tier, expiration`. Drop
  `transaction_id` from the body unless wanted. **Also send the PARTNER their own welcome**
  when a couple's partner is completed (the gap raised earlier — partners currently never
  get welcomed). **Fix the subject bug:** the bot sends welcome with the default subject
  "Message from Wake County Brusaders" (no subject passed) — give it a real subject
  ("Welcome to Wake County Brusaders!").

- **Expiration reminders** — pre (14/7/2) + post (2/4). Members currently receive the Apps
  Script's PLAIN-TEXT pre/post copy; the site will send **branded HTML** versions (Jordan's
  call — upgrade the look). Author two new HTML templates using the welcome email's visual
  shell; the message copy is the Apps Script's real wording (expires-in-N-days / expired-on
  + renew CTA), NOT the dead bot drafts. Variables: `first_name, expiration_date,
  renewal_cost, renewal_link`.

- **Re-engagement** — for LAPSED members (moved to the Lapsed tab). A "we miss you / come
  back" branded HTML email. This is a NEW thing the site sends that nothing sends today
  (the Apps Script only moves people to Lapsed silently). Decide the trigger: on-lapse
  (once, when the cron moves them) and/or a follow-up. Keep it to 1–2 sends, not the dead
  drafts' 30/60-day arc unless wanted.

- **The 7 orphaned `templates/emails/expiration/*.html` bot drafts are IGNORED** — never
  wired, never sent, contain unfinished `[Year]`/`[competition]` copy. Salvage their VISUAL
  shell only (or just reuse the welcome shell); use NONE of their copy.

- From-address: `RESEND_FROM` (`WCB <noreply@wcbrusaders.com>`). NOTE the Apps Script sends
  reminders from `club@wcbrusaders.com` with `replyTo: club@` and parses "STOP" replies in
  that Gmail inbox for opt-out. If reminders move to Resend/noreply, STOP-reply opt-out
  handling needs a new home (see Open Questions).

### 7. Reminder + lapse cron — `src/app/api/cron/membership/route.ts` + `vercel.json`
- Daily (align with Apps Script's 9:00 AM, or the existing 04:00 sync window — decide).
- Reads the sheet (source of truth), computes days-to-expiry, sends pre-expiration
  (14/7/2) and post-expiration (2/4) reminders, respects Opt Out (`STOP`) + Last-Reminder
  ≥2-day spacing (mirror the Apps Script rules exactly so behavior doesn't change), and
  moves >7-days-expired members to the Lapsed tab. Writes Last Reminder Sent / Reminder
  Count back to the sheet.
- **Re-engagement:** when the cron moves a member to the Lapsed tab, send the re-engagement
  ("we miss you") email once (§6). This is net-new — nothing sends it today.
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

### 9. Access de-provision / re-provision — PHASE 2 (Jordan, 2026-09-08)

Today access management is the weakest link, and does NOT work reliably:
- **On lapse:** the bot's enforcement loop does NOTHING (it keys on `status` =
  ban/suspend, never on membership expiry). The **only** lapse-driven removal is the Apps
  Script `processLapsedMembers` → `removeFromGroup(members@/board@)` at >7 days expired —
  and that likely **fails silently** (Apps Script `AdminDirectory` advanced service must be
  explicitly enabled; if not, every call throws-and-is-caught). Discord is NEVER pulled on
  lapse (the script just emails the board "revoke Discord manually"). Net: **lapsed members
  effectively keep their access.**
- **On rejoin:** a returning lapsed member (moved to the Lapsed tab) is not found by the
  current-tab-only match → gets a **duplicate** new row; Discord is never restored. Group
  access does eventually come back via the daily group-sync (Current=Yes → add), but through
  the duplicate.

**Target — the site owns provisioning across all surfaces.** The access set is 3 mechanisms
(NOT 4–5 separate ones — Drive + Calendar both flow FROM the Google Group):
1. **Site members-area access** — gated on the `current` flag. Correct lapse-writing (Phase
   1) → daily sync flips `current=false` → site access drops **automatically** (up to ~1-day
   sync lag). Mostly free once lapse is written right; no API call needed.
2. **Google Group `members@` (+ `board@` if a board member)** — removing/adding this ONE
   membership revokes/grants **Drive access AND Calendar write** together. The site does this
   with its OWN Google OAuth creds (the roster sync's known-working creds, not the flaky
   Apps Script `AdminDirectory`).
3. **Discord role — STRIP the member (Brusader) role on lapse, leave them in the server**
   (not kick/ban — forgetting to renew ≠ discipline; role-strip is graceful + keeps them in
   reach of re-engagement, and renewing re-adds it). The site can't touch Discord: reuse the
   **bot's existing enforcement loop** — the site flips a DB field on lapse/rejoin, and the
   bot's 10-min `reconcile()` loop (already does role add/remove via `suspend`/`restore`,
   snapshotting roles for exact restore) acts on it. Extend `enforcement_decision.decide()`
   to also consider membership lapse, not just ban/suspend.
   - ⚠️ **MUST VERIFY BEFORE BUILDING PHASE 2:** role-strip only removes access IF the
     members-only channels (Brusader/coordinator/officer) are permission-gated so a
     NO-ROLE member can't view them (`@everyone` denied View Channel + the Brusader role
     allowed). If instead those channels are visible to `@everyone`-in-server, then the real
     gate is *server membership* (Jordan confirmed the invite itself is members-only), and
     role-strip does nothing visible — in that case lapse would need a KICK, not a strip.
     30-second check: Discord → members-only channel → Edit Channel → Permissions → is
     `@everyone`'s "View Channel" denied? Confirm before speccing the Phase-2 lapse action.
   - Discord ENTRY is itself a members-only perk (invite not shared publicly). Accepted
     leak (Jordan): the welcome email carries the invite for zero-friction onboarding even
     though a forwarded email could let a non-member JOIN role-less — they'd see nothing
     gated (given role-gating holds) and can be kicked; invite is rotatable if it leaks.

Not an access surface at all: **Facebook group** — it's FREE-FOR-ALL (open to anyone, not
membership-gated), so there's nothing to revoke on lapse or grant on rejoin. The emails may
still mention FB as a community perk, but it is NOT part of provisioning. 

**De-provision trigger:** the Phase-1 cron that moves a member to Lapsed also (Phase 2)
removes the Google Group membership + flips the DB field the bot reads for Discord.
**Re-provision trigger:** the Phase-1 rejoin match (extended to search the Lapsed tab —
reactivates the ORIGINAL record, no duplicate) re-adds the Google Group + flips the DB field
back so the bot restores Discord. Both fail-soft + audited.

**Dependency:** Phase 2 CANNOT be correct until Phase 1's matching + lapse-writing are
correct (you can't revoke "lapsed" access until "lapsed" is determined reliably, and you
can't re-provision a rejoin until rejoin matches the original record instead of duplicating).
Hence Phase 2 is strictly after Phase 1.

## Data model touch (minimal)
- If aliases go in the sheet: one new Sheet1 column + a `Member` field via roster sync (no
  destructive DB change; nullable string). If a `PendingMatch` queue needs persistence: a
  small new Prisma model (id, paymentPayload JSON, candidateMemberIds, createdAt, resolved).
  Prod `prisma db push` (coordinated) only if we add the model.

## Migration order — TWO PHASES (each step shippable + reversible)

### PHASE 1 — matching, emails, reminders (fixes Peter, dunning, rejoin-duplicate)
1. **Matching service + tests** (pure, no side effects). Searches Sheet1 AND the **Lapsed
   Members tab** (so a rejoin reactivates the original record, not a duplicate). No behavior
   change yet.
2. **Sheet write-path extension** (`setRosterField` columns + row-number locate; can write
   Expires/PaymentDate/Current/etc., and move a row between Sheet1 ↔ Lapsed for rejoin) + tests.
3. **Email template layer + subject fix** (Resend): welcome, renewal-confirmation, reminder,
   re-engagement — branded HTML, "Dual" not "Couple", members-area-first, replyTo club@ +
   contact line, unsubscribe link. No trigger yet.
4. **PayPal IPN receiver on the site** (verified) → lifecycle service → matches (incl. Lapsed
   tab) → writes sheet (renewal on existing row / reactivate lapsed / new) → sends
   welcome|renewal → Google Group add. **Repoint PayPal IPN from the bot to the site.**
   Retire the bot's `paypal_handler` + `membership_automation` intake (leave code, stop route).
5. **Reminder/lapse cron on the site** (9am) + re-engagement on lapse + **disable the Apps
   Script's `processReminder` + `processLapsedMembers` in the SAME deploy** (double-dunning
   is the critical risk). Unsubscribe route + honor existing Opt Out.
6. **Admin pending-match queue + couple/partner completion.**

### PHASE 2 — access de-provision / re-provision (§9); strictly AFTER Phase 1
7. **Site removes Google Group `members@`/`board@` on lapse** (via the site's own OAuth
   creds) — replacing the flaky/likely-broken Apps Script `AdminDirectory` removal. Drive +
   Calendar revoke with it. Re-add on rejoin. Retire the Apps Script `syncGroupMembership`.
8. **Discord via the bot's enforcement loop:** extend `enforcement_decision.decide()` +
   `enforcement_sync` to also act on membership lapse/rejoin (a DB field the site flips), so
   Discord role is pulled on lapse and restored on rejoin. (Site members-area access already
   drops/returns automatically via the `current` flag from Phase-1 lapse-writing.)

## Privacy / safety
- IPN payloads contain PII (names, emails, amounts) — never log raw payloads; log matched
  member id + outcome only. Verify IPN authenticity before acting.
- Board-only for the pending-match queue + couple completion (existing gate).
- Auto-act only on high-confidence email matches; name-only is always human-confirmed — no
  silent merges of two different people who share a name.
- Idempotency on payments (don't double-renew / double-email on IPN retries).

## Resolved decisions (were open questions — settled 2026-09-08)

- **Alias storage → new Sheet1 column** ("Payment Emails", comma-joined). Written when a
  board confirm ties a payment email to a member. Payment-time matching reads the LIVE sheet
  so a just-added alias is correct immediately (no waiting on the daily sync). Roster sync
  maps it into a nullable `Member` field for DB-side use. Consistent with sheet = source of
  truth.

- **PayPal IPN → site receives it directly.** Jordan has PayPal account access and will
  repoint the IPN notification URL (account-level, not per-button) from the bot's endpoint
  to the new site endpoint at cutover. No bot-forwarding hop. The site verifies IPN
  authenticity (the `_notify-validate` handshake the bot skips).

- **Sender → `noreply@wcbrusaders.com` via Resend** (`RESEND_FROM`, what the site already
  uses for login codes), BUT with **`replyTo: club@wcbrusaders.com`** on every membership
  email AND a visible **"Questions about your membership? Email club@wcbrusaders.com"** line
  in every footer. Rationale (Jordan): a member with a problem — e.g. "I already renewed!" —
  must be able to reach a human; noreply@ alone dead-ends them and re-creates the Peter
  frustration. replyTo routes a hit-reply into the club inbox; the visible line covers
  clients that hide reply-to. This is a HUMAN reply path, distinct from the retired
  automated STOP-parser (replaced by the unsubscribe link). Applies to all email purposes.

- **Opt-out → one-click unsubscribe LINK, not STOP-reply.** Reminder/re-engagement emails
  include an "unsubscribe from reminders" link → a site route that sets the member's Opt Out
  on their sheet row. This REPLACES the Apps Script's fragile Gmail "STOP" reply parsing,
  which is retired along with its reminder+lapse logic. (noreply@ can't receive replies, so
  a link is the correct mechanism regardless.) The site must honor an existing `Opt Out`
  value of `STOP`/`Yes` already in the sheet from the old system.

- **Timing → two distinct triggers (NOT one batch):**
  - **Welcome emails fire in REAL TIME at signup** — they run inside the PayPal IPN handler
    the moment a payment processes, so a new member is welcomed immediately (never waits for
    a daily job). Same for the renewal path and partner-completion welcome.
  - **Reminder + re-engagement cron runs daily at ~9:00 AM ET** (parity with the members'
    current reminder timing), as a separate Vercel cron from the real-time intake.
