# WCB Nav Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the global `SiteHeader` into a polished icon+label nav (crest + wordmark, usage-ordered tabs, active-page indicator, set-apart board-only Holdings) with a working mobile hamburger drawer.

**Architecture:** A single source-of-truth nav-links list + a pure `isActive` helper (unit-tested). `SiteHeader` stays a **server component** (calls `auth()`, owns the desktop bar) and delegates the interactive mobile drawer to a new `'use client'` `MobileNav` child that receives only plain serializable data + a shared `signOutAction` by reference. Inline SVG line-icons, no new dependency.

**Tech Stack:** Next.js 16 App Router (server components + server actions + `usePathname`), React 19, TypeScript, Tailwind v4 (existing CSS-var tokens), `next/image`, Vitest.

## Global Constraints

- **Presentational only:** no new route, no data/schema change, no new npm dependency, no env. `prisma db push` NOT needed. Deploy = merge + redeploy.
- **"Library" → "Books"** as the nav LABEL only; the route stays `/members/library`.
- **Usage order:** Hub · Competitions · Equipment · Books (Hub first, then the club's real priority). Holdings (board-only) is set apart after a divider.
- **Crest + wordmark link to `/`** (home) — matches current behavior; the crest is the "way home". Asset `public/images/wcb-crest.png` already exists (151×160).
- **Client/server boundary is the load-bearing risk** (this repo has hit a render-time 500 from a client-only symbol on a server component). `SiteHeader` must stay server-safe; only plain `NavLink[]` + booleans + the shared `signOutAction` (by reference) may cross into `'use client' MobileNav`. No `auth`/`prisma`/JSX/functions-as-data crossing.
- **Icons:** inline SVG line-icons in a local map, `currentColor`, ~18px. Names: `home`, `trophy`, `wrench`, `book`, `shield`. No icon library.
- **Signed-out state preserved:** crest + a single "Member Login" accent pill; no tabs, no drawer, no board links (both breakpoints).
- **Non-board never sees Holdings** — the server filters `board` links by `isBoard` before the list crosses to the client.
- Tokens: sticky shell `sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur`; accent `#ff9500` (`text-accent`/`border-accent`); idle link `text-foreground/70`; card/panel `bg-background`/`bg-card-bg`, `border-border`.
- Breakpoint: desktop bar at `md:` and up; hamburger drawer below `md` (`md:hidden` / `hidden md:flex`), matching the codebase's existing `md:` usage.

---

## File Structure

- `src/lib/nav.ts` (CREATE) — `NavLink` type, the single source-of-truth `MEMBER_LINKS` list, `visibleLinks(isBoard)`, and the pure `isActive(pathname, href)` helper. Framework-free (no React/next imports) so it's unit-testable and importable by both server and client.
- `src/lib/nav.test.ts` (CREATE) — unit tests for `isActive` + `visibleLinks`.
- `src/components/NavIcons.tsx` (CREATE) — a `NavIcon` component mapping an icon name → inline `<svg>`. Plain presentational, safe on server or client (no hooks, no browser API).
- `src/app/actions/auth-actions.ts` (CREATE) — `'use server'` file exporting `signOutAction` (shared by the desktop form + the mobile drawer).
- `src/components/MobileNav.tsx` (CREATE) — `'use client'` hamburger + drawer; receives `{ links, isBoard, signedIn }` props + imports `signOutAction` by reference; uses `useState` (open) + `usePathname` (active).
- `src/components/SiteHeader.tsx` (MODIFY) — stays server; crest+wordmark, desktop tab bar, renders `<MobileNav>`; desktop sign-out uses `signOutAction`.

---

### Task 1: `nav.ts` — links model + `isActive` (pure, tested)

**Files:**
- Create: `src/lib/nav.ts`
- Test: `src/lib/nav.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type IconName = 'home' | 'trophy' | 'wrench' | 'book' | 'shield'
  export type NavLink = { href: string; label: string; icon: IconName; board?: boolean }
  export const MEMBER_LINKS: NavLink[]   // usage order, Holdings last with board:true
  export function visibleLinks(isBoard: boolean): NavLink[]   // drops board links when !isBoard
  export function isActive(pathname: string, href: string): boolean
  ```
  `isActive` rule: Hub (`/members`) matches ONLY exact `/members` (or `/members` with a trailing slash); every other link matches its href OR any path under it (`pathname === href || pathname.startsWith(href + '/')`).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/nav.test.ts`:

```ts
import { test, expect } from 'vitest'
import { MEMBER_LINKS, visibleLinks, isActive } from './nav'

test('MEMBER_LINKS are in usage order with correct routes + labels', () => {
  expect(MEMBER_LINKS.map((l) => l.label)).toEqual(['Hub', 'Competitions', 'Equipment', 'Books', 'Holdings'])
  const byLabel = Object.fromEntries(MEMBER_LINKS.map((l) => [l.label, l.href]))
  expect(byLabel.Hub).toBe('/members')
  expect(byLabel.Competitions).toBe('/members/competitions')
  expect(byLabel.Equipment).toBe('/members/equipment')
  expect(byLabel.Books).toBe('/members/library')     // label "Books", route unchanged
  expect(byLabel.Holdings).toBe('/members/holdings')
  expect(MEMBER_LINKS.find((l) => l.label === 'Holdings')!.board).toBe(true)
})

test('visibleLinks hides board links for non-board, shows them for board', () => {
  expect(visibleLinks(false).some((l) => l.label === 'Holdings')).toBe(false)
  expect(visibleLinks(false).length).toBe(4)
  expect(visibleLinks(true).some((l) => l.label === 'Holdings')).toBe(true)
  expect(visibleLinks(true).length).toBe(5)
})

test('isActive: Hub matches only exact /members (not every /members/*)', () => {
  expect(isActive('/members', '/members')).toBe(true)
  expect(isActive('/members/', '/members')).toBe(true)
  expect(isActive('/members/equipment', '/members')).toBe(false)  // the load-bearing case
})

test('isActive: feature links match their route and nested paths', () => {
  expect(isActive('/members/equipment', '/members/equipment')).toBe(true)
  expect(isActive('/members/equipment/123', '/members/equipment')).toBe(true)  // prefix
  expect(isActive('/members/competitions', '/members/equipment')).toBe(false)
  expect(isActive('/members/library', '/members/library')).toBe(true)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/nav.test.ts`
Expected: FAIL — `./nav` not found.

- [ ] **Step 3: Implement `src/lib/nav.ts`**

```ts
export type IconName = 'home' | 'trophy' | 'wrench' | 'book' | 'shield'
export type NavLink = { href: string; label: string; icon: IconName; board?: boolean }

// Single source of truth for the members nav. Usage order (Hub first, then the
// club's real priority: Competitions > Equipment > Books), Holdings last (board).
// Note: "Books" is the LABEL; the route stays /members/library.
export const MEMBER_LINKS: NavLink[] = [
  { href: '/members', label: 'Hub', icon: 'home' },
  { href: '/members/competitions', label: 'Competitions', icon: 'trophy' },
  { href: '/members/equipment', label: 'Equipment', icon: 'wrench' },
  { href: '/members/library', label: 'Books', icon: 'book' },
  { href: '/members/holdings', label: 'Holdings', icon: 'shield', board: true },
]

export function visibleLinks(isBoard: boolean): NavLink[] {
  return MEMBER_LINKS.filter((l) => !l.board || isBoard)
}

// Hub (/members) is active only on the exact hub route; feature links are active
// on their route and any nested path under it.
export function isActive(pathname: string, href: string): boolean {
  const p = pathname.replace(/\/$/, '') || '/'   // normalize trailing slash
  if (href === '/members') return p === '/members'
  return p === href || p.startsWith(href + '/')
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/nav.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav.ts src/lib/nav.test.ts
git commit -m "feat(nav): links model + isActive helper (single source of truth)"
```

---

### Task 2: `NavIcons` — inline SVG line-icon map

**Files:**
- Create: `src/components/NavIcons.tsx`

**Interfaces:**
- Consumes: `type IconName` from `@/lib/nav`.
- Produces: `export function NavIcon({ name, className }: { name: IconName; className?: string })` — renders the matching inline `<svg>`. No hooks, no browser API → safe in server OR client components.

- [ ] **Step 1: Write the component**

Create `src/components/NavIcons.tsx`:

```tsx
import type { IconName } from '@/lib/nav'

// Inline stroke SVGs (currentColor) so they inherit text color + accent on
// active/hover. ~18px via className (default h-[18px] w-[18px]). No icon lib.
const PATHS: Record<IconName, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5" />,
  trophy: <path d="M7 4h10v3a5 5 0 0 1-10 0V4ZM7 5H4v1a3 3 0 0 0 3 3M17 5h3v1a3 3 0 0 1-3 3M9 14.5V17h6v-2.5M8 20h8" />,
  wrench: <path d="M14.5 6.5a3.5 3.5 0 0 0-4.6 4.2L4 16.6 6.4 19l5.9-5.9a3.5 3.5 0 0 0 4.2-4.6l-2 2-1.9-1.9 2-2Z" />,
  book: <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4ZM5 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2M18 17H7" />,
  shield: <path d="M12 3 5 6v5c0 4.2 2.9 7.5 7 9 4.1-1.5 7-4.8 7-9V6l-7-3Z" />,
}

export function NavIcon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={className ?? 'h-[18px] w-[18px]'}>
      {PATHS[name]}
    </svg>
  )
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/NavIcons.tsx
git commit -m "feat(nav): inline SVG line-icon set (no dependency)"
```

---

### Task 3: `signOutAction` — shared server action

**Files:**
- Create: `src/app/actions/auth-actions.ts`

**Interfaces:**
- Consumes: `signOut` from `@/lib/auth`.
- Produces: `export async function signOutAction(): Promise<void>` — a `'use server'` action usable as a `<form action={...}>` handler from both the server header and the client drawer.

- [ ] **Step 1: Write it**

Create `src/app/actions/auth-actions.ts`:

```ts
'use server'

import { signOut } from '@/lib/auth'

// Shared so both the desktop header form and the mobile drawer can sign out
// without the client component needing an inline 'use server' closure.
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/' })
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/auth-actions.ts
git commit -m "feat(nav): shared signOutAction server action"
```

---

### Task 4: `MobileNav` — client hamburger + drawer

**Files:**
- Create: `src/components/MobileNav.tsx`

**Interfaces:**
- Consumes: `type NavLink, isActive` from `@/lib/nav`; `NavIcon` from `@/components/NavIcons`; `signOutAction` from `@/app/actions/auth-actions`; `Link` from `next/link`; `usePathname` from `next/navigation`.
- Produces: `export function MobileNav({ links, signedIn }: { links: NavLink[]; signedIn: boolean })`.
  Note: `links` is ALREADY filtered by the server (via `visibleLinks(isBoard)`), so `MobileNav` never needs `isBoard` — it just renders what it's given. Holdings is identified for the "set apart" divider by `link.board === true`.

- [ ] **Step 1: Write the component**

Create `src/components/MobileNav.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { NavLink } from '@/lib/nav'
import { isActive } from '@/lib/nav'
import { NavIcon } from '@/components/NavIcons'
import { signOutAction } from '@/app/actions/auth-actions'

export function MobileNav({ links, signedIn }: { links: NavLink[]; signedIn: boolean }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Signed-out: no drawer, just the login pill (matches desktop).
  if (!signedIn) {
    return (
      <Link href="/login" className="md:hidden bg-accent hover:bg-accent-hover text-background font-medium px-4 py-1.5 rounded-full text-sm transition-colors">
        Member Login
      </Link>
    )
  }

  return (
    <div className="md:hidden">
      <button aria-label="Open menu" onClick={() => setOpen(true)} className="flex flex-col gap-[5px] p-2">
        <span className="block h-0.5 w-5 bg-foreground rounded"></span>
        <span className="block h-0.5 w-5 bg-foreground rounded"></span>
        <span className="block h-0.5 w-5 bg-foreground rounded"></span>
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />
          {/* drawer */}
          <div className="fixed right-0 top-0 z-50 h-full w-72 bg-background border-l border-border p-3 flex flex-col">
            <button aria-label="Close menu" onClick={() => setOpen(false)} className="self-end text-foreground/60 text-2xl leading-none px-2">×</button>
            <nav className="mt-2 flex flex-col">
              {links.map((l, i) => {
                const prevBoard = i > 0 && links[i - 1].board
                const showDivider = l.board && !prevBoard   // divider before the first board link
                const active = isActive(pathname, l.href)
                return (
                  <div key={l.href}>
                    {showDivider && <div className="my-2 h-px bg-border mx-3" />}
                    <Link href={l.href} onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg text-[15px] ${active ? 'bg-accent/10 text-accent' : 'text-foreground/85 hover:bg-card-bg'}`}>
                      <NavIcon name={l.icon} className="h-[18px] w-[18px]" />
                      {l.label}
                      {l.board && <span className="ml-auto text-[9px] text-accent border border-accent/40 rounded-full px-1.5 py-0.5">BOARD</span>}
                    </Link>
                  </div>
                )
              })}
            </nav>
            <form action={signOutAction} className="mt-auto">
              <button type="submit" className="w-full border border-border rounded-full py-2.5 text-sm text-foreground/60 hover:text-foreground">Sign out</button>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify types + it's a clean client module**

Run: `npx tsc --noEmit`
Expected: clean. (Confirm the file starts with `'use client'` and imports nothing server-only — `signOutAction` is a `'use server'` action imported by reference, which is allowed.)

- [ ] **Step 3: Commit**

```bash
git add src/components/MobileNav.tsx
git commit -m "feat(nav): MobileNav client hamburger + drawer"
```

---

### Task 5: `SiteHeader` — crest + wordmark + desktop tabs + MobileNav (stays server)

**Files:**
- Modify: `src/components/SiteHeader.tsx` (full rewrite of the body; keep it a server component)

**Interfaces:**
- Consumes: `auth` from `@/lib/auth`; `visibleLinks, isActive` from `@/lib/nav`; `NavIcon` from `@/components/NavIcons`; `MobileNav` from `@/components/MobileNav`; `signOutAction` from `@/app/actions/auth-actions`; `Image` from `next/image`; `Link` from `next/link`.

**Note on desktop active-state:** the server component can't call `usePathname()`. To keep the desktop bar server-rendered AND show an active underline, wrap the desktop tab row in a tiny `'use client'` `DesktopTabs` that takes `links` and calls `usePathname` + `isActive` itself — OR render the desktop tabs inside `MobileNav`'s sibling client space. **Chosen approach:** add a small `DesktopTabs` client component (Step 1 below) so BOTH breakpoints compute active-state via `usePathname`, from the same `isActive` helper and the same server-filtered `links`. `SiteHeader` stays server (crest, wordmark, auth, layout) and passes plain `links` to both `DesktopTabs` and `MobileNav`.

- [ ] **Step 1: Add `DesktopTabs` client component**

Create `src/components/DesktopTabs.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { NavLink } from '@/lib/nav'
import { isActive } from '@/lib/nav'
import { NavIcon } from '@/components/NavIcons'
import { signOutAction } from '@/app/actions/auth-actions'

export function DesktopTabs({ links }: { links: NavLink[] }) {
  const pathname = usePathname()
  return (
    <div className="hidden md:flex items-center gap-5 text-sm">
      {links.map((l, i) => {
        const prevBoard = i > 0 && links[i - 1].board
        const showDivider = l.board && !prevBoard
        const active = isActive(pathname, l.href)
        if (l.board) {
          return (
            <div key={l.href} className="flex items-center gap-5">
              {showDivider && <span className="w-px h-4 bg-border" />}
              <Link href={l.href}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 ${active ? 'border-accent text-accent' : 'border-accent/35 text-accent/90 hover:text-accent'}`}>
                <NavIcon name={l.icon} className="h-4 w-4" /> {l.label}
              </Link>
            </div>
          )
        }
        return (
          <Link key={l.href} href={l.href}
            className={`inline-flex items-center gap-1.5 pb-1 border-b-2 ${active ? 'border-accent text-foreground' : 'border-transparent text-foreground/70 hover:text-foreground'} transition-colors`}>
            <NavIcon name={l.icon} className="h-[18px] w-[18px]" /> {l.label}
          </Link>
        )
      })}
      <form action={signOutAction}>
        <button type="submit" className="text-foreground/50 hover:text-foreground px-3 py-1.5 rounded-full border border-border/50 transition-colors">Sign out</button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `SiteHeader.tsx`** (server component)

```tsx
import Link from 'next/link'
import Image from 'next/image'
import { auth } from '@/lib/auth'
import { visibleLinks } from '@/lib/nav'
import { DesktopTabs } from '@/components/DesktopTabs'
import { MobileNav } from '@/components/MobileNav'

// Global header on every page (root layout). Server component: reads the
// session, filters board links server-side, and passes ONLY plain NavLink[]
// data to the client tab/drawer components (no auth/prisma/JSX crossing).
export async function SiteHeader() {
  const session = await auth()
  const signedIn = !!session?.user?.memberId
  const isBoard = !!session?.user?.isBoard
  const links = signedIn ? visibleLinks(isBoard) : []

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur">
      <nav className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-4 md:px-6 py-3">
        {/* Brand: crest + wordmark, links home */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <Image src="/images/wcb-crest.png" alt="Wake County Brusaders" width={40} height={42} className="h-8 w-auto" priority />
          <span className="font-extrabold tracking-tight leading-[1.02] text-[13px] hidden sm:block">
            WAKE COUNTY<br /><span className="text-accent">BRUSADERS</span>
          </span>
        </Link>

        {/* Desktop tabs (client, for active-state) — hidden on mobile */}
        {signedIn ? (
          <DesktopTabs links={links} />
        ) : (
          <Link href="/login" className="hidden md:inline-flex bg-accent hover:bg-accent-hover text-background font-medium px-4 py-1.5 rounded-full text-sm transition-colors">
            Member Login
          </Link>
        )}

        {/* Mobile hamburger/drawer (client) — hidden on desktop */}
        <MobileNav links={links} signedIn={signedIn} />
      </nav>
    </header>
  )
}
```

- [ ] **Step 3: Type + build (the boundary + render-path check)**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npm run build`
Expected: compiles; the header is on every route, so a client-only leak onto the server `SiteHeader` would fail the build or throw at render — confirm the build succeeds and the route table is unchanged (all existing routes still present). `DesktopTabs`/`MobileNav` are `'use client'`; `SiteHeader` imports only `auth` + plain data + those client components (by JSX) + `signOutAction` is NOT imported by SiteHeader itself (it's used inside the client components) — verify SiteHeader imports nothing browser-only.

- [ ] **Step 4: Commit**

```bash
git add src/components/DesktopTabs.tsx src/components/SiteHeader.tsx
git commit -m "feat(nav): redesigned SiteHeader (crest + icon tabs + mobile drawer)"
```

---

## Final verification (after all tasks)

- `npx tsc --noEmit` clean
- `npx vitest run` green (existing suite + the new `nav.test.ts` — count = prior + 4)
- `npm run build` compiles; every route still present (header renders on all); no new route, no removed route
- `npx eslint src/lib/nav.ts src/components/NavIcons.tsx src/components/MobileNav.tsx src/components/DesktopTabs.tsx src/components/SiteHeader.tsx src/app/actions/auth-actions.ts` — no new errors
- **Boundary check (explicit):** `SiteHeader` is a server component importing only `auth`, `visibleLinks` (pure), and the two client components (by JSX) + `Image`/`Link`. `DesktopTabs`/`MobileNav` are `'use client'` and import `signOutAction` (a `'use server'` action) by reference — allowed. No `auth`/`prisma` in a client file. Only plain `NavLink[]` + `signedIn` boolean cross to the client.
- **Manual (post-deploy):** desktop shows crest+wordmark + icon tabs, the active tab underlines and follows navigation; Holdings appears (accent-outlined, after a divider) only for board; resize to mobile → hamburger opens the drawer, links navigate + close it, Holdings row only for board; signed-out shows crest + Member Login only (both breakpoints); sign-out works from both the desktop button and the mobile drawer.

## Self-Review notes

- **"Library" → "Books":** label only, in `MEMBER_LINKS` (`href: '/members/library', label: 'Books'`); route untouched; asserted in the Task 1 test.
- **Boundary:** the plan deliberately introduces TWO client components (`DesktopTabs`, `MobileNav`) so active-state (`usePathname`) lives client-side while `SiteHeader` stays server. This is the safe resolution of "desktop stays server-rendered" vs "needs active-state" — the tradeoff (desktop tabs are a client island) is acceptable and keeps auth server-side. The review should confirm no server-only symbol reaches a client file and no non-serializable prop crosses.
- **Single source of truth:** both `DesktopTabs` and `MobileNav` render from the same server-filtered `links` and the same `isActive` — they cannot drift.
- **Sign-out:** shared `signOutAction`; both breakpoints use `<form action={signOutAction}>`.
