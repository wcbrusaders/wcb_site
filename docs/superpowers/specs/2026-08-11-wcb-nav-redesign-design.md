# WCB Nav Redesign — Design

**Date:** 2026-08-11
**Status:** Approved (brainstorming) → ready for implementation plan
**Scope:** `wcb_site` — redesign the global `SiteHeader` (rendered on every page via the root layout) from a bare row of text links into a polished, usage-ordered, icon-labelled nav with a real logo crest and a working mobile drawer. Visual + structural only; no new routes, no data changes.

## Problem

The current nav is unstyled text: `WCB · Hub · Library · Equipment · Competitions · Holdings(board) · Sign out`, all equal weight, no active state, no logo. With 6+ links it now (a) looks unpolished and (b) wraps/crowds badly on mobile. It also mis-orders the links relative to real usage and uses no brand mark.

## Key decisions (locked in brainstorming, visual companion)

- **Direction: icon + label tabs (option ③).** Each feature gets an icon + label; the bar is scannable and less text-width dependent.
- **Usage order: Competitions › Equipment › Books** (the club's real priority), with **Hub** first. Note the label change: **"Library" → "Books"** in the nav (shorter, clearer; the route stays `/members/library`).
- **Holdings is an officer tool, set apart** — a divider + accent-outlined treatment (not just another link), board-only. (We considered a full "Officers ▾" menu; deferred — a single set-apart Holdings button is enough until there are more board tools. The design keeps that door open.)
- **Real logo crest** — cropped from the existing banner PNG into `public/images/wcb-crest.png` (151×160, done) — shown left with a "WAKE COUNTY / **BRUSADERS**" wordmark (BRUSADERS in accent). The crest+wordmark link to `/` (public) — actually to the members hub `/members` when signed in? **No: keep linking to `/` (home)**, matching current behavior; the crest is the "way home."
- **Mobile: logo + hamburger (☰) → flat drawer.** Below the `md` breakpoint the tab row is replaced by a ☰ button that toggles a drawer with the same links, same icons, same order, divider before the board-only Holdings row. Non-board members never see the Holdings row.
- **Active-page indicator:** the current route's tab gets the accent underline (desktop) / accent-highlighted row (drawer).
- **Icons:** a small, consistent line-icon set (see "Icons" below) — NOT emoji (emoji were mockup placeholders).
- **Signed-out state unchanged in spirit:** logo + a single "Member Login" accent pill (no feature tabs when logged out). Applies on both desktop and mobile.

## Out of scope

- An "Officers" grouping menu (deferred; single set-apart Holdings for now).
- Any new route, page, or data model.
- Restyling the hub `FeatureNav` cards (separate surface; a later polish pass could align its iconography, but not here).
- A new icon dependency if avoidable (see Icons).
- Changing the `/members/library` route (only its nav *label* becomes "Books").

## Architecture — the client/server boundary (the load-bearing concern)

`SiteHeader` is currently a **server component**: it calls `auth()` directly and contains an inline `'use server'` sign-out form. The desktop bar can and should stay server-rendered. But the **mobile drawer needs client state** (open/closed toggle) — so the interactive piece must be a `'use client'` child.

**Split:**
- `SiteHeader` (server, stays server) — calls `auth()`, computes `signedIn` + `isBoard`, builds the **link list as plain serializable data**, renders the desktop tab bar directly (server JSX, no interactivity needed there), and renders the client `<MobileNav>` passing it the same link data + a sign-out affordance. Keeps the crest, wordmark, and the desktop tabs server-rendered.
- `MobileNav` (`'use client'`) — receives `{ links: NavLink[], isBoard, signedIn }` as props (plain data, no functions from the server except the sign-out — see below), holds `useState` for open/closed, renders the ☰ button + the slide-in drawer. Client-only; imports nothing server-only (no `auth`, no `prisma`).
- **Sign-out across the boundary:** the sign-out is a server action (`signOut`). A client component can't hold an inline `'use server'` closure the way the server component does. Options (decide in plan): (a) extract a tiny `signOutAction` into a `'use server'` actions file that BOTH the desktop form and the `MobileNav` drawer import by reference (cleanest — mirrors the lending-actions pattern); or (b) the drawer's sign-out is a `<form action={signOutAction}>` with a full-width button. Use (a): a shared `signOutAction`.
- **NavLink data shape** (server → client, must be plain/serializable — no JSX, no functions):
  ```ts
  type NavLink = { href: string; label: string; icon: IconName; board?: boolean }
  ```
  The icon is referenced by a string name; the client maps name → the actual icon component (so no component instance crosses the boundary).

**Why this matters:** a client-only symbol imported into the server `SiteHeader`, or passing a non-serializable value (function/JSX) as a prop to `MobileNav`, throws at render (the repo has hit this class of 500 before). The plan/review must verify the desktop path stays server-safe and only plain data crosses to `MobileNav`.

## Icons

Use **inline SVG line icons** defined in a tiny local `NavIcons` map — NO new npm dependency. Five icons: `home` (Hub), `trophy` (Competitions), `wrench` (Equipment), `book` (Books), `shield` (Holdings). Each is a small stroke-based `<svg>` (currentColor, ~18px) so it inherits text color and the accent on active/hover. Referenced by name from the `NavLink.icon` string. (If the codebase already vendors an icon set, reuse it; otherwise these five hand-authored SVGs are trivial and dependency-free.)

## Data / link model (single source of truth)

Define the nav links ONCE (e.g. in `SiteHeader` or a small shared `nav-links.ts`) so desktop + mobile can't drift:
```
Hub          /members            icon: home
Competitions /members/competitions icon: trophy
Equipment    /members/equipment  icon: wrench
Books        /members/library    icon: book       (label "Books", route unchanged)
Holdings     /members/holdings   icon: shield  board: true
```
Order is the usage order. `board: true` links render only when `isBoard`. Active state is computed by comparing the current pathname (client: `usePathname()` in `MobileNav`; desktop: pass the pathname down or compute in the server component via the `headers()`/route — simplest is to let each link compare against `usePathname()` in a tiny client wrapper, OR compute active server-side. Decide in plan; a small client `NavTabs` for the desktop row is acceptable if it keeps active-state logic in one place — but weigh it against keeping desktop server-rendered).

## UI / display

- **Desktop (≥ md):** sticky header (unchanged shell: `sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur`). Left: crest (`h-8 w-auto`) + wordmark ("WAKE COUNTY" / "BRUSADERS" with BRUSADERS in `text-accent`), linking `/`. Right: the icon+label tabs in usage order; active tab has a `border-b-2 border-accent`; a thin `w-px h-4 bg-border` divider; then Holdings as an accent-outlined chip (`border border-accent/35 text-accent rounded-full`) when board; then the Sign out ghost pill. Signed-out: crest + "Member Login" accent pill only.
- **Mobile (< md):** header shows crest + ☰. Tapping ☰ opens a drawer (slide/scale in, `bg-background` panel, `border border-border`); rows are icon + label, active row `bg-accent/12 text-accent`; a divider then the board-only Holdings row; a full-width "Sign out" at the bottom. Tapping a link or the backdrop closes it. Signed-out: crest + "Member Login" pill (no ☰ needed, or ☰ with just Login — keep it a pill, no drawer when logged out).
- Tokens: existing (`--accent #ff9500`, `bg-background`, `border-border`, `text-foreground/70` idle). Match the current header's sticky/blur shell exactly.

## Error handling & edge cases

- **Signed-out users** see only crest + Member Login (both breakpoints); no feature tabs, no drawer, no board links. (Current behavior preserved.)
- **Non-board members** never get the Holdings tab/row (server filters `board` links by `isBoard` before the list crosses to the client).
- **Active state on nested routes** (e.g. `/members/equipment/...`) should highlight Equipment — match by pathname prefix, not exact equality (Hub `/members` must NOT match every `/members/*` — Hub is active only on exact `/members`; feature tabs active on their prefix).
- **Drawer + SSR:** `MobileNav` is `'use client'`; the drawer starts closed on load (no hydration mismatch). The ☰ toggle is pure client state.
- **Logo asset:** `wcb-crest.png` already in `public/images/`; use `next/image` with fixed height + `w-auto` (like the existing banner usages).
- **Boundary:** only plain `NavLink[]` + booleans + the shared `signOutAction` (by reference) cross to `MobileNav`. No `auth`/`prisma`/JSX/functions-as-props.

## Testing

This is presentational/structural, so testing is lighter and mostly build/inspection — but pin the pieces that can regress:
- **Active-state helper** (`isActive(pathname, href)`): unit-test — exact match for Hub (`/members`), prefix match for feature routes (`/members/equipment` active on `/members/equipment/123`), no false-positive (Hub not active on `/members/equipment`). Framework-free, DI'd pathname.
- **Link-list construction:** unit-test that board links are excluded when `!isBoard` and included when `isBoard`; order is the usage order.
- **Build/boundary bar:** `npx tsc --noEmit` clean; `npm run build` compiles and every page still renders (the header is on all of them) — confirm no route regressed to an error; `MobileNav` is `'use client'` and `SiteHeader` imports no browser-only symbol.
- **Manual (post-deploy):** desktop shows crest+wordmark+icon tabs, active underline follows the route; resize to mobile → ☰ opens the flat drawer, links navigate + close it; signed-out shows crest + Member Login only; a board account sees Hollings, a non-board doesn't.

## Success criteria

- Every page's header shows the WCB crest + wordmark and a polished icon+label nav ordered Hub · Competitions · Equipment · Books, with the active page indicated.
- Holdings appears (set apart, board-only) only for board members.
- On a phone the nav collapses to crest + ☰ → a flat drawer with the same links/icons/order; it opens, navigates, and closes cleanly; nothing wraps or overflows.
- Signed-out users see crest + Member Login only.
- The redesign is purely presentational: no route changed (only "Library"→"Books" label), no data touched, the sign-out still works, and the client/server boundary is clean (desktop server-rendered, only plain data + the shared sign-out action cross to the client drawer).
