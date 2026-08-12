# Homepage Double-Nav Fix + Members-Area CTA — Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Eliminate the duplicated header/hamburger on pages that already have their own header (homepage, /login, /bot), and surface the buried members area with a prominent "Members Area / Member Login" button on the homepage.

**Root cause:** `<SiteHeader/>` is in the ROOT layout (`src/app/layout.tsx`), so it renders on every page — but `/`, `/login`, and `/bot` each already render their OWN `<header>` (logo + nav + hamburger). Result: two stacked headers / two hamburgers, most visibly on the homepage when logged in (SiteHeader shows the members drawer). Only `/members/*` actually relies on SiteHeader for its header.

**Architecture:** Move `<SiteHeader/>` out of the root layout into a NEW `src/app/members/layout.tsx` so it renders ONLY on members pages. Then add a session-aware "Members Area"/"Member Login" button to the homepage's existing header + mobile menu + hero + final CTA, using a client fetch to `/api/auth/session` for the logged-in check (no SessionProvider exists).

## Global Constraints
- Presentational/structural only. No data/schema/route changes, no new dependency.
- The homepage (`page.tsx`), `/login`, `/bot` keep their OWN existing headers untouched (except the homepage gains the Members button).
- Members pages (`/members/*`) must STILL get `SiteHeader` — via the new members layout, so no members page loses its header.
- Client/server boundary: `page.tsx` is `'use client'` — the session check is a client `fetch('/api/auth/session')`, no server-only import. The new members layout is a server component that renders the (server) `SiteHeader`.
- Tokens: accent `#ff9500` pill matching the existing "Become a Brusader" button style.

---

### Task 1: Move SiteHeader from root layout → members layout

**Files:**
- Modify: `src/app/layout.tsx` (remove `<SiteHeader/>` + its import)
- Create: `src/app/members/layout.tsx` (server component that renders `<SiteHeader/>` above its children)

- [ ] **Step 1: Remove SiteHeader from the root layout.** In `src/app/layout.tsx`, delete the `import { SiteHeader }` line and the `<SiteHeader />` element (leave `{children}`).

- [ ] **Step 2: Create `src/app/members/layout.tsx`:**
```tsx
import { SiteHeader } from '@/components/SiteHeader'

// SiteHeader renders ONLY on members pages. Non-members pages (/, /login, /bot)
// have their own headers, so the global header lived in the root layout before
// and double-stacked. Scoping it here fixes that structurally.
export default function MembersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  )
}
```

- [ ] **Step 3: Verify.** `npx tsc --noEmit` clean; `npm run build`. Manually reason: `/` `/login` `/bot` now have exactly ONE header (their own); `/members`, `/members/competitions`, `/members/equipment`, `/members/library`, `/members/holdings` still get SiteHeader (via the new layout). Confirm the members layout wraps all of them (it's at `src/app/members/layout.tsx`, so it applies to every `/members/*` route).

- [ ] **Step 4: Commit.** `git add src/app/layout.tsx src/app/members/layout.tsx && git commit -m "fix(nav): scope SiteHeader to /members layout (kills double header on /, /login, /bot)"`

---

### Task 2: Add session-aware "Members Area" button to the homepage

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add a client session check.** Near the top of the `Home` component (it's already `'use client'` with `useState`/`useEffect`), add:
```tsx
const [signedIn, setSignedIn] = useState<boolean | null>(null)
useEffect(() => {
  fetch('/api/auth/session')
    .then((r) => r.json())
    .then((s) => setSignedIn(!!s?.user))
    .catch(() => setSignedIn(false))
}, [])
const membersHref = signedIn ? '/members' : '/login'
const membersLabel = signedIn ? 'Members Area' : 'Member Login'
```
(While `signedIn` is `null` (pre-fetch), default the label to "Member Login" / href `/login` so there's no broken state — i.e. use `signedIn ? ... : ...` which treats null as logged-out; the flash is negligible.)

- [ ] **Step 2: Header desktop CTA.** In the header's right-side `<div className="flex items-center gap-4">`, add a Members button BEFORE the "Become a Brusader" pill (so login/area is the primary member action):
```tsx
<Link href={membersHref} className="hidden sm:inline-flex border border-accent/50 text-accent hover:bg-accent/10 text-sm font-medium px-5 py-2 rounded-full transition-colors">
  {membersLabel}
</Link>
```

- [ ] **Step 3: Mobile menu.** In the `mobileMenuOpen` block's `<nav>`, add (before or after the "Become a Brusader" mobile link):
```tsx
<Link href={membersHref} onClick={() => setMobileMenuOpen(false)} className="border border-accent/50 text-accent text-center font-medium px-5 py-3 rounded-full mt-2">
  {membersLabel}
</Link>
```

- [ ] **Step 4: Hero CTA.** In the hero section (around the `<h1>` at line ~210, wherever the hero's action buttons are), add a prominent Members button alongside the existing hero CTA(s):
```tsx
<Link href={membersHref} className="inline-flex bg-accent hover:bg-accent-hover text-background font-semibold px-6 py-3 rounded-full transition-colors">
  {membersLabel}
</Link>
```
(Place it with the existing hero CTA buttons; match their layout/wrapper. If the hero has a button row, add it there; if not, add it right after the hero subtext.)

- [ ] **Step 5: Verify.** `npx tsc --noEmit` clean; `npm run build` (`/` compiles). Reason through: logged-out visitor sees "Member Login" → /login in header + mobile + hero; logged-in sees "Members Area" → /members. No server-only import added to the client page.

- [ ] **Step 6: Commit.** `git add src/app/page.tsx && git commit -m "feat(home): session-aware Members Area / Member Login CTA (header, mobile, hero)"`

---

## Final verification
- `npx tsc --noEmit` clean; `npx vitest run` green (no test changes; existing 104); `npm run build` compiles, all routes present.
- **The fix:** exactly ONE header on `/`, `/login`, `/bot` (their own); SiteHeader still present on all `/members/*`. Homepage has a Members Area/Login button in header + mobile menu + hero.
- Manual post-deploy: load `/` logged-OUT on mobile → one hamburger, one logo, "Member Login" button; log in, load `/` on mobile → still one hamburger/logo, button now says "Members Area" → /members; visit /members → SiteHeader present as before.
