# WCB Competitions Page Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the live competitions member view into a scannable dashboard — entry rows with colored badges, labeled meta chips, a prominent "deliver to shipper by" callout, and grouped/labeled forms — with zero behavior change.

**Architecture:** Extract two tiny pure formatting helpers to a unit-tested `src/lib/comp-format.ts`, then restyle `CompetitionCard.tsx` and `AddCompetitionForm.tsx` (both already `'use client'`) reusing every existing handler/state/action verbatim — only JSX + classNames change.

**Tech Stack:** Next.js 16 App Router (client components), React 19, TypeScript, Tailwind v4 (existing CSS-var tokens), Vitest.

## Global Constraints

- **RESTYLE ONLY.** No change to data, queries, server actions, permissions, the `channel` union, `registered`, deadlines, or `deliverByDate`/`commitByDate` math. No new route, dependency, env, or migration.
- **Officer view (`OfficerCompetitions.tsx`) and past-comps `<details>` are OUT of scope** — do not touch them.
- Reuse ALL existing handlers/state in the two files verbatim: `CompetitionCard` has `run`, `pending`, `err`, `adding`/`setAdding`, `draft`/`setDraft`, `canEditComp`, `hasClubShip`, `CHANNELS`, `iso`, and calls `addEntryAction`/`editEntryAction`/`deleteEntryAction`/`deleteCompetitionAction`. `AddCompetitionForm` has `f`/`set`/`EMPTY`/`open`/`pending`/`err` and calls `addCompetitionAction`. Only JSX/className changes.
- Both files stay `'use client'`; add NO server import (no `@/lib/auth`, no prisma). `comp-format.ts` is framework-free (no react/next import) so it's safe in either.
- Deliver-by callout is **display-only**, gated to `hasClubShip` (member has ≥1 `club_ship` entry), uses the existing `comp.deliverByDate`. Always shows the day-countdown; **red/urgent when `deliverByDate` is ≤ 7 days away** (including today/0), accent-orange otherwise.
- Tokens: accent `#ff9500` (`text-accent`/`border-accent`/`bg-accent`), bg `#0a0a0a` (`bg-background`), card `#1a1a1a` (`bg-card-bg`), inputs `bg-background/60`, border `#333` (`border-border`), red `text-red-400` (`#f87171`), green `#4ade80`, blue `#93c5fd`. Card shell stays `rounded-2xl border border-border/50 bg-card-bg/30 p-6 md:p-8`.
- Dates rendered via the existing `iso(d)` = `new Date(d).toISOString().slice(0,10)`.

---

## File Structure

- `src/lib/comp-format.ts` (CREATE) — pure helpers: `channelBadge(channel)`, `daysUntil(date, now?)`, `isUrgent(date, now?)`. Framework-free, unit-tested.
- `src/lib/comp-format.test.ts` (CREATE) — tests for the helpers.
- `src/components/members/CompetitionCard.tsx` (MODIFY) — chips, map buttons, deliver-by callout, entry rows with badges, segmented channel control. Handlers/state unchanged.
- `src/components/members/AddCompetitionForm.tsx` (MODIFY) — grouped/labeled fields. State/validation/submit unchanged.

---

### Task 1: `comp-format.ts` — pure format helpers (tested)

**Files:**
- Create: `src/lib/comp-format.ts`
- Test: `src/lib/comp-format.test.ts`

**Interfaces:**
- Consumes: `type EntryChannel` from `@/lib/competitions`.
- Produces:
  ```ts
  export type BadgeVariant = 'club' | 'self' | 'drop' | 'reg' | 'unreg' | 'neutral'
  export function channelBadge(channel: string): { label: string; variant: BadgeVariant }
  export function daysUntil(date: Date, now?: Date): number   // Math.ceil((date - now)/day)
  export function isUrgent(date: Date, now?: Date): boolean    // daysUntil <= 7
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/comp-format.test.ts`:

```ts
import { test, expect } from 'vitest'
import { channelBadge, daysUntil, isUrgent } from './comp-format'

test('channelBadge maps each channel to label + variant', () => {
  expect(channelBadge('club_ship')).toEqual({ label: 'Club ships', variant: 'club' })
  expect(channelBadge('self_ship')).toEqual({ label: 'I ship it', variant: 'self' })
  expect(channelBadge('dropoff')).toEqual({ label: 'Drop-off', variant: 'drop' })
})

test('channelBadge falls back to neutral for an unknown channel (never throws)', () => {
  expect(channelBadge('mystery')).toEqual({ label: 'mystery', variant: 'neutral' })
  expect(channelBadge('')).toEqual({ label: '', variant: 'neutral' })
})

const NOW = new Date('2026-09-01T00:00:00Z')
const plus = (d: number) => new Date(NOW.getTime() + d * 86400000)

test('daysUntil uses ceil day math (matches the banner)', () => {
  expect(daysUntil(plus(7), NOW)).toBe(7)
  expect(daysUntil(plus(0), NOW)).toBe(0)
  expect(daysUntil(new Date(NOW.getTime() + 0.5 * 86400000), NOW)).toBe(1) // half a day -> ceil to 1
})

test('isUrgent: <=7 days is urgent (7 yes, 8 no, today yes)', () => {
  expect(isUrgent(plus(7), NOW)).toBe(true)
  expect(isUrgent(plus(8), NOW)).toBe(false)
  expect(isUrgent(plus(0), NOW)).toBe(true)     // today
  expect(isUrgent(plus(-1), NOW)).toBe(true)    // already past -> still urgent (member reminder)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/comp-format.test.ts`
Expected: FAIL — `./comp-format` not found.

- [ ] **Step 3: Implement `src/lib/comp-format.ts`**

```ts
import type { EntryChannel } from '@/lib/competitions'

export type BadgeVariant = 'club' | 'self' | 'drop' | 'reg' | 'unreg' | 'neutral'

const CHANNEL_BADGES: Record<EntryChannel, { label: string; variant: BadgeVariant }> = {
  club_ship: { label: 'Club ships', variant: 'club' },
  self_ship: { label: 'I ship it', variant: 'self' },
  dropoff: { label: 'Drop-off', variant: 'drop' },
}

// Never throws on an unexpected stored value — falls back to a neutral badge
// showing the raw string.
export function channelBadge(channel: string): { label: string; variant: BadgeVariant } {
  return CHANNEL_BADGES[channel as EntryChannel] ?? { label: channel, variant: 'neutral' }
}

const DAY = 86400000
export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / DAY)
}
export function isUrgent(date: Date, now: Date = new Date()): boolean {
  return daysUntil(date, now) <= 7
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/comp-format.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/comp-format.ts src/lib/comp-format.test.ts
git commit -m "feat(competitions): pure format helpers (channel badge, day-countdown, urgency)"
```

---

### Task 2: Restyle `CompetitionCard.tsx`

**Files:**
- Modify: `src/components/members/CompetitionCard.tsx`

**Interfaces:**
- Consumes: `channelBadge`, `daysUntil`, `isUrgent` from `@/lib/comp-format` (Task 1); existing `type MemberCompView, EntryChannel`, `mapsUrl` from `@/lib/competitions`; the existing actions.

- [ ] **Step 1: Add a badge-class helper + imports at the top of the component file**

Add to imports:
```tsx
import { channelBadge, daysUntil, isUrgent, type BadgeVariant } from '@/lib/comp-format'
```
Add a small local class map (module scope, above the component) — this is a presentational constant, not logic:
```tsx
const BADGE_CLASS: Record<BadgeVariant, string> = {
  club: 'bg-accent/15 text-accent border border-accent/30',
  self: 'bg-[#93c5fd]/12 text-[#93c5fd] border border-[#93c5fd]/30',
  drop: 'bg-white/[0.06] text-foreground/70 border border-border',
  reg: 'bg-[#4ade80]/12 text-[#4ade80] border border-[#4ade80]/30',
  unreg: 'bg-white/[0.04] text-foreground/50 border border-border',
  neutral: 'bg-white/[0.06] text-foreground/60 border border-border',
}
const SEG_CHANNELS: { v: EntryChannel; label: string }[] = [
  { v: 'club_ship', label: 'Club ships' }, { v: 'self_ship', label: 'I ship it' }, { v: 'dropoff', label: 'I drop off' },
]
```

- [ ] **Step 2: Replace the header/meta block with chips + map buttons + deliver-by callout**

Replace the current header block (the `<a>` title, the two `<p className="text-foreground/50 ...">` meta lines, the maps `<p>`, and the `hasClubShip` grey line — lines ~24–33 in the current file) with:

```tsx
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <a href={comp.homepageUrl} target="_blank" rel="noreferrer" className="text-lg font-bold hover:text-accent">{comp.name}</a>
          <div className="flex gap-2 flex-wrap mt-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 py-1 text-xs">
              <span className="text-foreground/45 uppercase text-[10px] tracking-wide">Entry reg</span>
              <span className="font-semibold">{iso(comp.registrationDeadline)}</span>
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${isUrgent(comp.shippingDeadline) ? 'border-red-400/50' : 'border-border'} bg-background/60`}>
              <span className="text-foreground/45 uppercase text-[10px] tracking-wide">Beer arrives</span>
              <span className={`font-semibold ${isUrgent(comp.shippingDeadline) ? 'text-red-400' : ''}`}>{iso(comp.shippingDeadline)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 py-1 text-xs">
              <span className="text-foreground/45 uppercase text-[10px] tracking-wide">Bottles/entry</span>
              <span className="font-semibold">{comp.bottlesRequired}</span>
            </span>
          </div>
          <div className="flex gap-2 mt-2">
            <a href={mapsUrl(comp.shippingAddress)} target="_blank" rel="noreferrer" className="rounded-lg border border-accent/30 text-accent hover:bg-accent/10 px-2.5 py-1 text-xs">📍 Ship-to</a>
            {comp.dropoffAddress && <a href={mapsUrl(comp.dropoffAddress)} target="_blank" rel="noreferrer" className="rounded-lg border border-accent/30 text-accent hover:bg-accent/10 px-2.5 py-1 text-xs">📍 Drop-off</a>}
          </div>
        </div>
        {canEditComp && viewerIsBoard && (
          <button disabled={pending} onClick={() => { if (confirm(`Delete "${comp.name}" and all its entries?`)) run(() => deleteCompetitionAction(comp.id)) }}
            className="border border-red-500/40 text-red-400 px-3 py-1 rounded-full text-xs shrink-0">Delete comp</button>
        )}
      </div>

      {hasClubShip && (() => {
        const clubCount = comp.myEntries.filter((e) => e.channel === 'club_ship').length
        const urgent = isUrgent(comp.deliverByDate)
        const days = daysUntil(comp.deliverByDate)
        return (
          <div className={`mt-4 flex items-center gap-3 rounded-xl border p-3.5 ${urgent ? 'border-red-400/55 bg-red-400/[0.08]' : 'border-accent/45 bg-accent/[0.08]'}`}>
            <span className="text-xl">{urgent ? '⏰' : '📦'}</span>
            <div>
              <div className="font-bold text-sm">Get your bottles to the shipper by{' '}
                <span className={urgent ? 'text-red-400' : 'text-accent'}>{iso(comp.deliverByDate)} · {days} day{days === 1 ? '' : 's'}</span>
              </div>
              <div className="text-xs text-foreground/55">{clubCount} club-ship entr{clubCount === 1 ? 'y' : 'ies'} · club covers shipping for this comp</div>
            </div>
          </div>
        )
      })()}
```

- [ ] **Step 3: Replace the entries `<ul>` with badge rows**

Replace the current entries `<ul className="space-y-2">…</ul>` (the `<li>` with the `·`-joined `<span>`) with:

```tsx
        <ul className="space-y-2">
          {comp.myEntries.map((e) => {
            const cb = channelBadge(e.channel)
            return (
              <li key={e.id} className="rounded-xl border border-border/60 bg-background/40 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-semibold">{e.beerName} <span className="text-foreground/50 font-normal text-sm">· {e.style}</span></div>
                  <div className="flex gap-1.5 mt-1.5">
                    <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${BADGE_CLASS[cb.variant]}`}>{cb.label}</span>
                    <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${e.registered ? BADGE_CLASS.reg : BADGE_CLASS.unreg}`}>{e.registered ? 'Registered' : 'Not registered'}</span>
                  </div>
                </div>
                <span className="flex gap-2 shrink-0">
                  <button disabled={pending} onClick={() => run(() => editEntryAction(e.id, { registered: !e.registered }))} className="border border-border px-2.5 py-0.5 rounded-full text-xs">{e.registered ? 'Unregister' : 'Register'}</button>
                  <button disabled={pending} onClick={() => run(() => deleteEntryAction(e.id))} className="border border-red-500/40 text-red-400 px-2.5 py-0.5 rounded-full text-xs">Remove</button>
                </span>
              </li>
            )
          })}
        </ul>
```

(The section heading becomes `Your entries · {comp.myEntries.length}`: change the existing `<p className="text-sm font-medium mb-2">Your entries</p>` to include the count.)

- [ ] **Step 4: Replace the add-entry `<select>` with a segmented control**

In the `adding` block, replace the `<select value={draft.channel} …>…</select>` with segmented buttons (keeps `draft.channel` / `setDraft` exactly):

```tsx
            <div>
              <p className="text-[11px] uppercase tracking-wide text-foreground/45 mb-1.5">How it gets there</p>
              <div className="flex gap-1.5">
                {SEG_CHANNELS.map((c) => (
                  <button key={c.v} type="button" onClick={() => setDraft({ ...draft, channel: c.v })}
                    className={`flex-1 rounded-lg border px-2 py-2 text-xs ${draft.channel === c.v ? 'border-accent text-accent bg-accent/10' : 'border-border text-foreground/60 bg-background/60'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
```

Leave the beer-name/style inputs, the "Already registered" checkbox, and the Add/Cancel buttons as they are (optionally put beer-name + style in a `grid grid-cols-2 gap-2` — cosmetic, allowed). Keep `CHANNELS` if still referenced elsewhere; if the `<select>` was its only use, `SEG_CHANNELS` replaces it (remove the now-unused `CHANNELS` const to avoid an eslint unused warning — verify with grep first).

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`  → clean
Run: `npm run build`  → compiles; `/members/competitions` is a `ƒ` route
Run: `npx eslint src/components/members/CompetitionCard.tsx`  → no new errors (remove any now-unused const it flags)

- [ ] **Step 6: Commit**

```bash
git add src/components/members/CompetitionCard.tsx
git commit -m "feat(competitions): restyle comp card (chips, badges, prominent deliver-by callout)"
```

---

### Task 3: Restyle `AddCompetitionForm.tsx`

**Files:**
- Modify: `src/components/members/AddCompetitionForm.tsx`

- [ ] **Step 1: Regroup the form body** (state/validation/submit UNCHANGED — only the JSX between the `<form …>` open tag and the button row)

Replace the six bare `<input>`/`<label>` lines (current lines ~34–42) with labeled, grouped fields. Keep the exact `value`/`onChange={set(...)}`/`required`/`type` on each input:

```tsx
      <p className="text-[11px] uppercase tracking-wide text-foreground/40 mb-1">The comp</p>
      <div>
        <label className="block text-xs text-foreground/50 mb-1">Name</label>
        <input required placeholder="SHA Open 2026" value={f.name} onChange={set('name')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-foreground/50 mb-1">Homepage URL</label>
        <input required placeholder="https://…" value={f.homepageUrl} onChange={set('homepageUrl')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-foreground/50 mb-1">Entry reg <span className="text-foreground/35">by</span></label>
          <input required type="date" value={f.registrationDeadline} onChange={set('registrationDeadline')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-foreground/50 mb-1">Beer arrival <span className="text-foreground/35">by</span></label>
          <input required type="date" value={f.shippingDeadline} onChange={set('shippingDeadline')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-foreground/50 mb-1">Bottles/entry</label>
          <input required type="number" min={1} placeholder="2 or 3" value={f.bottlesRequired} onChange={set('bottlesRequired')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
        </div>
      </div>
      <p className="text-[11px] uppercase tracking-wide text-foreground/40 mb-1 mt-2">Where to send beer</p>
      <div>
        <label className="block text-xs text-foreground/50 mb-1">Shipping address</label>
        <input required placeholder="Required" value={f.shippingAddress} onChange={set('shippingAddress')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-foreground/50 mb-1">Drop-off address <span className="text-foreground/35">optional</span></label>
        <input placeholder="e.g. Holly Springs" value={f.dropoffAddress} onChange={set('dropoffAddress')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
      </div>
```

Leave the `{err && …}` line and the Add/Cancel `<div className="flex gap-2">` button row exactly as they are. The `<form className="… space-y-3">` wrapper stays (the `space-y-3` gives vertical rhythm to these grouped blocks).

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`  → clean
Run: `npm run build`  → compiles; `/members/competitions` `ƒ`
Run: `npx eslint src/components/members/AddCompetitionForm.tsx`  → no new errors

- [ ] **Step 3: Commit**

```bash
git add src/components/members/AddCompetitionForm.tsx
git commit -m "feat(competitions): restyle add-competition form (grouped, labeled fields)"
```

---

## Final verification (after all tasks)

- `npx tsc --noEmit` clean
- `npx vitest run` green (existing 99 + 4 comp-format = 103)
- `npm run build` compiles; `/members/competitions` is a dynamic `ƒ` route
- `npx eslint src/lib/comp-format.ts src/components/members/CompetitionCard.tsx src/components/members/AddCompetitionForm.tsx` — no new errors
- **Behavior-unchanged check:** the diff touches only JSX/classNames + the new pure helpers; NO change to `competitions.ts`, `competition-actions.ts`, `OfficerCompetitions.tsx`, the page's data fetching, the `channel`/`registered`/deadline handling, or any action call. Same validation, same submit, same permissions.
- **Manual (post-deploy):** mixed-channel entries show correct badge colors; registered=green/not=grey; deliver-by callout appears only with a club-ship entry, shows the countdown, and is red when ≤7 days; the segmented channel control selects + submits; add-comp groups render; officer view + past-comps unchanged.

## Self-Review notes

- **Spec coverage:** badges (T2 step 3 + T1 `channelBadge`), chips + red beer-arrival (T2 step 2 + `isUrgent`), deliver-by callout red-≤7d (T2 step 2 + T1), segmented channel (T2 step 4), grouped forms (T3), tested helpers (T1). Officer view + past-comps untouched. All covered.
- **Behavior invariance:** every step says "reuse handlers/state verbatim"; the only new *code* is the pure helpers (tested). No server import added to either client file → no boundary risk.
- **Type consistency:** `BadgeVariant`/`channelBadge`/`daysUntil`/`isUrgent` used consistently T1→T2; `EntryChannel` reused from `competitions.ts`; `SEG_CHANNELS` uses the real `EntryChannel` values so `setDraft({...draft, channel: c.v})` stays type-correct.
- **eslint watch:** if replacing the `<select>` orphans the existing `CHANNELS` const in CompetitionCard, remove it (T2 step 4 notes this).
