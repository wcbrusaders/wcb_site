# Unlinked-Members Admin View (+ bot server-member bridge) — Design

**Status:** brainstormed + approved in-chat 2026-09-09 (Jordan). Ready to plan.
**Repos:** `wcb_bot` (publishes the server-member list) + `wcb_site` (the admin view). Two coordinated pieces.

## Problem / motivation

Discord linking sits at ~62% (20/32 current members linked) and always will be
imperfect — some members never join Discord at all (that's why the club runs email
campaigns to draw them in), and others are on the server but never ran `/link`. The
board has no standing place to SEE the unlinked and act on them. The only current
source is the bot's `/admin link_coverage`, which dumps ephemeral text in Discord —
not where the board does member ops. The members-site admin portal is the control
plane; this visibility belongs there.

Clarifying facts established in brainstorming:
- `/link` DOES grant the Brusader role (a deliberate, kept change from the Discord-
  cleanup work) — but linking and the role are conceptually separate; this feature is
  about LINKING VISIBILITY, not role assignment.
- The site can compute "unlinked" itself (roster ∖ link table, all-emails matched —
  the same logic the Discord join/link nudge already uses). It reads the
  `Discord_Member_Link` table from the bot-data sheet today.
- The site CANNOT know who is actually ON the Discord server — only the bot has the
  guild member list. So a bot→site bridge is needed for the server-presence half.
- Server-presence for an UNLINKED member is fundamentally fuzzy: without a link there's
  no reliable roster↔Discord identity. DECISION: do NOT build fuzzy auto-matching. The
  bot publishes the raw server-member list; the site shows both lists side by side; the
  BOARD does the correlation by eye and forcelinks accordingly. Honest about the ambiguity.

## Architecture

### Bot side — publish the server-member list (`wcb_bot`)
- A new periodic task (`tasks.loop`, every few hours — matches the KB-indexer /
  reminders cadence) writes the full guild member list to a NEW worksheet
  `Discord_Server_Members` in the bot-data workbook (`WCB_BOT_DATA_SHEET_ID`, same
  workbook that holds `Discord_Member_Link`).
- Columns: `discord_id`, `username`, `display_name` (nick or global name), `updated_at`.
- Full overwrite each run (small list, ~dozens of rows) — simplest + always consistent;
  no incremental diffing. Fail-soft: a write error logs and the task continues next tick.
- Reuses the existing `SheetsConnector` + bot-data workbook handle; no new infra, no new
  credentials, no site→bot trigger.
- Resolve the guild by the existing `bot.get_guild(int(guild_id))`. Iterate
  `guild.members` (requires the members intent — the bot already has it for enforcement/
  linking; confirm at implementation).

### Site side — the admin view (`wcb_site`)
- FOLD INTO the existing membership admin page (`src/app/members/admin/membership/`),
  where the Discord nudge button + pending-match queue already live — one home for member ops.
- Two panels:
  1. **Unlinked current members** — computed server-side from the roster (current members)
     minus the `Discord_Member_Link` table, matched across ALL known emails (Email Address
     + Google Email + Partner Email + Payment Emails — the existing all-emails logic that
     fixed the nudge false-positives). Each row: name + known emails. Reuse / share the
     nudge's matching so the two never disagree. Each row (or the panel) ties into the
     EXISTING Discord join/link nudge action (email campaign) — no new email machinery.
  2. **Discord server members** — read from the new `Discord_Server_Members` sheet:
     display_name + username + updated_at. Shown alongside panel 1 so the board eyeballs
     the overlap ("this server member matches this unlinked roster member") and forcelinks
     in Discord accordingly. Include the sheet's `updated_at` so staleness is visible.
- Board-gated (existing `requireBoard`). Read-only (no writes to either sheet from the
  site in v1 — forcelinking stays a bot `/admin forcelink` action the board runs in Discord).

## Data flow
```
bot periodic task ──writes──> Discord_Server_Members sheet (bot-data workbook)
                                        │ read
roster + Discord_Member_Link ──────────┼──> site membership admin page
   (site already reads both)           │
                                   two panels: unlinked (computed) | server members (bridged)
                                   board correlates by eye → /admin forcelink in Discord
```

## Out of scope (v1)
- Fuzzy auto-matching of unlinked roster members to server members (deliberately human).
- Forcelinking FROM the site (stays a bot command; site is read-only visibility here).
- Real-time presence (periodic refresh is enough for a board-review view).
- "On Discord vs never joined" as a hard flag — the board infers it from the two lists.
- Any change to how Brusader is granted (that's the Discord-cleanup work, separate).

## Testing
- Bot: the server-member serialization (guild members → row dicts) as a pure function,
  unit-tested with fake member objects; the sheet-write behind the existing connector seam.
- Site: the unlinked computation (roster ∖ link-table, all-emails) as a pure/DI'd function
  with fixtures — mirrors the nudge's existing tested matching; the panel reads via the
  existing sheet-read plumbing (DI'd, no live sheet in tests).

## Rollout
- Bot: deploy via `flyctl deploy --app wcb-bot-2025` (expect the post-deploy machine-start
  quirk). The new sheet auto-creates on first task run (or create it once up front).
- Site: normal Vercel deploy. New sheet id/name is a constant (same workbook, so
  WCB_BOT_DATA_SHEET_ID already in site env).
- Coordinate: bot task should run at least once (populating the sheet) before the site
  panel is relied on, else panel 2 is empty (handle empty gracefully — "no server-member
  data yet; the bot publishes it every few hours").
```
