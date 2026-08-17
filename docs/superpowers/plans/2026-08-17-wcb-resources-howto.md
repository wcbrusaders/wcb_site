# WCB Member Resources (How-To Guide) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a member "Resources" area with two lanes — a curated, code-verified how-to Guide (Lane 1, built now) and a Knowledge lane that surfaces the existing Google Drive folder links (Lane 2, "on-site articles coming soon") — reachable via a nav link and a dashboard "Start here" card.

**Architecture:** All static React server components under `src/app/members/resources/`. No DB, no server actions, no client state → cannot hit the DB-flapping failure mode, fully cacheable. Content is hand-authored from code-verified facts (see the superseded guide spec). The Knowledge lane reuses the homepage taplist's Drive link data. Deferred: the knowledge-import + AI-rework pipeline (designed separately, its own future project).

**Tech Stack:** Next.js 16 App Router (server components), Tailwind v4, existing `auth()` gate pattern, existing `NavIcon` component.

## Global Constraints

- **Members-area only:** every page lives under `/members/resources/*` and is rendered inside `src/app/members/layout.tsx` (which already provides `SiteHeader` + the suspension gate). Do NOT add another header. See the layout's existing auth handling; pages themselves do not need to re-gate unless they read the session.
- **Content = code-verified facts only.** Use the ground-truth content in `docs/superpowers/specs/2026-08-17-wcb-member-guide-design.md` (Lane 1 section) verbatim as the source. The ONLY placeholders permitted are `GUIDE_TODO` callouts for genuinely-external facts: dues amount, meeting cadence, roster-tier meaning. Invent nothing else.
- **Do NOT tell members to run `/welcome`** (dead bot command). Bot member commands that ARE real: `/link`, `/grainbuy`, `/dashboard`, `/help`, `/catchup`.
- **Destination tags:** each how-to page carries a small tag indicating where the task happens — 🌐 site / 💬 Discord / 🎓 Academy.
- **Nav:** add ONE non-board link labeled "Resources" with a NEW `'help'` icon (distinct from `'book'`, used by "Books"), placed last among non-board links. Result: Hub, Competitions, Equipment, Books, Resources (5 non-board tabs — under the prior overflow threshold).
- **Knowledge lane Drive links** must match the homepage taplist source values (single source of truth — see Task 5 for the exact folder IDs/titles copied from `src/app/page.tsx`).
- **Styling:** match the existing members-area card/section idiom (rounded-2xl borders, `bg-card-bg/30`, `text-accent`, etc. as used in `CompetitionCard`/`FeatureNav`).
- No new dependencies.

---

### Task 1: Add the `help` nav icon + Resources nav link

**Files:**
- Modify: `src/lib/nav.ts`
- Modify: `src/components/NavIcons.tsx`

**Interfaces:**
- Consumes: existing `IconName` union, `MEMBER_LINKS`, `NavIcon` PATHS map.
- Produces: `'help'` as a valid `IconName`; a Resources link in `MEMBER_LINKS`.

- [ ] **Step 1: Extend the IconName union + add the Resources link**

In `src/lib/nav.ts`, change the `IconName` type and add the link (placed after Books, before the board-only Holdings/Admin):

```ts
export type IconName = 'home' | 'trophy' | 'wrench' | 'book' | 'shield' | 'help'
```
```ts
// ...inside MEMBER_LINKS, after the Books line, before the board:true links:
  { href: '/members/library', label: 'Books', icon: 'book' },
  { href: '/members/resources', label: 'Resources', icon: 'help' },
  { href: '/members/holdings', label: 'Holdings', icon: 'shield', board: true },
```

- [ ] **Step 2: Add the `help` icon path (TS forces this — PATHS is Record<IconName,…>)**

In `src/components/NavIcons.tsx`, add to `PATHS`:

```tsx
  help: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM9.5 9.5a2.5 2.5 0 0 1 4.6 1.3c0 1.7-2.1 2-2.1 3.4M12 17h.01" />,
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: passes (if the `help` path were missing, the `Record<IconName, …>` would error — proving the icon is wired).

- [ ] **Step 4: Commit**

```bash
git add src/lib/nav.ts src/components/NavIcons.tsx
git commit -m "feat(resources): add Resources nav link + help icon"
```

---

### Task 2: Shared guide UI primitives

Small presentational components so every how-to page is consistent and the pages stay lean.

**Files:**
- Create: `src/components/members/guide/GuideChrome.tsx`

**Interfaces:**
- Produces:
  - `DestTag({ kind }: { kind: 'site' | 'discord' | 'academy' })` — renders a small pill: 🌐 On the site / 💬 In Discord / 🎓 Academy.
  - `GuidePage({ title, dest, children })` — page wrapper: back-to-Resources link, H1, optional `DestTag`, prose container.
  - `GuideTodo({ children })` — a visually distinct "Check with the board" callout for external facts.

- [ ] **Step 1: Implement the primitives**

```tsx
// src/components/members/guide/GuideChrome.tsx
import Link from 'next/link'
import type { ReactNode } from 'react'

const DEST = {
  site: { icon: '🌐', label: 'On the site' },
  discord: { icon: '💬', label: 'In Discord' },
  academy: { icon: '🎓', label: 'Brusaders Academy' },
} as const

export function DestTag({ kind }: { kind: keyof typeof DEST }) {
  const d = DEST[kind]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs text-foreground/70">
      <span aria-hidden>{d.icon}</span> {d.label}
    </span>
  )
}

export function GuideTodo({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 rounded-xl border border-amber-400/40 bg-amber-400/[0.06] p-3.5 text-sm">
      <span className="font-semibold text-amber-300">Check with the board:</span> {children}
    </div>
  )
}

export function GuidePage({ title, dest, children }: { title: string; dest?: keyof typeof DEST; children: ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <Link href="/members/resources" className="text-sm text-foreground/50 hover:text-accent">← Resources</Link>
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold">{title}</h1>
        {dest && <DestTag kind={dest} />}
      </div>
      <div className="prose prose-invert max-w-none mt-6 prose-headings:font-semibold prose-a:text-accent">
        {children}
      </div>
    </div>
  )
}
```

Note: if `prose`/typography classes are not configured in this project, style headings/lists/paragraphs with equivalent utility classes instead (check `src/app/globals.css` / tailwind config first). The requirement is clean readable output; the mechanism is flexible.

- [ ] **Step 2: Verify typecheck + build compile**

Run: `npx tsc --noEmit`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/members/guide/GuideChrome.tsx
git commit -m "feat(resources): shared guide UI primitives (GuidePage, DestTag, GuideTodo)"
```

---

### Task 3: The seven how-to pages

Each is a static server component using `GuidePage`. Content comes verbatim from the ground-truth spec's Lane 1 section. Keep copy tight and skimmable.

**Files:**
- Create: `src/app/members/resources/getting-started/page.tsx`
- Create: `src/app/members/resources/borrow-gear/page.tsx`
- Create: `src/app/members/resources/enter-competition/page.tsx`
- Create: `src/app/members/resources/grain-buys/page.tsx`
- Create: `src/app/members/resources/brewing-help/page.tsx`
- Create: `src/app/members/resources/learn/page.tsx`
- Create: `src/app/members/resources/the-club/page.tsx`

**Interfaces:**
- Consumes: `GuidePage`, `GuideTodo` from Task 2.

- [ ] **Step 1: Write each page from the ground-truth content**

Pattern for every page (example — `borrow-gear`):

```tsx
// src/app/members/resources/borrow-gear/page.tsx
import { GuidePage } from '@/components/members/guide/GuideChrome'
export default function Page() {
  return (
    <GuidePage title="Borrow gear & books" dest="site">
      <p>The club lends equipment and books to members. Two catalogs:
        {' '}<a href="/members/equipment">Equipment</a> and <a href="/members/library">Books</a>.</p>
      <h2>Checking out</h2>
      <p>Open a title and click <strong>Check out</strong> when a copy is available and you don’t
        already hold that title. For equipment, pick the item’s condition on the way out. An officer
        is notified so you can arrange handoff — pickup is coordinated directly, not through the site.</p>
      <h2>How long you keep it</h2>
      <ul>
        <li><strong>Books:</strong> 30 days. <strong>Equipment:</strong> 14 days.</li>
        <li><strong>Renew</strong> up to <strong>2 times</strong> (each renewal adds another full period).</li>
        <li>Return any time; equipment asks what condition it’s coming back in.</li>
        <li>One copy per title at a time. No limit on how many different titles you hold. No fines.</li>
      </ul>
      <h2>Add to the library</h2>
      <p><strong>Any member</strong> can add a book or piece of equipment for others to borrow.</p>
      <p className="text-foreground/60"><em>Coming soon:</em> a member store to buy, sell, and donate gear — proceeds to the club.</p>
    </GuidePage>
  )
}
```

Author the remaining six from the ground-truth spec:
- **getting-started** (dest none/mixed): read CoC → agree → pay dues (PayPal, off-site) → get added to roster → log in (passwordless email code). Then: explore the hub, link Discord with `/link`, say hi. Do NOT mention `/welcome`.
- **enter-competition** (site): add a comp (any member), add your entries, the 3 channels (Club ships / I ship it / I drop off — only Club-ship counts toward the club pack & "club covers shipping"), deliver-by = beer-arrival − 7 days, registered flag is your own bookkeeping, officers set shipment tracking that all members can see.
- **grain-buys** (discord): runs 2–4×/yr; `/grainbuy` shows the active buy + Browse Products; order in the Google Sheet; **put `WCB - Grain Buy` in your PayPal/Venmo note**; reminders post to `#grain-buy`.
- **brewing-help** (discord): ask the bot in plain English — @mention it, DM it, in a thread, or in `#bot-help`; 10 questions/hr; no account link needed; brewing science/ingredients/recipes/ABV calc/Brulosophy; can attach a beer photo.
- **learn** (academy): the Brusaders Academy at `academy.wcbrusaders.com` — "level up through quests, challenges, badges"; 5 tiers Foundations→Expert, 3 paths (Technical/Creative/Competitive), BJCP flashcards; sign in with Google (separate login); honest note: if it says you’re not authorized while your membership is current, contact the board.
- **the-club**: membership shows on the hub (read-only, roster-synced; ask the board to change details). `GuideTodo` for dues amount, meeting cadence, and roster-tier meaning. Link `/board` and `/code-of-conduct`; summarize reporting (Ombudsman/any board member) + strike ladder. List member Discord commands (`/link`, `/grainbuy`, `/dashboard`, `/help`, `/catchup`).

- [ ] **Step 2: Verify typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: all 7 routes compile as static pages; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/members/resources
git commit -m "feat(resources): seven how-to guide pages (code-verified content)"
```

---

### Task 4: Resources landing (two lanes)

**Files:**
- Create: `src/app/members/resources/page.tsx`
- Create: `src/lib/resources-links.ts` (Drive link data for the Knowledge lane)

**Interfaces:**
- Consumes: nothing dynamic (static). Produces the two-lane landing.

- [ ] **Step 1: Drive link data (Knowledge lane, matches homepage taplist)**

```ts
// src/lib/resources-links.ts
// Mirrors the homepage taplist Drive folders (src/app/page.tsx). Single source
// for the Knowledge lane's "browse in Drive" links until on-site articles ship.
export const HOWTO_PAGES = [
  { href: '/members/resources/getting-started', title: 'Getting started', desc: 'New here? Start with this.' },
  { href: '/members/resources/borrow-gear', title: 'Borrow gear & books', desc: 'Check out equipment and books.' },
  { href: '/members/resources/enter-competition', title: 'Enter a competition', desc: 'Entries, channels, club shipping.' },
  { href: '/members/resources/grain-buys', title: 'Buy grain in bulk', desc: 'How club grain buys work.' },
  { href: '/members/resources/brewing-help', title: 'Get brewing help', desc: 'Ask the club bot anything.' },
  { href: '/members/resources/learn', title: 'Learn & level up', desc: 'The Brusaders Academy.' },
  { href: '/members/resources/the-club', title: 'How the club runs', desc: 'Membership, dues, board, conduct.' },
]

export const KNOWLEDGE_DRIVE_LINKS = [
  { title: 'Brewing Knowledge', desc: 'Process, ingredients, and technique.', href: 'https://drive.google.com/drive/folders/1VPpxxr5sz-cREJiWNC7fRq46N7tewWC_' },
  { title: 'Recipe Library', desc: 'House recipes, medal winners, member brews.', href: 'https://drive.google.com/drive/folders/1b-7-hMPgU6gBNqnNmIxSNROgUILW1jwc' },
  { title: 'Workshop Guides', desc: 'Off-flavor classes, water labs, seasonal projects.', href: 'https://drive.google.com/drive/folders/1_I7Po8n9d1gBCze9xphoB5cVTZrLtBhf' },
  { title: 'Community Documents', desc: 'Bylaws, officer docs, planning files.', href: 'https://drive.google.com/drive/folders/0AH3fezsxCD4DUk9PVA' },
  { title: 'Meeting Agendas & Notes', desc: 'Decisions and follow-ups from each meetup.', href: 'https://drive.google.com/drive/folders/1Jysdr3jXicNqMgtFRuUBcmDG9_djtWqw' },
]
```

- [ ] **Step 2: Two-lane landing page**

```tsx
// src/app/members/resources/page.tsx
import Link from 'next/link'
import { HOWTO_PAGES, KNOWLEDGE_DRIVE_LINKS } from '@/lib/resources-links'

export default function ResourcesPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl md:text-3xl font-bold">Resources</h1>
      <p className="text-foreground/55 mt-1">How to do things in the club, plus our knowledge library.</p>
      <div className="grid md:grid-cols-2 gap-6 mt-6">
        {/* Lane 1 — how-to */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">How-to & Getting Started</h2>
          <ul className="mt-3 space-y-2">
            {HOWTO_PAGES.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="block rounded-xl border border-border/60 bg-card-bg/30 hover:border-accent/40 px-4 py-3">
                  <div className="font-semibold">{p.title}</div>
                  <div className="text-sm text-foreground/55">{p.desc}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        {/* Lane 2 — knowledge (Drive links for now) */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">Knowledge & Experiments</h2>
          <p className="text-xs text-foreground/45 mt-1">Searchable on-site articles are coming. For now, browse the club’s Drive folders:</p>
          <ul className="mt-3 space-y-2">
            {KNOWLEDGE_DRIVE_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noreferrer" className="block rounded-xl border border-border/60 bg-card-bg/30 hover:border-accent/40 px-4 py-3">
                  <div className="font-semibold">{l.title} <span className="text-foreground/40 font-normal text-xs">↗ Drive</span></div>
                  <div className="text-sm text-foreground/55">{l.desc}</div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit && npx next build`
Expected: `/members/resources` renders; links resolve to the 7 pages + Drive.

- [ ] **Step 4: Commit**

```bash
git add src/app/members/resources/page.tsx src/lib/resources-links.ts
git commit -m "feat(resources): two-lane Resources landing (how-to + Drive knowledge links)"
```

---

### Task 5: Dashboard "Start here" card

**Files:**
- Modify: `src/app/members/page.tsx`

**Interfaces:**
- Consumes: existing hub page structure.

- [ ] **Step 1: Add the card near the top of the hub**

Add, directly under the welcome/greeting and above (or beside) the membership cards, a prominent card:

```tsx
<Link href="/members/resources/getting-started"
  className="block rounded-2xl border border-accent/40 bg-accent/[0.06] hover:bg-accent/[0.1] p-5 md:p-6 mt-6">
  <div className="font-bold text-lg">New here? Start here →</div>
  <div className="text-sm text-foreground/60 mt-1">How to borrow gear, enter competitions, join a grain buy, use the bot, and more.</div>
</Link>
```

Confirm `import Link from 'next/link'` exists at the top of the file; add if missing.

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit && npx next build`
Expected: hub renders with the card linking to getting-started.

- [ ] **Step 3: Commit**

```bash
git add src/app/members/page.tsx
git commit -m "feat(resources): 'Start here' card on the members hub"
```

---

## Self-Review

- **Spec coverage:** Resources landing (two lanes) — Task 4; 7 how-to pages — Task 3; nav link + icon — Task 1; dashboard card — Task 5; shared primitives — Task 2; Knowledge lane = Drive links (deferred pipeline) — Task 4. All Lane-1 scope covered. ✅
- **Placeholder scan:** the ONLY placeholders are the intended `GuideTodo` callouts (dues/meetings/roster-tier) in `the-club` — every other fact is code-verified. No TBD/TODO in code.
- **Type consistency:** `IconName` gains `'help'` (Task 1) → `NavIcon` PATHS must include it (Task 1 Step 2; `Record<IconName>` enforces). `GuidePage`/`DestTag`/`GuideTodo` signatures (Task 2) consumed by Task 3. `HOWTO_PAGES`/`KNOWLEDGE_DRIVE_LINKS` (Task 4) — folder IDs copied verbatim from `src/app/page.tsx`. ✅
- **Scope:** strictly the how-to Guide + Drive-link Knowledge lane. No DB, no sync, no AI pipeline (deferred). No public homepage change.
