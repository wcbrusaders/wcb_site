# WCB Competition Tracking — Design

**Date:** 2026-08-11
**Status:** Approved (brainstorming) → ready for implementation plan
**Scope:** `wcb_site` — a members-hub subsystem for tracking external homebrew competitions the club participates in: members log which comps they've entered and their beers; officers see all entries across the club to plan shipping (how many containers to buy, who's dropping off). Single source of truth that **complements** the Discord calendar (Discord still broadcasts dates; this tracks entries + logistics). New feature at `/members/competitions`.

## Problem

Members sign up for many external comps and lose track of deadlines, where to bring bottles, and when. Officers need to coordinate club shipping — the club covers shipping for SHA comps — which means knowing, per comp, **how many entries are being club-shipped** (× bottles required) so they can buy enough shipping containers ("whale pods") and know who still needs to drop off. Today this lives in people's heads and scattered Discord messages. There's no scraping of comp websites (comp data varies wildly), so the person adding a comp is responsible for entering it accurately.

## Key decisions (locked in brainstorming)

- **Two roles of data:** *Competitions* are shared external records anyone can add; *entries* are per-member (a member's beer in a comp).
- **Anyone can add a comp.** The **adder or an officer** can edit a comp's details; **only officers** can delete a comp (it may have others' entries attached).
- **Members manage only their own entries** (add/edit/delete). A member sees only their own entries + the shared comp info — no peer visibility.
- **Officers see ALL entries across the club, in full** (beer name + style + owner + channel + registered). No field redaction: beer names are not judge-sensitive (judges never see entrant beer names), so the earlier "hide specifics" concern is dropped.
- **All comps allow both shipping and drop-off.** No per-comp channel flags. Each *entry* picks a channel: `club_ship` (club ships it — counts toward container math), `self_ship` (member ships it themselves), or `dropoff` (member drops it off locally).
- **Bottles required per entry** is a comp field (comps need 2 or 3, etc.). Officer container math = Σ(`club_ship` entries for the comp) × `bottlesRequired`.
- **Logistics timing is advisory, not enforced.** Derived from `shippingDeadline`: "commit club-ship entries by ~7 days before" and "deliver to the shipper by ~7 days before." The system surfaces these and flags approaching ones; it never blocks. Purpose is a *count to act on*, not gatekeeping.
- **Addresses are free text** (shipping required, drop-off optional). No address-validation API — render a "View on Google Maps" link (a `maps.google.com/?q=<address>` URL) so a human can eyeball it. Zero external dependency.
- **Reminders = in-app banner only.** Computed live on page load (no cron, no email, no push). Discord keeps owning the calendar broadcast.
- **Past comps auto-hide.** When `shippingDeadline < now`, a comp drops off the active dashboard into a "Past competitions" archive toggle; nothing is deleted.

## Out of scope

- Scraping/importing comp data from comp websites (manual entry only).
- Address validation / geocoding APIs.
- Email / push / cron reminders (in-app live banner only).
- Peer visibility (members seeing each other's entries) — officers only.
- Judging assignments, scoresheets, results/medals tracking.
- Payment/registration-fee handling (a `registered` boolean is the only status).
- Rebuilding the Discord calendar.

## Data model (Prisma — additive, two new models)

No changes to existing tables. `memberId` is a plain `String` with **no relation**, matching the lending system's convention (member details fetched by batched lookup; a stale memberId must not crash a view).

```prisma
model Competition {
  id                   String      @id @default(cuid())
  name                 String
  homepageUrl          String
  registrationDeadline DateTime
  shippingDeadline     DateTime
  bottlesRequired      Int
  shippingAddress      String
  dropoffAddress       String?
  addedById            String      // Member.id of the adder (edit-rights)
  entries              CompEntry[]
  createdAt            DateTime    @default(now())
  updatedAt            DateTime    @updatedAt
  @@index([shippingDeadline])
}

model CompEntry {
  id            String      @id @default(cuid())
  competitionId String
  competition   Competition @relation(fields: [competitionId], references: [id], onDelete: Cascade)
  memberId      String      // Member.id, no relation (lending convention)
  beerName      String
  style         String
  channel       String      // 'club_ship' | 'self_ship' | 'dropoff'
  registered    Boolean     @default(false)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  @@index([competitionId])
  @@index([memberId])
}
```

Channel is a plain `String` with a TS union (`type EntryChannel = 'club_ship' | 'self_ship' | 'dropoff'`) — no Prisma enums, matching the codebase convention. `onDelete: Cascade` on the relation so an officer deleting a comp removes its entries cleanly.

**Derived (computed, never stored):**
- `isPast(comp, now)` = `shippingDeadline < now`.
- `commitByDate(comp)` = `shippingDeadline − 7 days` (advisory "have club-ship entries committed by").
- `deliverByDate(comp)` = `shippingDeadline − 7 days` (advisory "deliver to shipper by"). (Both 7 days per the club rule; kept as separate named helpers so they can diverge later without a schema change.)
- `podTotal(comp)` = count of that comp's `club_ship` entries × `comp.bottlesRequired`.

## Architecture

**Query/logic layer — new framework-free module `src/lib/competitions.ts`** (mirrors `lending.ts`: pure functions + DI'd db, unit-tested). Responsibilities:
- Types: `EntryChannel`, `CompetitionView`, `CompEntryView`, `MemberCompView` (a comp + the viewer's own entries + derived dates), `OfficerCompView` (a comp + all entries + `podTotal` + per-member breakdown), `BannerItem`.
- `listActiveCompetitions(now?, deps?)` / `listPastCompetitions(now?, deps?)` — split on `isPast`.
- `listMemberComps(memberId, now?, deps?)` → active comps each with the viewer's own entries + derived advisory dates (for the member dashboard).
- `listOfficerComps(now?, deps?)` → active comps each with all entries (member names batch-looked-up), `podTotal`, and per-member breakdown (entries, how many club-ship, registered/not).
- `addCompetition`, `editCompetition`, `deleteCompetition` (state-change cores; permission enforced in the action layer).
- `addEntry`, `editEntry`, `deleteEntry`.
- `computeBannerItems(memberId, isBoard, now, deps?)` → the live banner list: the member's own entries with an approaching `commit/deliver/ship` date, plus (if `isBoard`) club-wide logistics flags (comp shipping soon + its pod total). Pure/derived — no persistence.

**Server actions — `src/app/members/_actions/competition-actions.ts`** (`'use server'`, mirrors `lending-actions.ts`):
- `addCompetitionAction(input)` — `requireMember()`; validates required fields; `addCompetition(..., addedById=memberId)`; revalidate.
- `editCompetitionAction(id, patch)` — `requireMember()`; allowed only if actor is the comp's `addedById` **or** `isBoard`; else reject. Revalidate.
- `deleteCompetitionAction(id)` — `requireBoard()`; delete (cascades entries); revalidate.
- `addEntryAction(compId, input)` / `editEntryAction(entryId, patch)` / `deleteEntryAction(entryId)` — `requireMember()`; a member may only mutate an entry whose `memberId` is their own (officers may also mutate any entry — decide during plan; default: owner-only for entries, since officers rarely edit someone's beer). Revalidate.
- All return the `{ ok: true } | { ok: false, reason }` shape used elsewhere.

**Pages / components:**
- `src/app/members/competitions/page.tsx` (server) — auth-gate (logged-in member); renders the member dashboard (active comps + own entries + add-comp button + past-comps toggle). If `isBoard`, also renders the officer club-wide section.
- `src/components/members/CompetitionCard.tsx` (client) — one comp: details + Maps links + the member's entries with add/edit/delete-entry controls (channel select, registered checkbox, beer name/style); adder/officer edit-comp + officer delete-comp controls; advisory dates when the member has a `club_ship` entry.
- `src/components/members/AddCompetitionForm.tsx` (client) — the add-comp form (required-field validation).
- `src/components/members/OfficerCompetitions.tsx` (client or server) — board-only club-wide table: per comp, pod total + per-member breakdown + all entries.
- `src/components/members/CompBanner.tsx` — rendered at the top of `/members`; takes `computeBannerItems` output; shows member items + officer flags. Dismissible-per-session is optional (nice-to-have, not required).
- Nav: add a **Competitions** link/card to `SiteHeader` + `FeatureNav` (like Library/Equipment; visible to all logged-in members).

## UI / display

- **Member dashboard** (`/members/competitions`): active comps sorted by nearest actionable deadline. Each card: name → homepageUrl, registration deadline, shipping deadline, bottles-required, Maps link(s), and the member's own entries (beer name · style · channel · registered) with add/edit/delete. A comp the member has a `club_ship` entry in shows advisory "commit by / deliver by" dates. "Add competition" button (any member). "Past competitions" toggle reveals archived (past-shippingDeadline) comps read-mostly.
- **Officer section** (board only, same page): per active comp, **pod total** (`Σ club_ship entries × bottlesRequired`) prominently, plus a per-member breakdown (member name, # entries, # club-ship, # registered) and the full entry list (beer name + style + owner + channel + registered). No redaction.
- **Hub banner** (`/members`): live-computed. Member sees their own approaching items ("Comp X ships in 5 days — your 2 club-ship entries: deliver by Aug 20"). Officer additionally sees club-wide flags ("Comp X ships in 5 days — 12 club-ship entries, ~36 bottles"). Empty → no banner.
- Visual tokens consistent with the hub (`rounded-2xl border border-border/50 bg-card-bg/30`, accent `#ff9500`, red for overdue/urgent). Dates as `toISOString().slice(0,10)`.

## Error handling & edge cases

- **Required-field validation on add-comp** (name, URL, both deadlines, bottlesRequired ≥ 1, shipping address) — reject with a clear message; drop-off address optional.
- **Registration deadline after shipping deadline** (data-entry slip) → warn but allow (some comps genuinely have odd ordering); do not hard-block.
- **Non-adder non-officer editing a comp** → action rejects (`forbidden`); UI hides the control. Server is the gate.
- **Non-officer deleting a comp** → rejected (`requireBoard`).
- **Member mutating another member's entry** → rejected (owner check on entries).
- **Entry whose `memberId` has no Member row** (deactivated member) → in the officer view, shown as "Unknown member," never dropped/crashing (lending convention).
- **Deleting a comp** cascades its entries (`onDelete: Cascade`); officer-only; irreversible — confirm dialog in the UI.
- **Past comp** → excluded from active lists + banner; still editable by adder/officer if needed (e.g. fixing a record) via the archive.
- **Banner with no urgent items** → renders nothing (no empty box).

## Testing (TDD)

Framework-free `competitions.ts` logic is the tested core (like `lending.ts`), with DI'd-fake db + fixed `now`:
- `isPast` / `commitByDate` / `deliverByDate` boundaries (exactly at the 7-day mark, just over, just under).
- `podTotal`: only `club_ship` entries counted, × `bottlesRequired`; `self_ship`/`dropoff` excluded; zero when none.
- `listMemberComps`: returns only the viewer's own entries per comp; active-only; advisory dates present when a `club_ship` entry exists.
- `listOfficerComps`: all entries; per-member breakdown correct; unknown-member entry kept labeled.
- `computeBannerItems`: member gets only their own approaching items; officer additionally gets club-wide flags; nothing when no deadlines are near; boundary at the "approaching" window.
- Permission cores/actions: edit-comp allowed for adder or board, rejected otherwise; delete-comp board-only; entry mutation owner-only; add-comp required-field validation.
- **Verification bar:** `tsc --noEmit` clean, `vitest run` green, `npm run build` compiles with `/members/competitions` present as a dynamic route; `prisma db push` applies the two additive models (verified at deploy).

## Success criteria

- Any logged-in member can add an external comp with its key data, and add/edit/delete their own beer entries (name, style, channel, registered).
- A member sees a single dashboard of their active comps with deadlines, Maps links, and advisory club-ship dates; past comps archive automatically.
- An officer sees, per active comp, the total bottles to ship via the club (entries × bottles-required) and a per-member breakdown — enough to buy the right number of containers and know who still owes a drop-off.
- A logged-in member sees a live top-of-hub banner of their own approaching deadlines; officers additionally see club-wide logistics flags. No cron/email/push.
- Beer entries are visible to their owner and to officers (full detail); not to other members. Comp records are editable by their adder or officers, deletable by officers.
- Everything is additive: two new models, no change to existing lending/auth/dashboard; the Discord calendar is unaffected.

## Build phasing (for the plan)

Suggest the implementation plan build in this order so each phase is independently shippable:
1. **Data model + `competitions.ts` logic + actions** (schema, pure functions, permission-gated actions, all unit-tested) — no UI.
2. **Member dashboard** (`/members/competitions`: list, add comp, add/edit/delete own entries, past-comps toggle) + nav links.
3. **Officer section** (club-wide table, pod totals, per-member breakdown).
4. **Hub banner** (live-computed on `/members`).
