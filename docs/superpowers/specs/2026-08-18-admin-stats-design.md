# In-Admin Site Stats (custom aggregate counter) — Design

**Date:** 2026-08-18
**Status:** Approved (design) → plan → build

## Problem

The user wants to see, inside the members admin portal (not the Vercel dashboard), how much the site is used: (1) hits to the **main/public site**, and (2) how many people **access member features**. Vercel Analytics is live but its data is only in Vercel's dashboard and its API is paid (Pro). We want a free, self-owned view any board member can see.

## Decisions (settled with user)

- **Source:** custom DB counter (not the paid Vercel Analytics API). Vercel Analytics stays for the pretty public dashboard; this is the in-site board view.
- **Detail:** **aggregate only** — per-day counts + distinct-active-member counts. No per-person browsing history / no "who viewed what" (these are friends).
- **Location:** a new board-only page `/members/admin/stats` + a card on the admin hub.

## Why not middleware

The existing `src/middleware.ts` matches only `/members/:path*` (Node runtime, pulls in auth+Prisma). Broadening its matcher to the public site would run the heavy auth middleware on every public page — bad tradeoff. So counting happens via a lightweight **beacon** from the root layout instead, which runs on all routes.

## Architecture

### 1. Schema (two small aggregate tables)
```
model PageViewDay {
  id       String @id @default(cuid())
  day      String   // 'YYYY-MM-DD' (UTC)
  area     String   // 'public' | 'members'
  count    Int    @default(0)
  @@unique([day, area])
  @@index([day])
}

model MemberActiveDay {
  id       String @id @default(cuid())
  day      String   // 'YYYY-MM-DD'
  memberId String
  @@unique([day, memberId])   // one row per member per day → distinct count = row count
  @@index([day])
}
```
- `PageViewDay`: total hits per day split into `public` vs `members` areas — directly answers "main-site hits" vs "member-feature hits".
- `MemberActiveDay`: idempotent per-(day, member) upsert → counting rows per day gives **distinct active members**, which Vercel Analytics can't do. No path, no timestamp, no history — privacy-safe.

`prisma db push` + `generate` (house convention).

### 2. Recorder (`src/lib/stats/record.ts`) — pure classification + thin write
- `classifyArea(pathname: string): 'members' | 'public' | null` — **pure, TDD.** `/members/*` → `members`; `/`, `/join`, `/bot`, `/board`, `/code-of-conduct`, etc. → `public`; **excluded** (return null → not counted): `/api/*`, `/login`, `/_next/*`, static assets, and the stats beacon route itself (avoid self-counting).
- `todayUtc(now: Date): string` — pure, `YYYY-MM-DD`.
- `recordView(pathname, memberId, deps): Promise<void>` — classify; if null area, no-op. Upsert `PageViewDay` (`{day,area}` → increment count). If `memberId` present, upsert `MemberActiveDay` (`{day,memberId}` — idempotent). Fully DI (`db`, `now`); fail-soft (never throw into the request path).

### 3. Beacon route (`src/app/api/stats/route.ts`)
- `POST` — reads `pathname` from the body, resolves `memberId` from the session via `auth()` (null if not signed in), calls `recordView`. Returns 204 fast. `dynamic='force-dynamic'`, Node runtime (needs auth/Prisma). Rate-consideration: it's one tiny upsert per navigation; fine for club volume. Fail-soft: any error → still 204 (never surface to the user).

### 4. Client beacon (`src/components/StatsBeacon.tsx`, in root layout)
- `'use client'`; on mount + on pathname change (`usePathname`), `fetch('/api/stats', {method:'POST', body: JSON.stringify({pathname}), keepalive:true})`. Fire-and-forget; swallow errors. Placed in root layout so it runs on **every** route (public + members). No PII sent — just the pathname; the server derives area + member from the session.

### 5. Stats query (`src/lib/stats/query.ts`)
- `getStats(deps): Promise<StatsView>` — returns, for the last N days (e.g. 30):
  - `publicViews` / `memberViews` totals + per-day series
  - `distinctMembers` per day (count of `MemberActiveDay` rows) + total distinct over the window
  - simple totals for headline numbers
- DI (`db`, `now`); pure aggregation over the two tables.

### 6. Admin stats page (`src/app/members/admin/stats/page.tsx`) + hub card
- Board-gated (`auth()` → redirect if `!isBoard`), `dynamic='force-dynamic'`.
- Uses the System-B shell: `PageHeader`, `SectionLabel`, `Card`/`InfoCard`. Headline `InfoCard`s: "Main-site views (30d)", "Member-feature views (30d)", "Distinct active members (30d)". A simple per-day list/bars (no chart lib — keep it dependency-free; a lightweight inline bar with div widths).
- Add a `Card` to the admin hub (`/members/admin`) linking to it, with a badge of today's total.

## Error handling / privacy

- **Fail-soft counting:** the beacon route and `recordView` never throw into a user request; a stats failure never affects page loads.
- **No history:** we store counts and (day, member) presence — never a per-visit log, never a path-per-member. Can't reconstruct anyone's browsing.
- **No self-counting:** `/api/stats` and other excluded paths return null area.
- **Idempotent member-active:** re-posting the same member on the same day is a no-op (unique constraint).

## Testing

- `classifyArea` — table: `/members/x`→members, `/`→public, `/join`→public, `/api/x`→null, `/login`→null, `/_next/x`→null, `/api/stats`→null. (TDD, pure.)
- `todayUtc` — fixed Date → 'YYYY-MM-DD'.
- `recordView` — fake db: public path increments PageViewDay(public); members path w/ memberId increments PageViewDay(members) + upserts MemberActiveDay; null area → no writes; no memberId → no MemberActiveDay.
- `getStats` — fake db rows → correct totals/series/distinct counts.
- Existing tests stay green; `tsc` + `next build` clean.

## Out of scope (YAGNI)

- Per-page breakdown in the UI (we store per-area; per-path could be added later — start with area-level, which answers the two questions).
- Charts library (inline bars only).
- Referrers/devices/geo (that's what Vercel Analytics is for).
- Real-time / historical beyond the window.
