# WCB Public Board + Code of Conduct Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two public (no-auth) pages — `/code-of-conduct` (native render of the ratified Code) and `/board` (board roster + Ombudsman DM contact) — plus homepage entry points, turning the ratified Code into a recruitment/trust surface.

**Architecture:** Two new public routes as siblings to the existing `/bot` route. `/code-of-conduct` is a static server component holding the ratified Code as structured content. `/board` is a server component that reads the member roster via the existing `roster.ts` Google client, filtering `isBoard === true` and displaying the new `role` field, with a config-stored Ombudsman Discord handle. Homepage nav (desktop + mobile) and a join-CTA trust line link to both.

**Tech Stack:** Next.js 16 App Router (server components), TypeScript, Tailwind (existing WCB dark tokens), Vitest (existing test runner), `googleapis` (existing roster client).

## Global Constraints

- Both pages are FULLY PUBLIC — no auth gate. Siblings to `/bot` (`src/app/bot/page.tsx` pattern).
- Ratified Code text is VERBATIM from `WCB-Code-of-Conduct-RATIFIED.md`. Ratified strike ladder is 3-rung: Correction → Strike 1 (Warning) → Strike 2 ("Board decides": suspension OR removal by two-thirds vote; suspended-then-reoffends = removed). No names/incidents anywhere in the Code.
- Ratification line: "Ratified August 15, 2026 by vote of the WCB Board."
- Ombudsman contact = Marcella, Discord handle `Arycella`, "DM on Discord"; fallback "or DM any board member". Handle stored in config, not hardcoded in JSX.
- `/board` derives from roster: `isBoard === true` AND a `role` value. Must degrade gracefully if the roster fetch fails (fallback UI, never a 500).
- Homepage (`src/app/page.tsx`) has its OWN header — update BOTH desktop nav AND mobile menu (prior regressions came from updating only one). Do NOT touch the members-layout SiteHeader.
- Match existing site dark theme/tokens (accent `#ff9500`, bg `#0a0a0a`, etc.). Bar: tsc + `next build` clean, vitest green, eslint clean.
- Only data-model change: add `role` to `MemberRecord` + `mapSheetRow` (roster sheet `Role` column already populated by the user).

---

### Task 1: Add `role` to the roster data model

**Files:**
- Modify: `src/lib/roster.ts` (the `MemberRecord` type + `mapSheetRow`)
- Test: `src/lib/roster.test.ts`

**Interfaces:**
- Consumes: existing `mapSheetRow(headers: string[], row: string[]): MemberRecord | null`, existing `cell(headers, row, name)` helper.
- Produces: `MemberRecord.role: string | null` (reads the sheet `Role` column).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/roster.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mapSheetRow } from './roster'

describe('mapSheetRow role', () => {
  it('maps the Role column onto MemberRecord.role', () => {
    const headers = ['Email Address', 'Name', 'Board Member', 'Role']
    const row = ['jordan@example.com', 'Jordan', 'yes', 'President']
    const rec = mapSheetRow(headers, row)
    expect(rec?.role).toBe('President')
  })

  it('sets role to null when the Role column is absent or empty', () => {
    const headers = ['Email Address', 'Name', 'Board Member']
    const row = ['a@example.com', 'A', 'no']
    const rec = mapSheetRow(headers, row)
    expect(rec?.role).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/roster.test.ts`
Expected: FAIL — `role` does not exist on `MemberRecord` (tsc error) / `rec.role` is undefined.

- [ ] **Step 3: Add `role` to the type and the mapper**

In `src/lib/roster.ts`, add to the `MemberRecord` type (after `isBoard`):

```typescript
  role: string | null
```

In `mapSheetRow`, add to the returned object (after `isBoard`):

```typescript
    role: cell(headers, row, 'Role') || null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/roster.test.ts`
Expected: PASS. Also run `npx tsc --noEmit` — expect no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/roster.ts src/lib/roster.test.ts
git commit -m "feat: add role field to roster MemberRecord"
```

---

### Task 2: Board data helper — fetch + filter board members

**Files:**
- Create: `src/lib/board.ts`
- Test: `src/lib/board.test.ts`

**Interfaces:**
- Consumes: `fetchAllRosterRows(): Promise<MemberRecord[]>` from `roster.ts`; `MemberRecord` (now with `role`).
- Produces:
  - `OMBUDSMAN = { name: 'Marcella', discord: 'Arycella' }` (exported const config).
  - `type BoardMember = { name: string; role: string }`
  - `boardFromRoster(rows: MemberRecord[]): BoardMember[]` — pure, testable: keeps rows where `isBoard && role && name`, maps to `{name, role}`, sorted by a role priority (President, Vice President, Treasurer, Secretary, Ombudsman, then others alphabetical).
  - `getBoard(): Promise<BoardMember[]>` — calls `fetchAllRosterRows()` then `boardFromRoster`; returns `[]` on fetch error (graceful).

- [ ] **Step 1: Write the failing test**

Create `src/lib/board.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { boardFromRoster, OMBUDSMAN } from './board'
import type { MemberRecord } from './roster'

function rec(p: Partial<MemberRecord>): MemberRecord {
  return {
    emailAddress: 'x@example.com', googleEmail: null, name: 'X', tier: null,
    current: true, isBoard: false, partnerEmail: null, expires: null,
    joinDate: null, paymentDate: null, referredBy: null, role: null, ...p,
  }
}

describe('boardFromRoster', () => {
  it('keeps only board members that have a role and name', () => {
    const rows = [
      rec({ name: 'Jordan', isBoard: true, role: 'President' }),
      rec({ name: 'NonBoard', isBoard: false, role: null }),
      rec({ name: 'BoardNoRole', isBoard: true, role: null }),
    ]
    const board = boardFromRoster(rows)
    expect(board.map(b => b.name)).toEqual(['Jordan'])
  })

  it('orders known officer roles first, then others alphabetically', () => {
    const rows = [
      rec({ name: 'Zoe', isBoard: true, role: 'Board Member' }),
      rec({ name: 'Val', isBoard: true, role: 'Treasurer' }),
      rec({ name: 'Jordan', isBoard: true, role: 'President' }),
    ]
    const board = boardFromRoster(rows)
    expect(board.map(b => b.role)).toEqual(['President', 'Treasurer', 'Board Member'])
  })

  it('exposes the Ombudsman Discord handle', () => {
    expect(OMBUDSMAN.discord).toBe('Arycella')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/board.test.ts`
Expected: FAIL — `./board` module not found.

- [ ] **Step 3: Implement `src/lib/board.ts`**

```typescript
import { fetchAllRosterRows, type MemberRecord } from './roster'

export const OMBUDSMAN = { name: 'Marcella', discord: 'Arycella' } as const

export type BoardMember = { name: string; role: string }

const ROLE_ORDER = ['President', 'Vice President', 'Treasurer', 'Secretary', 'Ombudsman']

export function boardFromRoster(rows: MemberRecord[]): BoardMember[] {
  const members = rows
    .filter((r): r is MemberRecord & { name: string; role: string } =>
      r.isBoard && !!r.role && !!r.name)
    .map((r) => ({ name: r.name, role: r.role }))
  return members.sort((a, b) => {
    const ai = ROLE_ORDER.indexOf(a.role), bi = ROLE_ORDER.indexOf(b.role)
    const ar = ai === -1 ? ROLE_ORDER.length : ai
    const br = bi === -1 ? ROLE_ORDER.length : bi
    if (ar !== br) return ar - br
    return a.name.localeCompare(b.name)
  })
}

export async function getBoard(): Promise<BoardMember[]> {
  try {
    return boardFromRoster(await fetchAllRosterRows())
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/board.test.ts`
Expected: PASS. Also `npx tsc --noEmit` — no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/board.ts src/lib/board.test.ts
git commit -m "feat: board roster helper (filter + order + ombudsman config)"
```

---

### Task 3: The `/board` public page

**Files:**
- Create: `src/app/board/page.tsx`

**Interfaces:**
- Consumes: `getBoard()`, `OMBUDSMAN` from `src/lib/board.ts`.
- Produces: a public route at `/board`.

- [ ] **Step 1: Implement the page**

Create `src/app/board/page.tsx` (server component). Match the `/bot` page conventions (Metadata export, Tailwind dark tokens, `Link`). Render the board list from `getBoard()`; if empty, show a graceful fallback line rather than crashing. Surface the Ombudsman DM path prominently.

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { getBoard, OMBUDSMAN } from "@/lib/board";

export const metadata: Metadata = {
  title: "The Board | Wake County Brusaders",
  description: "Meet the Wake County Brusaders board and learn how to raise a concern with our Ombudsman.",
};

export default async function BoardPage() {
  const board = await getBoard();
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="max-w-3xl mx-auto px-6 py-20">
        <Link href="/" className="text-sm text-foreground/50 hover:text-foreground">← Home</Link>
        <h1 className="text-4xl font-bold mt-6 mb-2">The Board</h1>
        <p className="text-foreground/60 mb-10">
          The people who keep Wake County Brusaders running — and accountable.
        </p>

        {board.length === 0 ? (
          <p className="text-foreground/60">Board information is temporarily unavailable. Please check back shortly.</p>
        ) : (
          <ul className="space-y-3 mb-12">
            {board.map((m) => (
              <li key={`${m.role}-${m.name}`} className="rounded-2xl border border-border/50 bg-card-bg/30 p-5">
                <p className="font-semibold">{m.name}</p>
                <p className="text-accent text-sm">{m.role}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-6">
          <h2 className="font-semibold mb-2">Have a concern?</h2>
          <p className="text-foreground/70 text-sm">
            Start with our Ombudsman, {OMBUDSMAN.name} — DM <span className="text-accent font-medium">{OMBUDSMAN.discord}</span> on
            Discord. Reports are handled in confidence. If your concern is about the Ombudsman, or you'd rather not go to them,
            you can DM any board member instead. Read our{" "}
            <Link href="/code-of-conduct" className="text-accent hover:underline">Code of Conduct</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Verify it builds + renders**

Run: `npx tsc --noEmit` (no errors), then `npx next build` (the `/board` route compiles). If a dev server is available: `npx next dev` and load `http://localhost:3000/board` — board members appear (or the graceful fallback), Ombudsman `Arycella` handle shows, link to `/code-of-conduct` present.

- [ ] **Step 3: Commit**

```bash
git add src/app/board/page.tsx
git commit -m "feat: public /board page with roster + ombudsman contact"
```

---

### Task 4: The `/code-of-conduct` public page

**Files:**
- Create: `src/app/code-of-conduct/page.tsx`

**Interfaces:**
- Produces: a public route at `/code-of-conduct`. Self-contained (no data fetch).

- [ ] **Step 1: Implement the page**

Create `src/app/code-of-conduct/page.tsx` (static server component). Render the ratified Code text VERBATIM from `WCB-Code-of-Conduct-RATIFIED.md` as structured JSX (headings, paragraphs, bullet lists, and the 3-rung violations table). Include the ratification line. Match site dark tokens. Include a "← Home" link and a link to `/board` for the Ombudsman contact.

Structure to render (headings in order, each with its ratified body text — copy verbatim from `WCB-Code-of-Conduct-RATIFIED.md`):
- H1 "Code of Conduct" + subtitle "Ratified August 15, 2026 by vote of the WCB Board"
- Our commitment · Who and where this applies · What we expect of each other (bullets) · Conduct we do not allow (bullets) · Sexual harassment · Divisive off-topic content · Retaliation · Impact, not intent · Alcohol and safety (bullets) · Reporting a problem · How we handle violations (intro + the 3-row table Correction / Strike 1 — Warning / Strike 2 — Board decides + the Who-issues / Strikes-reset / Board-fast-track / Emergency-interim / Conflicts / Records / Appeals paragraphs) · Guests and non-members · Everyone is accountable · Adoption.

Use a shared section style, e.g.:

```tsx
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Code of Conduct | Wake County Brusaders",
  description: "The Wake County Brusaders Code of Conduct — a welcoming, respectful, harassment-free brewing community.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <div className="text-foreground/75 text-[15px] leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function CodeOfConductPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <article className="max-w-3xl mx-auto px-6 py-20">
        <Link href="/" className="text-sm text-foreground/50 hover:text-foreground">← Home</Link>
        <h1 className="text-4xl font-bold mt-6">Code of Conduct</h1>
        <p className="text-foreground/50 text-sm mt-2 mb-4">Ratified August 15, 2026 by vote of the WCB Board</p>
        {/* Section components with the verbatim ratified text follow... */}
      </article>
    </main>
  );
}
```

Render the violations ladder as a real table:

```tsx
<table className="w-full text-sm border border-border/50 rounded-lg overflow-hidden">
  <thead className="bg-card-bg/50 text-left">
    <tr><th className="p-3">Step</th><th className="p-3">What it is</th><th className="p-3">What happens</th></tr>
  </thead>
  <tbody>
    <tr className="border-t border-border/40"><td className="p-3 font-medium">Correction <span className="text-foreground/40">(not a strike)</span></td><td className="p-3">A one-off slip; off-topic or unwelcome behavior</td><td className="p-3">A private word about what crossed the line. Usually that's the end of it.</td></tr>
    <tr className="border-t border-border/40"><td className="p-3 font-medium">Strike 1 — Warning</td><td className="p-3">A clear violation, or a repeat after a Correction</td><td className="p-3">A formal warning, told privately and logged, sometimes with a defined cool-off period.</td></tr>
    <tr className="border-t border-border/40"><td className="p-3 font-medium">Strike 2 — Board decides</td><td className="p-3">A further violation after a warning</td><td className="p-3">The Board convenes and decides, based on severity: a time-limited suspension, or removal (by two-thirds vote). A member suspended here who violates again is removed.</td></tr>
  </tbody>
</table>
```

(Copy every section's prose verbatim from `WCB-Code-of-Conduct-RATIFIED.md` — do not paraphrase.)

- [ ] **Step 2: Verify it builds + renders**

Run: `npx tsc --noEmit`, then `npx next build` (route compiles). If dev server available, load `/code-of-conduct` — all sections present, table renders, ratification line shows, no auth prompt.

- [ ] **Step 3: Commit**

```bash
git add src/app/code-of-conduct/page.tsx
git commit -m "feat: public /code-of-conduct page (ratified text)"
```

---

### Task 5: Homepage entry points (nav + join-CTA trust line)

**Files:**
- Modify: `src/app/page.tsx` (desktop nav ~line 164-169, mobile menu ~line 201-206, and the hero/join CTA section ~line 225+)

**Interfaces:**
- Consumes: the new `/code-of-conduct` and `/board` routes.

- [ ] **Step 1: Add nav links to BOTH desktop and mobile nav**

In the desktop `<nav>` (near the existing `#events` / `/bot` links), add:

```tsx
<Link href="/code-of-conduct" className="text-sm text-foreground/60 hover:text-foreground transition-colors">Code of Conduct</Link>
<Link href="/board" className="text-sm text-foreground/60 hover:text-foreground transition-colors">Board</Link>
```

In the mobile menu (near the existing mobile `#events` / `/bot` links), add the same two, following the mobile link style and including `onClick={() => setMobileMenuOpen(false)}`:

```tsx
<Link href="/code-of-conduct" onClick={() => setMobileMenuOpen(false)} className="text-foreground/70 hover:text-foreground py-2">Code of Conduct</Link>
<Link href="/board" onClick={() => setMobileMenuOpen(false)} className="text-foreground/70 hover:text-foreground py-2">Board</Link>
```

- [ ] **Step 2: Add the trust-signal line near the join CTA**

In the hero/join CTA area (near the PayPal join button / `membersHref` CTA, ~line 245-257), add a short trust line:

```tsx
<p className="text-sm text-foreground/50 mt-4">
  A welcoming, harassment-free community —{" "}
  <Link href="/code-of-conduct" className="text-accent hover:underline">read our Code of Conduct</Link>.
</p>
```

- [ ] **Step 3: Verify build + both navs**

Run: `npx tsc --noEmit`, `npx next build`. If dev server available: load `/`, confirm BOTH desktop nav (wide viewport) AND mobile menu (narrow viewport / toggle) show the two new links, the trust line appears near the join CTA, and all links navigate correctly. Confirm no double-header/nav regression on the homepage.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: homepage links to Code of Conduct + Board, join-CTA trust line"
```

---

## Self-Review

**Spec coverage:**
- `/code-of-conduct` native render, ratified text verbatim, ratification line → Task 4 ✅
- `/board` name+role from roster `isBoard`+`role`, Ombudsman `Arycella` DM + board fallback → Tasks 2, 3 ✅
- `role` column data-model change → Task 1 ✅
- Both public, sibling to `/bot` → Tasks 3, 4 ✅
- Homepage nav (desktop AND mobile) + join-CTA trust line → Task 5 ✅
- Graceful roster-fetch failure → Task 2 (`getBoard` returns `[]`), Task 3 (fallback UI) ✅
- Config-stored Ombudsman handle → Task 2 (`OMBUDSMAN` const) ✅
- 3-rung ratified ladder in the table → Task 4 ✅

**Placeholder scan:** No TBDs. The one "copy verbatim from the ratified md" instruction in Task 4 is intentional (the full text is in `WCB-Code-of-Conduct-RATIFIED.md`, the canonical source) — not a placeholder, a source pointer; the structure + table are fully specified.

**Type consistency:** `MemberRecord.role: string | null` (Task 1) consumed by `boardFromRoster` (Task 2); `BoardMember {name, role}` + `OMBUDSMAN {name, discord}` (Task 2) consumed by `/board` (Task 3). Consistent.

---

## Notes for the implementer
- The full ratified Code text lives at `C:\Users\jordan\Code\wcb_ignition_analysis\WCB-Code-of-Conduct-RATIFIED.md` — Task 4 copies its prose verbatim into JSX. Do not paraphrase or edit the policy wording.
- Do not add any names/incidents to the Code page beyond what's in the ratified text.
- The homepage's header is its own (not the members SiteHeader) — only edit `src/app/page.tsx`.
