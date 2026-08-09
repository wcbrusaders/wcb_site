# WCB Shared Auth Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Google-free, roster-gated, email-code (OTP) login to the `wcb_site` members-hub (Next.js 16), backed by Fly Postgres + Prisma, with a periodic roster sync from the existing Member Roster Google Sheet.

**Architecture:** NextAuth (Auth.js v5) email-OTP provider — NO Google provider. A framework-free `isCurrentMember(email)` gate (Postgres fast-path + live-Sheet fallback on miss) is called from NextAuth's `signIn` callback. A framework-free `syncRoster()` upserts Sheet1 → Postgres `Member` on a Vercel Cron schedule (this is the ONLY mechanism that deactivates lapsed members). Resend sends the code. Middleware gates `/members/*`.

**Tech Stack:** Next.js 16 (App Router, TypeScript), React 19, Tailwind v4, NextAuth/Auth.js v5 (`next-auth@beta`) with `@auth/prisma-adapter`, Prisma 6 + `@prisma/client`, `googleapis` (roster read, reuse pattern from LMS `src/lib/sheets.ts`), Resend, Fly Postgres. Deployed on Vercel.

**Spec:** `docs/superpowers/specs/2026-08-09-wcb-auth-module-design.md`

**Reference implementation to adapt:** `C:\Users\jordan\Code\LMS\src\lib\sheets.ts` (existing WCB roster read: `syncMemberRoster`, `fetchMemberRosterFromSheets`, `isAuthorizedMember`, fail-closed pattern, `DEV_ALLOWED_EMAILS` bypass). Our version extends the `Member` model and ADDS a live-Sheet fallback the LMS lacks.

## Global Constraints

- **NO Google auth provider anywhere.** Member login is email-code only. Google API is used ONLY server-side to read the roster sheet (a backend chore), never in the member login path, never in the browser.
- **Identity = normalized email** (lowercase + trim) everywhere. All email comparisons normalize first.
- **Gate rule:** an email is a valid member IFF it equals `emailAddress` OR `googleEmail` on a `Member` row where `current = true`. Partner columns are NEVER used for auth.
- **Active = `current` flag ONLY.** Do NOT check `expires` at login (it is stored for reference only).
- **Fail-closed:** on any error/doubt (Sheet unreachable, exception) → deny the login attempt. Never fail-open.
- **Periodic sync is load-bearing:** it is the sole mechanism that flips lapsed members to `current=false`. It MUST be scheduled (Vercel Cron, default every 15 min).
- **Roster read reuses existing WCB refresh-token creds** — env vars `MEMBER_ROSTER_SHEET_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` (same values the LMS/bot use). Read-only. No service account.
- **Secrets via env only**, never committed: `DATABASE_URL`, `NEXTAUTH_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, the 4 Google vars above, optional `CRON_SECRET`, optional `DEV_ALLOWED_EMAILS`.
- **Node/TS:** project uses Next 16 + TS 5 + ESM. Match existing style (2-space indent, no semicolons? — check `src/app/page.tsx` and follow it).
- **Testing:** framework-free units (`isCurrentMember`, `syncRoster`, roster row-mapping, email normalization) get real unit tests (Vitest). NextAuth wiring gets lighter callback tests + one manual E2E.

## File Structure

- **Create** `prisma/schema.prisma` — `Member` model + NextAuth adapter models (User/Account/Session/VerificationToken).
- **Create** `src/lib/db.ts` — Prisma client singleton (standard Next.js pattern).
- **Create** `src/lib/roster.ts` — framework-free: `MemberRecord` type, `normalizeEmail()`, `isCurrentMember()`, `syncRoster()`, and the Google Sheets reader helpers (adapted from LMS `sheets.ts`). NO next-auth imports.
- **Create** `src/lib/roster.test.ts` — Vitest units for roster.ts (mock Prisma + Sheets reader).
- **Create** `src/lib/auth.ts` — NextAuth v5 config: email-OTP provider, Prisma adapter, `signIn`/`session` callbacks, exports `handlers, auth, signIn, signOut`.
- **Create** `src/lib/auth.test.ts` — Vitest tests for the `signIn`/`session` callback logic (member allowed / non-member rejected / session shape).
- **Create** `src/lib/email.ts` — Resend send-code helper (`sendLoginCode(email, code)`).
- **Create** `src/lib/ratelimit.ts` — simple per-email+per-IP limiter for the request-code endpoint.
- **Create** `src/app/api/auth/[...nextauth]/route.ts` — NextAuth route handlers.
- **Create** `src/app/api/cron/sync-roster/route.ts` — Cron endpoint calling `syncRoster()`, guarded by `CRON_SECRET`.
- **Create** `src/app/login/page.tsx` — email + code entry UI.
- **Create** `src/app/members/page.tsx` — minimal gated landing (proves login).
- **Create** `src/middleware.ts` — gate `/members/*`.
- **Create** `vercel.json` cron entry (edit existing `vercel.json`).
- **Modify** `package.json` — deps + `db:*` scripts + `test` script.
- **Create** `.env.example` — document all env vars (no real values).
- **Create** `vitest.config.ts`.

---

### Task 1: Project deps + tooling (Prisma, NextAuth, Resend, Vitest)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `.env.example`

**Interfaces:**
- Produces: installed deps + npm scripts `db:generate`, `db:push`, `db:studio`, `test`; a Vitest config; an env template.

- [ ] **Step 1: Add dependencies**

Add to `package.json` dependencies:
```json
"next-auth": "5.0.0-beta.29",
"@auth/prisma-adapter": "^2.7.4",
"@prisma/client": "^6.19.0",
"googleapis": "^166.0.0",
"resend": "^4.0.0"
```
Add to devDependencies:
```json
"prisma": "^6.19.0",
"vitest": "^2.1.0",
"@vitest/coverage-v8": "^2.1.0"
```
Add scripts:
```json
"db:generate": "prisma generate",
"db:push": "prisma db push",
"db:studio": "prisma studio",
"test": "vitest run",
"test:watch": "vitest"
```
Run: `npm install`

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Create `.env.example`** (document names only, NO values)

```
# --- Database (Fly Postgres) ---
DATABASE_URL=

# --- NextAuth (Auth.js v5) ---
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# --- Resend (login code email) ---
RESEND_API_KEY=
RESEND_FROM="WCB <noreply@wcbrusaders.com>"

# --- Member Roster read (REUSE the existing WCB refresh-token creds from LMS/bot) ---
MEMBER_ROSTER_SHEET_ID=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=

# --- Cron guard for the roster sync endpoint ---
CRON_SECRET=

# --- Optional dev bypass (comma-separated emails that skip the roster check) ---
DEV_ALLOWED_EMAILS=
```

- [ ] **Step 4: Verify** — `npm run test` exits 0 (no tests yet is fine, or "no test files" — acceptable). `npx prisma --version` prints a version.

- [ ] **Step 5: Commit**
```bash
git add package.json package-lock.json vitest.config.ts .env.example
git commit -m "chore(hub): add auth/db/test deps + env template"
```

---

### Task 2: Prisma schema — `Member` + NextAuth models

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/db.ts`

**Interfaces:**
- Produces: a Prisma `Member` model with fields `id, emailAddress (unique), googleEmail (nullable), name, tier, current (bool), isBoard (bool), partnerEmail (nullable), expires (nullable DateTime), updatedAt`; NextAuth adapter models; `prisma` client singleton exported from `src/lib/db.ts`.

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Member {
  id           String    @id @default(cuid())
  emailAddress String    @unique
  googleEmail  String?
  name         String?
  tier         String?
  current      Boolean   @default(false)
  isBoard      Boolean   @default(false)
  partnerEmail String?
  expires      DateTime?
  updatedAt    DateTime  @updatedAt

  @@index([emailAddress])
  @@index([googleEmail])
}

// --- NextAuth (Auth.js) Prisma adapter models ---
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified DateTime?
  name          String?
  sessions      Session[]
  accounts      Account[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime
  @@unique([identifier, token])
}
```

- [ ] **Step 2: Write `src/lib/db.ts`** (Prisma singleton — avoids exhausting connections in dev hot-reload)

```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 3: Generate client** — `npm run db:generate`. Expected: succeeds, produces `@prisma/client` types.

- [ ] **Step 4: Verify** — `npx tsc --noEmit` passes (imports resolve). DB push is deferred to Task 8 (needs the live Fly DB). For now generation-only is enough.

- [ ] **Step 5: Commit**
```bash
git add prisma/schema.prisma src/lib/db.ts
git commit -m "feat(hub): Prisma schema (Member + NextAuth models) + client singleton"
```

---

### Task 3: `roster.ts` — email normalization + types (framework-free)

**Files:**
- Create: `src/lib/roster.ts`
- Create: `src/lib/roster.test.ts`

**Interfaces:**
- Produces:
  - `normalizeEmail(email: string): string` — `email.trim().toLowerCase()`.
  - `type MemberRecord = { emailAddress: string; googleEmail: string | null; name: string | null; tier: string | null; current: boolean; isBoard: boolean; partnerEmail: string | null; expires: Date | null }`
  - `type GateResult = { ok: false } | { ok: true; member: MemberRecord }`

- [ ] **Step 1: Write the failing test**
```ts
// src/lib/roster.test.ts
import { test, expect } from 'vitest'
import { normalizeEmail } from './roster'

test('normalizeEmail lowercases and trims', () => {
  expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com')
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run src/lib/roster.test.ts`
Expected: FAIL — `normalizeEmail` not exported / module missing.

- [ ] **Step 3: Write minimal implementation**
```ts
// src/lib/roster.ts
export type MemberRecord = {
  emailAddress: string
  googleEmail: string | null
  name: string | null
  tier: string | null
  current: boolean
  isBoard: boolean
  partnerEmail: string | null
  expires: Date | null
}

export type GateResult = { ok: false } | { ok: true; member: MemberRecord }

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run src/lib/roster.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/roster.ts src/lib/roster.test.ts
git commit -m "feat(hub): roster types + email normalization"
```

---

### Task 4: Sheet1 row → MemberRecord mapping (framework-free, pure)

**Files:**
- Modify: `src/lib/roster.ts`
- Modify: `src/lib/roster.test.ts`

**Interfaces:**
- Consumes: `normalizeEmail`, `MemberRecord` (Task 3).
- Produces: `mapSheetRow(headers: string[], row: string[]): MemberRecord | null` — maps a Sheet1 row (by header name) to a `MemberRecord`; returns `null` if the row has no `Email Address`. Column names per the real sheet: `Name, Tier, Email Address, Expires, Current, Google Email, Partner Email, Board Member`. `current` parses truthy strings ("true"/"yes"/"y"/"1"/"x"/"current", case-insensitive) → true. `isBoard` parses the `Board Member` column the same way. `expires` parses a date or null.

- [ ] **Step 1: Write the failing test**
```ts
// append to src/lib/roster.test.ts
import { mapSheetRow } from './roster'

const HEADERS = ['Name','Tier','Email Address','Expires','Current','Google Email','Partner Email','Board Member']

test('mapSheetRow maps a current member with google email', () => {
  const row = ['Jane Doe','Full','Jane@Example.com','2027-01-01','TRUE','jane.g@gmail.com','partner@x.com','No']
  const m = mapSheetRow(HEADERS, row)!
  expect(m.emailAddress).toBe('jane@example.com')      // normalized
  expect(m.googleEmail).toBe('jane.g@gmail.com')
  expect(m.current).toBe(true)
  expect(m.isBoard).toBe(false)
  expect(m.partnerEmail).toBe('partner@x.com')
  expect(m.name).toBe('Jane Doe')
})

test('mapSheetRow marks non-current member', () => {
  const row = ['Bob','Full','bob@x.com','2020-01-01','FALSE','','','No']
  expect(mapSheetRow(HEADERS, row)!.current).toBe(false)
})

test('mapSheetRow returns null when no email', () => {
  const row = ['NoEmail','Full','','','TRUE','','','No']
  expect(mapSheetRow(HEADERS, row)).toBeNull()
})

test('mapSheetRow parses board member true', () => {
  const row = ['Chair','Full','chair@x.com','2027-01-01','yes','','','Yes']
  expect(mapSheetRow(HEADERS, row)!.isBoard).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run src/lib/roster.test.ts`
Expected: FAIL — `mapSheetRow` not defined.

- [ ] **Step 3: Write minimal implementation** (add to `roster.ts`)
```ts
function truthy(v: string | undefined): boolean {
  if (!v) return false
  return ['true','yes','y','1','x','current'].includes(v.trim().toLowerCase())
}

function cell(headers: string[], row: string[], name: string): string {
  const i = headers.indexOf(name)
  return i >= 0 ? (row[i] ?? '').trim() : ''
}

export function mapSheetRow(headers: string[], row: string[]): MemberRecord | null {
  const email = cell(headers, row, 'Email Address')
  if (!email) return null
  const g = cell(headers, row, 'Google Email')
  const p = cell(headers, row, 'Partner Email')
  const exp = cell(headers, row, 'Expires')
  const expires = exp ? new Date(exp) : null
  return {
    emailAddress: normalizeEmail(email),
    googleEmail: g ? normalizeEmail(g) : null,
    name: cell(headers, row, 'Name') || null,
    tier: cell(headers, row, 'Tier') || null,
    current: truthy(cell(headers, row, 'Current')),
    isBoard: truthy(cell(headers, row, 'Board Member')),
    partnerEmail: p ? normalizeEmail(p) : null,
    expires: expires && !isNaN(expires.getTime()) ? expires : null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run src/lib/roster.test.ts`
Expected: PASS (5 tests total).

- [ ] **Step 5: Commit**
```bash
git add src/lib/roster.ts src/lib/roster.test.ts
git commit -m "feat(hub): pure Sheet1 row -> MemberRecord mapping"
```

---

### Task 5: Google Sheets reader (server-side, reuses existing WCB creds)

**Files:**
- Modify: `src/lib/roster.ts`

**Interfaces:**
- Consumes: `mapSheetRow`, `MemberRecord`.
- Produces:
  - `fetchAllRosterRows(): Promise<MemberRecord[]>` — reads all of Sheet1 via googleapis + refresh token, maps each row, drops nulls.
  - `fetchRosterRowByEmail(email: string): Promise<MemberRecord | null>` — reads Sheet1, returns the first row whose `emailAddress` or `googleEmail` matches (normalized). Used by the live-fallback. (Simplest correct impl: reuse `fetchAllRosterRows` then find; optimize later only if needed.)
  - Internal `sheetsClient()` builds an authenticated Sheets client from `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`.

**NOTE:** adapt from `LMS/src/lib/sheets.ts` (`fetchMemberRosterFromSheets`). This is a SERVER read only — never import into client components. No unit test here (it hits Google); it is exercised via mocking in Task 6/7 and the manual E2E in Task 8.

- [ ] **Step 1: Implement** (add to `roster.ts`)
```ts
import { google } from 'googleapis'

const SHEET_ID = process.env.MEMBER_ROSTER_SHEET_ID
const TAB = 'Sheet1'

function sheetsClient() {
  const oauth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  oauth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.sheets({ version: 'v4', auth: oauth })
}

export async function fetchAllRosterRows(): Promise<MemberRecord[]> {
  if (!SHEET_ID) throw new Error('MEMBER_ROSTER_SHEET_ID not set')
  const sheets = sheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: TAB,
  })
  const values = res.data.values ?? []
  if (values.length < 2) return []
  const headers = values[0].map((h) => String(h).trim())
  return values.slice(1)
    .map((r) => mapSheetRow(headers, r.map((c) => String(c ?? ''))))
    .filter((m): m is MemberRecord => m !== null)
}

export async function fetchRosterRowByEmail(email: string): Promise<MemberRecord | null> {
  const target = normalizeEmail(email)
  const rows = await fetchAllRosterRows()
  return rows.find((m) => m.emailAddress === target || m.googleEmail === target) ?? null
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` passes.

- [ ] **Step 3: Commit**
```bash
git add src/lib/roster.ts
git commit -m "feat(hub): server-side Sheet1 reader (reuse WCB refresh-token creds, read-only)"
```

---

### Task 6: `syncRoster()` — upsert Sheet1 into Postgres (framework-free)

**Files:**
- Modify: `src/lib/roster.ts`
- Modify: `src/lib/roster.test.ts`

**Interfaces:**
- Consumes: `fetchAllRosterRows`, `prisma` (from `src/lib/db.ts`).
- Produces: `syncRoster(deps?): Promise<{ synced: number; deactivated: number }>` — upserts every fetched row into `Member` (by `emailAddress`), then sets `current=false` for any `Member` whose email is NOT in the fetched set. `deps` param allows injecting `{ fetchAll, db }` for testing (default to the real ones).

- [ ] **Step 1: Write the failing test** (inject fakes — no real Google/DB)
```ts
// append to src/lib/roster.test.ts
import { syncRoster } from './roster'

test('syncRoster upserts fetched rows and deactivates absent members', async () => {
  const fetched = [
    { emailAddress: 'a@x.com', googleEmail: null, name: 'A', tier: null, current: true, isBoard: false, partnerEmail: null, expires: null },
    { emailAddress: 'b@x.com', googleEmail: null, name: 'B', tier: null, current: false, isBoard: false, partnerEmail: null, expires: null },
  ]
  const upserts: string[] = []
  const deactivated: string[] = []
  const db = {
    member: {
      upsert: async ({ where }: any) => { upserts.push(where.emailAddress); },
      updateMany: async ({ where }: any) => {
        // emails NOT in fetched -> deactivate. simulate 'c@x.com' existed.
        deactivated.push('c@x.com'); return { count: 1 }
      },
      findMany: async () => [{ emailAddress: 'c@x.com' }],
    },
  }
  const res = await syncRoster({ fetchAll: async () => fetched, db: db as any })
  expect(upserts).toEqual(['a@x.com','b@x.com'])
  expect(res.synced).toBe(2)
  expect(res.deactivated).toBe(1)
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run src/lib/roster.test.ts`
Expected: FAIL — `syncRoster` not defined.

- [ ] **Step 3: Write minimal implementation** (add to `roster.ts`)
```ts
import { prisma } from './db'

type SyncDeps = {
  fetchAll?: () => Promise<MemberRecord[]>
  db?: typeof prisma
}

export async function syncRoster(deps: SyncDeps = {}): Promise<{ synced: number; deactivated: number }> {
  const fetchAll = deps.fetchAll ?? fetchAllRosterRows
  const db = deps.db ?? prisma
  const rows = await fetchAll()
  let synced = 0
  const seen = new Set<string>()
  for (const m of rows) {
    await db.member.upsert({
      where: { emailAddress: m.emailAddress },
      update: { googleEmail: m.googleEmail, name: m.name, tier: m.tier, current: m.current, isBoard: m.isBoard, partnerEmail: m.partnerEmail, expires: m.expires },
      create: { emailAddress: m.emailAddress, googleEmail: m.googleEmail, name: m.name, tier: m.tier, current: m.current, isBoard: m.isBoard, partnerEmail: m.partnerEmail, expires: m.expires },
    })
    seen.add(m.emailAddress)
    synced++
  }
  const existing = await db.member.findMany({ select: { emailAddress: true } })
  const toDeactivate = existing.map((e) => e.emailAddress).filter((e) => !seen.has(e))
  let deactivated = 0
  if (toDeactivate.length) {
    const r = await db.member.updateMany({ where: { emailAddress: { in: toDeactivate }, current: true }, data: { current: false } })
    deactivated = r.count
  }
  return { synced, deactivated }
}
```
(The injected-fake test asserts behavior; adjust the fake to match this final shape if needed — the intent is: upsert each fetched row, deactivate members absent from the fetch.)

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run src/lib/roster.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/roster.ts src/lib/roster.test.ts
git commit -m "feat(hub): syncRoster upsert + deactivate-absent (framework-free)"
```

---

### Task 7: `isCurrentMember()` — the gate (DB fast-path + live-Sheet fallback, fail-closed)

**Files:**
- Modify: `src/lib/roster.ts`
- Modify: `src/lib/roster.test.ts`

**Interfaces:**
- Consumes: `normalizeEmail`, `prisma`, `fetchRosterRowByEmail`, `GateResult`, `MemberRecord`.
- Produces: `isCurrentMember(email: string, deps?): Promise<GateResult>`.
  - Logic: normalize → query `Member` where `current=true` AND (`emailAddress=X` OR `googleEmail=X`). Hit → `{ok:true, member}`. Miss → `fetchRosterRowByEmail(X)`; if found AND `current` → upsert into `Member` → `{ok:true, member}`; else `{ok:false}`. Any thrown error → `{ok:false}` (fail-closed).
  - Optional `DEV_ALLOWED_EMAILS` bypass → `{ok:true, member: <synthetic>}` (dev only).
  - `deps` injects `{ db, fetchByEmail }` for tests.

- [ ] **Step 1: Write the failing tests**
```ts
// append to src/lib/roster.test.ts
import { isCurrentMember } from './roster'

const M = (over = {}) => ({ emailAddress: 'a@x.com', googleEmail: null, name: 'A', tier: null, current: true, isBoard: false, partnerEmail: null, expires: null, ...over })

function fakeDb(row: any) {
  return { member: {
    findFirst: async () => row,
    upsert: async () => {},
  } } as any
}

test('DB hit (current) allows', async () => {
  const r = await isCurrentMember('A@X.com', { db: fakeDb(M()), fetchByEmail: async () => null })
  expect(r.ok).toBe(true)
})

test('DB miss + live fallback finds current -> allow', async () => {
  const r = await isCurrentMember('new@x.com', { db: fakeDb(null), fetchByEmail: async () => M({ emailAddress: 'new@x.com' }) })
  expect(r.ok).toBe(true)
})

test('DB miss + fallback lapsed -> deny', async () => {
  const r = await isCurrentMember('lapsed@x.com', { db: fakeDb(null), fetchByEmail: async () => M({ emailAddress: 'lapsed@x.com', current: false }) })
  expect(r.ok).toBe(false)
})

test('DB miss + fallback stranger -> deny', async () => {
  const r = await isCurrentMember('nobody@x.com', { db: fakeDb(null), fetchByEmail: async () => null })
  expect(r.ok).toBe(false)
})

test('fail-closed on error', async () => {
  const db = { member: { findFirst: async () => { throw new Error('db down') } } } as any
  const r = await isCurrentMember('a@x.com', { db, fetchByEmail: async () => { throw new Error('sheet down') } })
  expect(r.ok).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run src/lib/roster.test.ts`
Expected: FAIL — `isCurrentMember` not defined.

- [ ] **Step 3: Write minimal implementation** (add to `roster.ts`)
```ts
type GateDeps = {
  db?: typeof prisma
  fetchByEmail?: (email: string) => Promise<MemberRecord | null>
}

export async function isCurrentMember(email: string, deps: GateDeps = {}): Promise<GateResult> {
  const db = deps.db ?? prisma
  const fetchByEmail = deps.fetchByEmail ?? fetchRosterRowByEmail
  const e = normalizeEmail(email)

  const devList = process.env.DEV_ALLOWED_EMAILS?.split(',').map((x) => x.trim().toLowerCase())
  if (devList?.includes(e)) {
    return { ok: true, member: { emailAddress: e, googleEmail: null, name: 'DEV', tier: null, current: true, isBoard: false, partnerEmail: null, expires: null } }
  }

  try {
    const hit = await db.member.findFirst({
      where: { current: true, OR: [{ emailAddress: e }, { googleEmail: e }] },
    })
    if (hit) return { ok: true, member: hit as MemberRecord }

    // fallback: live Sheet read for a just-added member
    const row = await fetchByEmail(e)
    if (row && row.current) {
      await db.member.upsert({
        where: { emailAddress: row.emailAddress },
        update: { ...row },
        create: { ...row },
      })
      return { ok: true, member: row }
    }
    return { ok: false }
  } catch (err) {
    console.error('isCurrentMember error (fail-closed):', err)
    return { ok: false }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run src/lib/roster.test.ts`
Expected: PASS (all roster tests green).

- [ ] **Step 5: Commit**
```bash
git add src/lib/roster.ts src/lib/roster.test.ts
git commit -m "feat(hub): isCurrentMember gate (DB fast-path + live fallback, fail-closed)"
```

---

### Task 8: Fly Postgres provisioning + push schema

**Files:** none (operational). Requires Fly auth (`FLY_API_TOKEN` via env, NOT pasted in chat) and a real `DATABASE_URL`.

- [ ] **Step 1:** Ensure `flyctl` auth is available (env token). Provision: `fly postgres create` (name e.g. `wcb-hub-db`, region near members, smallest tier). Capture the connection string.
- [ ] **Step 2:** Put `DATABASE_URL` into the local `.env` (and Vercel project env). NEVER commit it.
- [ ] **Step 3:** `npm run db:push` — creates the `Member` + NextAuth tables on the live DB. Expected: "Your database is now in sync."
- [ ] **Step 4: Verify** — `npx prisma studio` (or a `SELECT`) shows empty `Member` table exists.
- [ ] **Step 5:** No commit (no code changed). Record the DB name + region in the PR description.

---

### Task 9: Email sender (Resend) + rate limiter

**Files:**
- Create: `src/lib/email.ts`
- Create: `src/lib/ratelimit.ts`
- Create: `src/lib/ratelimit.test.ts`

**Interfaces:**
- Produces:
  - `sendLoginCode(email: string, code: string): Promise<void>` — sends the code via Resend from `RESEND_FROM`. Throws on failure (caller surfaces "couldn't send").
  - `checkRateLimit(key: string, opts?): { ok: boolean }` — in-memory sliding window (default 5 requests / 15 min per key). Keyed by `email` and by `ip` at the call site.

- [ ] **Step 1: Write the failing test (rate limiter — pure, unit-testable)**
```ts
// src/lib/ratelimit.test.ts
import { test, expect } from 'vitest'
import { checkRateLimit, _resetRateLimit } from './ratelimit'

test('allows up to N then blocks', () => {
  _resetRateLimit()
  const key = 'e@x.com'
  for (let i = 0; i < 5; i++) expect(checkRateLimit(key, { max: 5, windowMs: 1000 }).ok).toBe(true)
  expect(checkRateLimit(key, { max: 5, windowMs: 1000 }).ok).toBe(false)
})
```

- [ ] **Step 2: Run — FAIL** (`checkRateLimit` missing). `npx vitest run src/lib/ratelimit.test.ts`

- [ ] **Step 3: Implement `src/lib/ratelimit.ts`**
```ts
const hits = new Map<string, number[]>()
export function _resetRateLimit() { hits.clear() }

export function checkRateLimit(key: string, opts: { max?: number; windowMs?: number } = {}): { ok: boolean } {
  const max = opts.max ?? 5
  const windowMs = opts.windowMs ?? 15 * 60_000
  const now = Date.now()
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (arr.length >= max) { hits.set(key, arr); return { ok: false } }
  arr.push(now); hits.set(key, arr); return { ok: true }
}
```
NOTE: in-memory is per-serverless-instance — acceptable for basic abuse-prevention at club scale. A durable limiter (e.g. Postgres/Upstash) is a possible later hardening; log this limitation.

- [ ] **Step 4: Implement `src/lib/email.ts`**
```ts
import { Resend } from 'resend'

export async function sendLoginCode(email: string, code: string): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = process.env.RESEND_FROM ?? 'WCB <noreply@wcbrusaders.com>'
  const { error } = await resend.emails.send({
    from,
    to: email,
    subject: 'Your WCB login code',
    text: `Your Wake County Brusaders login code is: ${code}\n\nIt expires in 10 minutes. If you didn't request this, ignore this email.`,
  })
  if (error) throw new Error(`Resend failed: ${error.message}`)
}
```

- [ ] **Step 5: Run — PASS.** Commit
```bash
git add src/lib/email.ts src/lib/ratelimit.ts src/lib/ratelimit.test.ts
git commit -m "feat(hub): Resend login-code sender + rate limiter"
```

---

### Task 10: NextAuth config — email-OTP + roster-gate callback (NO Google)

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/lib/auth.test.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`

**Interfaces:**
- Consumes: `isCurrentMember` (Task 7), `sendLoginCode` (Task 9), Prisma adapter, `prisma`.
- Produces: NextAuth v5 config exporting `handlers, auth, signIn, signOut`. A custom email/Nodemailer-style provider that generates a **6-digit numeric code** (not a magic link), stores it via the adapter's `VerificationToken` (hashed by the adapter), and sends it with `sendLoginCode`. `signIn` callback calls `isCurrentMember(user.email)`, returns false (denies) if `{ok:false}`. `session` callback adds `{ memberId?, tier?, isBoard? }` looked up from `Member`. `pages.signIn = '/login'`. `pages.verifyRequest = '/login?sent=1'`.

**IMPLEMENTATION NOTE:** Auth.js v5's email provider supports a custom `generateVerificationToken` (return a 6-digit code) + `sendVerificationRequest` (call `sendLoginCode`). Confirm exact API against Auth.js v5 docs at build time (the beta API around the Nodemailer/Email provider + `generateVerificationToken` is the piece to verify). If the code-based email provider proves impractical in v5, fall back to the "Credentials provider that verifies a code we store ourselves" pattern — but attempt the standard email-OTP first.

- [ ] **Step 1: Write the failing test (callback logic in isolation)**
```ts
// src/lib/auth.test.ts
import { test, expect, vi } from 'vitest'
import { makeSignInCallback } from './auth'

test('signIn allows a current member', async () => {
  const cb = makeSignInCallback({ isMember: async () => ({ ok: true, member: { emailAddress: 'a@x.com' } as any }) })
  expect(await cb({ user: { email: 'a@x.com' } } as any)).toBe(true)
})

test('signIn denies a non-member', async () => {
  const cb = makeSignInCallback({ isMember: async () => ({ ok: false }) })
  expect(await cb({ user: { email: 'no@x.com' } } as any)).toBe(false)
})

test('signIn denies when no email', async () => {
  const cb = makeSignInCallback({ isMember: async () => ({ ok: true, member: {} as any }) })
  expect(await cb({ user: {} } as any)).toBe(false)
})
```

- [ ] **Step 2: Run — FAIL** (`makeSignInCallback` missing). `npx vitest run src/lib/auth.test.ts`

- [ ] **Step 3: Implement `src/lib/auth.ts`** — extract the gate logic into a testable factory, then wire NextAuth around it.
```ts
import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from './db'
import { isCurrentMember } from './roster'
import { sendLoginCode } from './email'

// testable, framework-free callback factory
export function makeSignInCallback(deps: { isMember: typeof isCurrentMember }) {
  return async ({ user }: { user: { email?: string | null } }) => {
    if (!user?.email) return false
    const r = await deps.isMember(user.email)
    return r.ok
  }
}

function sixDigit(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/login', verifyRequest: '/login?sent=1' },
  providers: [
    {
      id: 'email-code',
      type: 'email',
      name: 'Email code',
      maxAge: 10 * 60, // code TTL 10 min
      // 6-digit numeric code instead of a magic link:
      generateVerificationToken: async () => sixDigit(),
      sendVerificationRequest: async ({ identifier, token }) => {
        await sendLoginCode(identifier, token)
      },
      // required-by-type fields the Email provider expects; server/from unused since we send via Resend:
      server: {},
      from: process.env.RESEND_FROM ?? 'WCB <noreply@wcbrusaders.com>',
    } as any,
  ],
  callbacks: {
    signIn: makeSignInCallback({ isMember: isCurrentMember }),
    async session({ session }) {
      if (session.user?.email) {
        const m = await prisma.member.findFirst({
          where: { OR: [{ emailAddress: session.user.email }, { googleEmail: session.user.email }] },
          select: { id: true, tier: true, isBoard: true },
        })
        ;(session.user as any).memberId = m?.id
        ;(session.user as any).tier = m?.tier
        ;(session.user as any).isBoard = m?.isBoard ?? false
      }
      return session
    },
  },
})
```

- [ ] **Step 4: Create `src/app/api/auth/[...nextauth]/route.ts`**
```ts
import { handlers } from '@/lib/auth'
export const { GET, POST } = handlers
```

- [ ] **Step 5: Run — PASS** (`npx vitest run src/lib/auth.test.ts`) and `npx tsc --noEmit` passes.

- [ ] **Step 6: Commit**
```bash
git add src/lib/auth.ts src/lib/auth.test.ts src/app/api/auth
git commit -m "feat(hub): NextAuth email-OTP config + roster-gate callback (no Google)"
```

---

### Task 11: Login UI + members page + middleware gate

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/members/page.tsx`
- Create: `src/middleware.ts`

**Interfaces:**
- Consumes: `signIn`/`auth` from `src/lib/auth.ts`.
- Produces: a two-step login form (enter email → enter code), a gated `/members` page showing the logged-in member, and middleware redirecting unauthenticated `/members/*` → `/login`.

- [ ] **Step 1: `src/middleware.ts`**
```ts
export { auth as middleware } from '@/lib/auth'
export const config = { matcher: ['/members/:path*'] }
```

- [ ] **Step 2: `src/app/members/page.tsx`** (server component; reads session)
```tsx
import { auth } from '@/lib/auth'

export default async function MembersPage() {
  const session = await auth()
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">WCB Members</h1>
      <p>Signed in as {session?.user?.email}</p>
    </main>
  )
}
```

- [ ] **Step 3: `src/app/login/page.tsx`** — email step calls `signIn('email-code', { email })`; the code step is the standard NextAuth verify flow (the emailed code + identifier). Use a client component with two states (email entered → "check your email, enter code"). Show the roster-denied message when `signIn` returns an error. (Match existing Tailwind styling from `src/app/page.tsx`.)

- [ ] **Step 4: Verify (build + typecheck)** — `npm run build` succeeds; `npx tsc --noEmit` passes.

- [ ] **Step 5: Commit**
```bash
git add src/app/login src/app/members src/middleware.ts
git commit -m "feat(hub): login UI + gated members page + middleware"
```

---

### Task 12: Cron sync endpoint + vercel.json schedule

**Files:**
- Create: `src/app/api/cron/sync-roster/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Produces: `GET /api/cron/sync-roster` — verifies `Authorization: Bearer ${CRON_SECRET}`, calls `syncRoster()`, returns counts. A Vercel Cron entry hitting it every 15 min.

- [ ] **Step 1: `src/app/api/cron/sync-roster/route.ts`**
```ts
import { NextResponse } from 'next/server'
import { syncRoster } from '@/lib/roster'

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const r = await syncRoster()
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Add cron to `vercel.json`**
```json
{
  "crons": [
    { "path": "/api/cron/sync-roster", "schedule": "*/15 * * * *" }
  ]
}
```
(Merge into the existing `vercel.json` — keep the `framework` key.)

- [ ] **Step 3: Verify** — `npm run build` succeeds. Locally: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/sync-roster` returns `{ok:true, synced:.., deactivated:..}` (needs DB + Google env set).

- [ ] **Step 4: Commit**
```bash
git add src/app/api/cron vercel.json
git commit -m "feat(hub): roster-sync cron endpoint + 15-min schedule"
```

---

### Task 13: Deploy + live verification

**Files:** none (operational).

- [ ] **Step 1:** Set all env vars in the Vercel project (DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, RESEND_API_KEY, RESEND_FROM, the 4 Google vars, CRON_SECRET). Confirm `RESEND_FROM` domain is verified in Resend.
- [ ] **Step 2:** Deploy to Vercel. Confirm build passes.
- [ ] **Step 3: Manual E2E (real, one pass):** trigger the cron endpoint once to seed `Member` from the sheet → verify `Member` table populated + `current` flags correct (spot-check a known current + a known lapsed member). Then: on `/login` enter a **known current** member email → receive the 6-digit code via email → enter it → land on `/members` showing that email. Then: enter a **non-member** email → denied, no code.
- [ ] **Step 4:** Verify a lapsed member is denied (after a sync) and that hitting `/members` while logged out redirects to `/login`.
- [ ] **Step 5:** Confirm the branch is pushed to `wcbrusaders/wcb_site` and open a PR (or merge per club convention). Ensure no secrets committed.

---

## Self-Review

**Spec coverage:** email-code login → Tasks 10,11. NO Google → Task 10 (no Google provider). Roster gate (Email OR Google Email, current only) → Task 7. Partner columns ignored for auth → Task 4/7 (never queried in the gate). Live-Sheet fallback for new signups → Task 7. Periodic sync deactivates lapsed (hard req) → Tasks 6,12. Reuse existing WCB refresh-token creds, read-only → Task 5. Fail-closed → Task 7. Resend → Task 9. Rate-limit → Task 9. Fly Postgres + Prisma → Tasks 2,8. Middleware gate → Task 11. Framework-free reusable units → Tasks 3–7 (roster.ts has no next-auth imports). Session carries memberId/tier/isBoard → Task 10. All spec sections covered.

**Placeholder scan:** one deliberate flag — Task 10 says "confirm Auth.js v5 email-OTP API at build time; fall back to Credentials-provider-with-self-stored-code if impractical." This is a genuine known-unknown about the beta API surface, not a vague placeholder; the fallback path is concrete. Acceptable.

**Type consistency:** `MemberRecord` shape identical across Tasks 3–7. `GateResult` used in Task 7 + Task 10 callback test. `isCurrentMember(email, deps?)` and `syncRoster(deps?)` signatures consistent with their call sites (auth.ts, cron route). `checkRateLimit(key, opts)` matches its test.

**Scope:** single focused plan — the auth foundation only. No features, no LMS changes, no Drive work. Good.
