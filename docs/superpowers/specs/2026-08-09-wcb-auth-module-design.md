# WCB Shared Auth Module — Design

**Date:** 2026-08-09
**Status:** Approved (brainstorming) → ready for implementation plan
**Scope:** `wcb_site` (new members-hub) — the authentication foundation. Google-free, roster-gated, email-code login.

## Problem

WCB (Wake County Brusaders) wants a members-only web hub (library, equipment loans, discount codes, Drive docs — each a later spec). Every such feature needs one thing first: **member identity + login**. Today:

- The public site (`wcb_site`, Next.js 16 on Vercel) has **no auth and no backend** — pure static marketing.
- The LMS (`WCB Brewing Academy`) has real auth (NextAuth + Postgres/Prisma, roster-gated) but it is **Google-login only** (`signIn('google')`) — a member with no Google account, or who won't sign in with Google, **cannot log in**. This is the pain to escape.
- The canonical roster is a Google Sheet ("Member Roster", `Sheet1`) with member emails and a `Current` flag.

**Goal:** a **shared WCB auth module** — email-code login gated by the roster — used by the new hub now, and designed so the LMS can adopt it later (LMS cutover is a separate future spec; not touched here). Zero Google dependency in the auth path.

## Out of scope (follow-on specs)

- The member-facing features themselves (library, equipment loans, discount codes, Drive-doc browsing).
- Migrating the **LMS** onto this auth module.
- Reworking **Drive doc sharing** to not require a per-member Gmail (a real future goal, solvable later via Workspace Business service-account proxying — enabled *by* this module giving members a non-Google identity, but not part of it).
- Any Microsoft/Workspace migration (explicitly rejected — Workspace stays as WCB's internal collab/recording tool; it is not the member front door).

## Key decisions (locked in brainstorming)

- **Approach:** NextAuth (Auth.js) with a net-new **email-OTP (6-digit code)** provider + a roster-gate `signIn` callback. **No Google provider.** Chosen over hand-rolling for battle-tested session/cookie/CSRF handling ("this needs to work well"), and because the LMS already runs NextAuth so the eventual shared-module story is real.
- **Identity = email.** Kills the Google-lockout. `Google Email` is still *matched* as an accepted login address (it is just an email string in the roster) but Google is never *invoked* — no OAuth. Google email keeps its real job (Drive sharing) as a separate concern.
- **DB:** new **Fly Postgres + Prisma** (the LMS's proven pattern). NOT Supabase free tier — it pauses after 7 days idle, unacceptable for a members' login.
- **Email sender:** **Resend**.
- **Gate rule:** entered email valid **iff** it matches `Email Address` OR `Google Email` on a `Sheet1` row where **`Current` = true**. Partner columns (`Partner Email`, `Partner Google Email`) are **ignored for auth** — partners have their own rows; partner columns only link two members as a couple (future read-only nicety).
- **Active = `Current` flag alone.** Do NOT also enforce `Expires` at login (sheet maintainer owns the flag; belt-and-suspenders risks locking out someone the club considers active).
- **Lapse handling = periodic sync (HARD REQUIREMENT).** A scheduled roster sync is the SOLE mechanism that deactivates lapsed members in the DB. Without it, a member who lapses keeps DB `current=true` and retains access indefinitely. Default cadence: **every 15 min** (= the lapse-detection window; fine at club scale).
- **New-signup freshness = live-Sheet fallback on DB miss.** Existing members use the fast DB path; a brand-new member not yet synced triggers a single live Sheet read so they get in immediately.
- **Fail-closed.** On any doubt (Sheet unreachable during fallback, ambiguous state) → deny the attempt. A Google/Sheets outage never blocks *existing* members (they are on the DB fast path).

## Architecture

```
Member ──► WCB Hub (Next.js 16, Vercel)
             NextAuth (Auth.js) — email-OTP, NO Google
             ├─ enter email → roster-gate → member? Resend emails 6-digit code
             ├─ enter code  → NextAuth verifies → signed session cookie
             └─ /members/* gated by middleware
                 │
                 ▼
            Fly Postgres (Prisma)
              • Member  (synced from Sheet1)
              • NextAuth tables (sessions, verification codes)
                 ▲
                 │ scheduled sync every ~15 min (server reads Sheet1 read-only via existing WCB refresh-token creds — backend chore, NOT member login)
            Google Sheet "Member Roster" / Sheet1  ◄── single live read on DB cache-miss (new-signup)
```

Logins depend on **Postgres** (fast, always-up on Fly), not on live Google. Google/Sheets is touched only by the background sync and the rare new-member fallback.

## Components (four bounded units)

### ① `isCurrentMember(email)` — the roster-gate function (linchpin, framework-free)

- **Signature:** `isCurrentMember(email: string) → { ok: false } | { ok: true, member: Member }`
- **Logic:**
  1. Normalize email (lowercase, trim).
  2. Query Postgres `Member` where `current = true` AND (`emailAddress = X` OR `googleEmail = X`). Hit → return member (fast path).
  3. Miss → single live `Sheet1` read for that email: found + `Current=true` → upsert into `Member`, return member; else `{ ok: false }`.
  4. Sheet unreachable during step 3 → `{ ok: false }` (fail-closed).
- **Depends on:** Prisma (`Member`), the Sheets reader (fallback only). **No auth imports.** ← the seam the LMS reuses.

### ② `syncRoster()` — periodic roster sync (framework-free)

- **Signature:** `syncRoster() → { synced: number, deactivated: number }`
- **Logic:** read all of `Sheet1` → upsert each row into `Member` (emails, `current`, tier, board flag, partner link, etc.); rows absent from the sheet or with `Current=false` → set `current = false`. Idempotent.
- **Invocation:** Vercel Cron every ~15 min; also manually triggerable (admin action / CLI) for "just added someone, sync now."
- **Depends on:** Sheets reader + Prisma. **No auth imports.**
- **Roster read = server-side only, reuses the EXISTING WCB refresh-token creds** (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` — the same token the LMS + bot already use to read Sheet1), read-only via the Google Sheets API. NOT a service account (too much setup), NOT the published-CSV route (roster is PII — no public URL). **This is a backend spreadsheet read, NOT interactive Google OAuth and NOT member login** — members never touch Google. Copy the 3 env vars into the hub; zero new Google setup.

### ③ Auth config — NextAuth (Auth.js) email-OTP

- Email provider configured for **6-digit code** (not magic-link); `sendVerificationRequest` sends via **Resend**.
- `signIn` callback → `isCurrentMember(email)`; `{ok:false}` → reject (show "not on roster" message).
- `session` callback → session carries `{ memberId, email, tier, isBoard }`.
- Standard exports `handlers, auth, signIn, signOut` + `/api/auth/[...nextauth]`.
- **No Google provider.** Depends on ①, Resend, Prisma (NextAuth session/verification tables).

### ④ Route protection — middleware + members shell

- `middleware.ts` gates `/members/*` (and future feature routes) — no session → redirect `/login`.
- `auth()` helper any page/API calls to get the current member.
- A minimal `/members` landing page proves login works.

**Reuse story:** ① and ② are a plain library with no Next.js/NextAuth imports. The LMS later imports the same ① and ② and swaps its Google provider for ③'s email-OTP config. Only the tiny NextAuth wiring is per-app; the `Member` shape + sync are identical. (Whether hub and LMS share one `Member` table or each sync their own is a later decision, not blocking Spec 1 — the hub owns its own copy for now.)

## Data model (Prisma, new)

`Member` — synced from `Sheet1`:
- `id`, `emailAddress` (unique, normalized), `googleEmail` (nullable, normalized), `name`, `tier`, `current` (bool), `isBoard` (bool), `partnerEmail` (nullable — link only), `expires` (date, stored for reference, NOT used at login), `updatedAt`.
- Lookups index `emailAddress` and `googleEmail`.

NextAuth's own tables (verification codes, sessions) per its Prisma adapter.

## Data flow

**Login (happy path):** unauthenticated → `/login` → enter email → `isCurrentMember` (DB hit, or DB-miss→live-fallback) → if member: NextAuth stores a **hashed**, single-use, ~10-min-TTL code → Resend emails it → member enters code → verified → signed session cookie (~30-day sliding) → `/members`.

**Returning member:** valid session cookie → middleware passes through, no email/code until expiry.

**Sync (background):** Vercel Cron ~15 min → `syncRoster()` → upsert/deactivate. Manual trigger available.

**Failure paths:** Resend send fails → "couldn't send code, try again," no session. Sheet unreachable on fallback → deny attempt (fail-closed); scheduled sync recovers the member shortly. Existing members unaffected by Google outages (DB fast path).

## Error handling & security

- **Not a current member:** clear message ("This email isn't on the active WCB roster — use the email tied to your membership, or contact an officer"). No code sent, no session.
- **Wrong/expired/reused code:** generic "invalid or expired code, request a new one." Codes single-use, ~10-min TTL, **stored hashed**, invalidated on use.
- **Rate-limiting** on request-code endpoint (per-email + per-IP) — prevents Sheet-quota burn on repeated non-member attempts and inbox spam. Cap e.g. a few requests per email per 15 min.
- **Sessions:** NextAuth signed cookies (HttpOnly, Secure, SameSite), `NEXTAUTH_SECRET`, ~30-day sliding expiry.
- **No leaks:** no code-validity/timing enumeration. The honest "not on roster" message is acceptable in club context.
- **Secrets** (`DATABASE_URL`, `RESEND_API_KEY`, Google service creds, `NEXTAUTH_SECRET`) via env only, never committed.
- **Google service creds** used only server-side by the sync (read-only roster) — never in the browser, never in the auth path.

## Testing (TDD)

- **`isCurrentMember` (framework-free) unit tests:** DB hit (current); DB hit (lapsed → deny); DB miss → live-fallback → current (upsert + allow); miss → fallback → lapsed (deny); miss → fallback → stranger (deny); email normalization (case/whitespace); match on `googleEmail`; fail-closed on Sheet error. Mock Prisma + Sheet reads.
- **`syncRoster` unit tests:** new-row upsert; flipped `current` deactivates; departed row deactivates; idempotent re-run.
- **Auth callback tests:** `signIn` proceeds for member / rejects non-member; session carries `{ memberId, tier, isBoard }`.
- **Rate-limit test:** N+1 code requests in window → blocked.
- **Manual E2E once (real Resend, test email):** email → receive code → enter → land `/members`; lapsed test-email → denied.

## Success criteria

- A current member with ANY email on `Sheet1` (`Email Address` or `Google Email`, `Current=true`) can log in with a code — **no Google account required**.
- A lapsed member is denied after the next sync; a non-member is always denied.
- A brand-new member (just added to the sheet) can log in immediately via the live-fallback.
- Member login does not depend on live Google availability.
- `isCurrentMember` and `syncRoster` are framework-free and unit-tested → directly reusable by the LMS later.
- No Google provider anywhere in the auth path.
