# WCB Officer Admin Page — Design

**Status:** Approved design · Not yet planned/built
**Date:** 2026-08-14
**Repo/branch:** `wcb_site`, feature branch off `main` (per established WCB subsystem workflow)

## Goal

A board-only console at `/members/admin` that (1) executes the Code of Conduct's enforcement (interim freeze → suspend → removal-by-vote), (2) gives **all** board members visibility into the roster + payment/expiry data currently locked to one person's Google Sheet, and (3) allows two targeted roster edits. Built as a secure shell so future leadership features slot in.

## Architecture — sheet stays the single source of truth

The roster Google Sheet remains authoritative (the Discord bot + `syncRoster` depend on it). The admin page **reads** the sheet/DB for display and **writes back to the sheet** via the existing Google client (`wcb_site/src/lib/roster.ts` already has sheet read + Google Admin Directory group write via domain-wide delegation). A new **`Status` column** (`active` | `interim` | `banned`) on the roster sheet drives enforcement; the auth gate, `syncRoster` (Google group → Drive/Calendar), and the bot all key off it. One flag flip cascades to every system. No new secrets shared between site and bot — both read the sheet.

## Decomposition (three implementation plans, built in this order)

Spec A is the foundation; B and C depend on it.

### Spec A — Secure admin shell + roster view + write actions + audit log
- New route `/members/admin`, gated by existing `isBoard` flag (roster `Board Member` column → `MemberRecord.isBoard`). Non-board = 404, consistent with other gated routes.
- **Roster view (all board):** member list with name, email, tier, expiry/join/payment dates, board flag, partner relationship. Solves "only the president can see the roster." Read from sheet/DB.
- **Two write actions** (write back to the sheet via existing Google client): add a **secondary email**; set a **partner-membership** relationship.
- **Audit log** (new app DB table): every admin **action** recorded (who, what, when, why). Actions, not passive views (right-sized — see Security).
- **Server-side board check on every read/write:** re-verify `isBoard` against the **live roster**, not a cached token, so a removed officer loses access instantly mid-session.

### Spec B — Enforcement: Status cascade + interim freeze + removal vote
- **`Status` cascade:** `interim`/`banned` ⇒ members-area access denied at the auth gate (instant); `syncRoster` removes them from the members@ Google Group ⇒ Drive/Calendar access gone (~sync latency); the **bot reads `Status`** and strips Discord roles / removes on its sync (loosely coupled, no shared secret). Optional "force sync now" button to close the latency gap.
- **Interim freeze (fast path, 1 key):** any single board member triggers immediate access cutoff; stamps who + when; starts the **7-day decision clock**; posts a notice to the officer channel; the page **auto-flags it as expired** if 7 days pass with no recorded decision, prompting lift-or-ratify. Prevents a solo freeze becoming a silent indefinite ban.
- **Removal vote (legitimate path, unfakeable):**
  - **Denominator computed at case-open** from the live roster: count `isBoard=true`, subtract recused (subject + anyone close), lock into the case so it can't be gamed mid-vote.
  - Each eligible board member **logs into `/members/admin` (existing email-code auth) and casts their own vote** (approve/reject/abstain). No one votes for anyone else — each vote tied to that member's authenticated session. **This is what makes it unfakeable.** Votes trickle in over the 7-day window (no need for simultaneous presence).
  - **Execute Ban is hard-locked** until BOTH: (a) **quorum floor met — at least 3 eligible board members have voted**, AND (b) **two-thirds of those who voted approve**.
  - **Non-votes = abstain**; the two-thirds math is of those who voted; the quorum floor (3) prevents a tiny turnout from deciding.
  - Every vote logged (who/when/how). Fully auditable.
- **Recusal:** a board member marked recused on a case is excluded from that case's denominator and cannot vote on it. (Same mechanism the Code's Ombudsman-recusal relies on.)
- **Break-glass:** none in-app. In a true lockout the president fixes at the source (roster sheet / app DB / Fly). Documented runbook. The app stays backdoor-free by design.

### Spec C — Strike & incident log + board-votes record
- The confidential conduct record the Code requires: per-member strike history (Correction / Strike 1–3), status, dates, 12-month reset flagging (expired strikes marked cleared).
- Board-votes record (removal votes from Spec B surface here; other governance votes can be recorded too).
- Visible to the Board + Ombudsman; confidential.

## Security posture (right-sized)

The roster is **low-sensitivity contact + membership data** (names, emails, tiers, dates, partner links) — NOT high-grade PII (no SSN, DOB, address, card/bank data; Stripe/PayPal hold payment instruments, not the sheet). Security effort therefore protects the **destructive write actions** (mass-lockout / unilateral removal), not the member list.

**Kept:**
- `isBoard` gate + **server-side live-roster check on every write**.
- **Action audit log** (governance/accountability reason).
- **Two-thirds-vote-required + quorum floor before a permanent ban executes** (the tool enforcing the Code).
- **Out-of-band break-glass only.**

**Dropped as overkill for this data (explicit decision):** TOTP/authenticator second factor; PII masking + reveal-on-click; logging passive views; fast step-up re-auth. (Email-code login + live board check is proportionate.)

## Threat model addressed
- **Compromised board email inbox** → mitigated by: the *destructive* action (removal) requires 3 distinct authenticated board votes, so one hijacked inbox can't remove anyone. (An interim freeze is single-key by design for emergencies, but is loud + auto-expires in 7 days.)
- **Former/removed officer** → server-side live-roster check = instant lockout on sheet change.
- **Rogue single admin** → cannot fake a vote (each vote tied to a real login); cannot execute removal alone (quorum + two-thirds).

## Explicitly OUT (not this build)
- Shared credentials (club@ inbox, Bluevine, Stripe for treasurer) — separate secrets-management project; banking creds do not belong behind the site.
- Dues/payment *automation* — the bot already does it (renewal nudges, expiry warnings, status-on-payment); admin page only *displays* status.
- Announcements-to-Discord, event admin, Ombudsman inbox, self-service appeals — future slots in the shell.

## Dependencies / sequencing notes
- **Permanent-ban path should not be USED until the Code is ratified**, though it can be built. Interim freeze is a safety mechanism arguably usable sooner.
- Ties to the Code of Conduct v0.2 (strike ladder, 7-day clock, two-thirds threshold, recusal, Ombudsman dual-role) — the tool embodies that document.
- The members-hub **captive-page CoC gate** (read + checkbox before PayPal/Stripe) is a separate, related build, blocked until ratification.
