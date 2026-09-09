# Membership / Club-Ops — Status & Backlog

Single source of truth for what's shipped vs. deferred, so nothing lives only in chat.
Last updated: 2026-09-09.

## ✅ SHIPPED & LIVE (production)

- **Membership lifecycle Phase 1** — PayPal IPN received + verified on the site; smart
  payment→member matching (exact / normalized / name-review → board queue; searches
  current + Lapsed tabs; fixes the "paid-from-a-different-email → duplicate row + kept
  dunned" Peter bug); early-renewal day-credit; reactivation of lapsed members on rejoin.
- **Four transactional emails** (branded HTML, from noreply@ + replyTo club@, "Dual" not
  "Couple", members-area + Discord links, unsubscribe link): Welcome, Renewal confirmation,
  Expiration reminder (pre/post), Re-engagement (lapsed).
- **Reminder + lapse cron** (daily 9am ET / 13:00 UTC) — pre 14/7/2, post 2/4, ≥2-day
  spacing, Opt Out STOP/Yes, lapse >7 days → move to Lapsed tab + re-engagement email.
  Apps Script's reminder + lapse functions disabled in lockstep (surgical — its
  syncGroupMembership + processStopReplies still run).
- **Board review queue + couple/partner completion** — ambiguous name-matches queued
  (PendingMatch), tab-aware confirm (reactivates lapsed correctly); couple placeholder row
  created on a Dual signup; complete-partner sets name+email + sends the partner's welcome.
- **Discord join/link nudge** — board-triggered blast to current, unlinked, not-opted-out
  members; checks ALL known emails (Email Address + Google Email + Partner Email) against
  the link table so members linked under a non-primary email aren't falsely nudged.
- **Email preview** — board button emails all sample emails to club@ for copy review.
- **Auto-catalog payer emails** — every renewal appends a newly-seen payer email to the
  member's 'Payment Emails' alias column (learns every address they pay from).
- Env: `PAYPAL_IPN_URL`, `WCB_BOT_DATA_SHEET_ID` set on Vercel; `Payment Emails` column
  added to Sheet1 (col U).

## ⚠️ DEFERRED — named as out-of-scope in the specs, NOT dropped

1. **Access DE-PROVISION on lapse / RE-PROVISION on rejoin** (membership spec Phase 2).
   Remove Google Group (→ Drive+Calendar) + Discord role on lapse; restore on rejoin.
   Discord via the bot's enforcement loop (auto-if-linked / officer-confirm-if-not /
   silent "no Discord" state). **BLOCKED on #2.**
2. **Discord permission cleanup + role provisioning**
   (`docs/superpowers/specs/2026-09-08-discord-access-cleanup-design.md`). The server is
   wide-open (@everyone has server-wide view; Brusader role gates nothing) and role
   assignment is opt-in-only (/link). Flip @everyone view off, make Brusader the member
   key, minimal lobby, right-size over-provisioned roles, reliable role provisioning tied
   to membership. Dry-run + confirm apply. Designed, not built. Prereq for #1.
   - Pre-flight already known: backfill Brusader to arycella + trippposke (Coordinators
     without it); Jordan force-links the on-Discord unlinked members.
3. **Event → signup attribution** (original membership design future-work). Correlate
   calendar events / meeting topics with joins in the following days (the Brulosophy /
   Martin Keene "~4 signups" case). Needs a calendar-events feed into the site. Not scoped.
4. **Biweekly MembershipSnapshot cron** (reports design Phase 4). Month-over-month history
   table so trends survive beyond what's recomputable from the live roster. Not built.

## 🔧 POLISH / MINOR (from review gates — non-blocking, backlog)

- Post-expiration reminder copy was authored by inference (only a pre-expiration mockup
  existed) — Jordan to eyeball via the club@ email preview before it fires much.
- Nudge count arithmetic: blank-email rows vanish from all three counters (cosmetic).
- Recipient-email logged on send failure (server logs; no PII-in-logs policy today).
- Email shell duplicated between emails.ts and discord-nudge.ts (share it if touched again).
- Missing direct tests: readReminderRows google/partner extraction; auto-catalog append
  onto a *pre-populated* Payment Emails cell (behavior mirrors the tested board-confirm path).
- Bot's `/admin link_coverage` still checks column-C-ish only — its unlinked number may
  over-report vs the site's all-emails logic. Diagnostic only; harmless.

## 🕓 OPERATIONAL / OTHER OPEN (Jordan's, pre-existing)

- Retire the bot's PayPal IPN route (`wcb_bot/webhooks/server.py`) — left as a fallback;
  clean up after a few clean real payments land on the site.
- Rotate the leaked bot keys (Anthropic / Google OAuth / Discord) — STILL OPEN.
- The bot's 2.2.0 CHANGELOG needs a home (Discord announcement?).
- Red Tilt HA reload + land the tilt-wedge fix on Unraid; disk sdg CRC (reseat cable, not urgent).

## Prod smoke-checks still worth doing on first real events
- First real renewal writes the right row + email (M/D/YYYY Expires parse vs live cells).
- First multi-lapse cron run moves the correct rows (descending-order fix).
- moveRowToTab real append/delete path (untested against live Sheets).
