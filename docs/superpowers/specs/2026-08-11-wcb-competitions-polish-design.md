# WCB Competitions Page Polish — Design

**Date:** 2026-08-11
**Status:** Approved (brainstorming, visual companion) → ready for implementation plan
**Scope:** `wcb_site` — a visual polish pass on the live competitions member view. **Restyle only:** no new data, routes, queries, permissions, or logic. Turn the current inline-text card into a scannable dashboard: entries as rows with colored badges, comp meta as labeled chips with deadline urgency, a prominent "deliver to the shipper by" callout, and grouped/labeled forms.

## Problem

Competition tracking is live and functional, but the member view reads like a data dump: each beer entry is a single `beer · style · channel · registered` text line; the comp meta is a cramped `Entry reg by X · Beer arrives by Y · N bottles · maps` line; the club-ship deliver-by date (the single most important thing for members shipping through the club) is a faint grey sub-line that's easy to miss; and the add-comp / add-entry forms are stacked bare inputs. It got the logic but never a design pass.

## Key decisions (locked in brainstorming)

- **Restyle only.** Every field, query, action, permission, and the data model are unchanged. This touches presentation in `CompetitionCard.tsx`, `AddCompetitionForm.tsx`, and (only if needed for layout) `competitions/page.tsx`. No change to `competitions.ts` logic, actions, or the officer view (`OfficerCompetitions.tsx` is OUT of scope this pass).
- **Entries → rows with badges.** Each of the member's entries is a row: beer name prominent, style secondary; **channel as a colored badge** — club-ship = orange (`accent`), self-ship = blue, drop-off = grey; **registered as a badge** — registered = green, not-registered = grey. Edit(register toggle)/remove as small pill buttons on the row.
- **Comp meta → labeled chips.** Replace the `·`-joined line with chips: `Entry reg {date}`, `Beer arrives {date}`, `Bottles/entry {n}`. The **Beer arrives** chip turns red/urgent when close. Map links become small outlined buttons (`📍 Ship-to`, `📍 Drop-off`), drop-off only when present.
- **Deliver-by callout — prominent, the load-bearing element.** The existing `deliverByDate` (= beer-arrival − 7 days) currently renders as a faint grey line gated on the member having a club-ship entry. Promote it to a **callout box**: "Get your bottles to the shipper by {date} · {N} days" with a supporting sub-line ("{count} club-ship entr{y/ies} · club covers shipping"). **Always show the day-countdown.** **Turns red/urgent when the deliver-by date is ≤ 7 days away** (else accent-orange). Still gated to club-ship entries only (self-ship/drop-off don't need it). This is a display change only — `deliverByDate`/`commitByDate` already exist and are unchanged.
- **Forms → grouped + labeled.** Add-entry: beer name + style side-by-side, channel as a **segmented 3-button control** (Club ships / I ship it / I drop off) replacing the `<select>`, "already registered" checkbox, Add/Cancel pills. Add-comp: labeled fields grouped under **"The comp"** (name, URL, then entry-reg / beer-arrival / bottles in a row) and **"Where to send beer"** (shipping address required, drop-off optional). No emoji in the segmented control.
- **Tokens:** existing WCB dark theme — accent `#ff9500`, bg `#0a0a0a`, card `#1a1a1a`, inputs `#0f0f0f`, border `#333`, red `#f87171` (matches `text-red-400`), green `#4ade80`, blue `#93c5fd` for the badges. Card shell stays `rounded-2xl border border-border/50 bg-card-bg/30`.

## Out of scope

- Officer club-shipping section (`OfficerCompetitions.tsx`) — a later pass.
- Any data/query/action/permission/schema change. The `channel` union, `registered` boolean, deadlines, `deliverByDate`/`commitByDate` math, and all server actions stay exactly as shipped.
- New fields (no judging date — declined), new routes, new dependencies.
- Past-comps archive styling (leave the `<details>` list as-is unless trivially improved).

## Architecture

Purely presentational. No new files strictly required, but to keep components focused:

- `src/components/members/CompetitionCard.tsx` (MODIFY, `'use client'` — already is) — the bulk of the work: chip header, map buttons, the deliver-by callout, entry rows with badges, and the inline add-entry form's segmented control. All existing handlers (`addEntryAction`/`editEntryAction`/`deleteEntryAction`/`deleteCompetitionAction`, `useTransition`, `run`, `draft` state) are reused verbatim — only JSX/className changes. The `EntryChannel` union and `CHANNELS` label list already exist here.
- `src/components/members/AddCompetitionForm.tsx` (MODIFY, `'use client'`) — regroup the existing inputs into labeled fields + the two section headers. State/validation/submit unchanged (the label + blank-bottles fix already shipped).
- **Optional small helpers (in the same files or a tiny `src/lib/comp-format.ts` if it keeps the JSX clean):** a pure `channelBadge(channel): { label, className }` and a pure `daysUntil(date, now)` / urgency helper. If extracted, unit-test them; if kept inline as trivial expressions, no test needed. The plan decides — but any extracted pure helper gets a test (see Testing).
- No change to `competitions.ts`, `competition-actions.ts`, the page's data fetching, or the officer component.

## UI / display (the target)

**Comp card:**
- Title (links to homepageUrl) at top.
- **Chip row:** `Entry reg {Mon DD}` · `Beer arrives {Mon DD}` (red when the arrival date is near) · `Bottles/entry {n}`.
- **Map buttons:** outlined accent buttons; Ship-to always, Drop-off when `dropoffAddress`.
- **Deliver-by callout** (only when the member has ≥1 club-ship entry): boxed, accent border/bg normally, red border/bg when `deliverByDate` is ≤7 days out; text "Get your bottles to the shipper by {date} · {N} days" + sub-line with the club-ship entry count. Uses the existing `comp.deliverByDate`.
- **Entries section:** "Your entries · {count}"; each entry a row — beer name (bold) + style (muted) on the left with a badge pair below (channel badge + registered badge), edit/remove pills on the right. "Add entry" opens the inline form.
- Board delete-comp button stays (top-right), unchanged behavior.

**Forms:** as described in Key Decisions — labeled, grouped, segmented channel control.

## Error handling & edge cases

- **No entries yet** → the entries section shows just the "Add entry" affordance (no empty row).
- **Deliver-by callout** → hidden entirely when the member has no club-ship entry (unchanged gating); shown for ≥1. Red styling strictly when `daysUntil(deliverByDate) <= 7` (including 0 / today; if already past, still show — it's a member's own reminder, and the comp only appears while active anyway). Day-count text uses the same rounding as the banner (`Math.ceil`).
- **Badge for an unknown/legacy channel value** → fall back to the grey/neutral badge style (never crash on an unexpected string).
- **Segmented control** → the selected channel gets the accent style; keyboard/tap accessible (real `<button>`s, not divs). Preserves the exact three `EntryChannel` values.
- **Long beer names / styles** → wrap gracefully (flex-wrap), no overflow.
- **Client/server boundary** → both files are already `'use client'`; this pass adds no server import. No boundary risk (purely JSX/CSS + reuse of existing action-by-reference calls).

## Testing

Restyle → mostly build/inspection, but any extracted pure helper is unit-tested:
- **If `channelBadge(channel)` is extracted:** test each of the 3 channels maps to its expected label + variant, and an unknown value → neutral fallback.
- **If `daysUntil`/urgency is extracted:** test the ≤7 boundary (7 → urgent, 8 → not), today (0 → urgent), and that the count matches `Math.ceil` day math.
- **Existing `competitions.test.ts` stays green** (logic untouched) — 11 tests.
- **Verification bar:** `tsc --noEmit` clean; `vitest run` green (existing 99 + any new helper tests); `npm run build` compiles with `/members/competitions` still a `ƒ` route; `eslint` no new errors.
- **Manual (post-deploy):** a comp with mixed-channel entries shows the right badge colors; registered vs not shows green vs grey; the deliver-by callout appears only with a club-ship entry, shows the countdown, and is red when ≤7 days; the add-entry segmented control picks the channel and submits; add-comp groups render; officer view + past-comps unchanged.

## Success criteria

- The competitions card reads as a dashboard, not a text line: entries are rows with clear channel + registration **badges**, meta is **labeled chips** with the beer-arrival date flagged when near.
- The **"get your bottles to the shipper by {date} · {N} days"** callout is prominent and impossible to miss for club-ship members, and turns red at ≤7 days.
- The add-entry and add-comp forms are grouped and labeled, with the channel picked via a segmented control.
- Zero behavior change: same fields, same validation, same actions, same permissions, same data; officer view and past-comps untouched; no migration, no env, no dependency.
