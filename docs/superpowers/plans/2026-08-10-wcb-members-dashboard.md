# WCB Members Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/members` into the members-area hub — a read-only dashboard showing each member their own roster info (status, tier, computed tenure, key dates, partner link, Drive/Calendar access) plus a "Coming soon" nav shell for future features.

**Architecture:** Extend the existing `Member` model + roster sync with additive nullable fields, so the dashboard reads only the DB (fast, no Google at view time). A framework-free read (`getMemberDashboard`) plus two pure helpers (`formatTenure`, `visibleCards`) hold all logic and are unit-tested; thin server/presentational components render them. Nothing touches the auth gate or the 15-min sync beyond additive fields.

**Tech Stack:** Next.js 16 (App Router, server components) + React 19 + TypeScript, Prisma 6 + Postgres (Fly), Tailwind v4 (hand-rolled, CSS-var tokens), Vitest, NextAuth v5 (`auth()` only, read-side).

## Global Constraints

- **Branch:** `feat/members-dashboard` (already created off `feat/auth-module`). All work here.
- **Additive only:** new `Member` columns are nullable; `mapSheetRow`/`syncRoster` changes only ADD fields. Do NOT alter `isCurrentMember`, the roster-gate logic, the provider config, or the sync's deactivate logic.
- **DB-only reads at view time:** the dashboard must NOT call Google/Sheets on page render. Data comes from the `Member` table (kept fresh by the existing sync).
- **Framework-free logic:** `roster.ts` must stay free of `next`/`next-auth` imports (it's the LMS-reuse seam). New pure helpers live in `roster.ts` or a sibling framework-free file — never import React/next into them.
- **Tenure is computed, never stored:** sync `joinDate` (a `DateTime?`); compute tenure with `formatTenure(joinDate)`. Do NOT add a `tenureMonths` column or read the sheet's `Tenure (months)`.
- **Drive/Calendar access = Google Group truth, NOT the sheet.** Sync reads membership of the group `MEMBER_ACCESS_GROUP_EMAIL` (Directory API, reusing the bot's `admin.directory.group` creds) into a `resourceAccess Boolean?` on `Member`. Do NOT sync the sheet's `Drive Access Status`/`Calendar Access Status`. `resourceAccess`: `true`=in group, `false`=confirmed not in group, `null`=never determined. **Fail-soft:** if the Group read throws, omit `resourceAccess` from that run's upsert (leave unchanged) — never flip to false, never break the sheet sync/gate.
- **Directory creds:** the group read uses the bot's credentials (broader scope than the hub's own `spreadsheets.readonly` token). Server-side only. Env vars needed at deploy: `GOOGLE_ADMIN_*` or reuse of the existing `GOOGLE_*` if the bot's token already carries `admin.directory.group` — the group read must set `subject`/domain-wide-delegation exactly as the bot does. (Implementer: mirror the bot's `wcb_bot/data/oauth_connector_json.py` Directory setup; the group email is `MEMBER_ACCESS_GROUP_EMAIL`.)
- **Graceful blanks:** blank field → hidden or "Not on file"; a card whose fields are all blank → omitted. No "undefined", no empty scaffolding.
- **Fail-soft:** a session with no `Member` row shows a minimal "details may still be syncing" state using session-carried email/tier — never a crash.
- **Status rule (exact):** `current === false` → "Inactive"; `current === true` AND `expires` within 30 days → "Active — renews soon ({date})"; else "Active". `current` is authoritative; `expires` only refines the active label.
- **Date guard:** parse sheet dates with the existing `isNaN(getTime())` guard → invalid/blank → `null`.
- **Styling:** match the existing hand-rolled Tailwind v4 idiom. Tokens (in `src/app/globals.css`): `bg-background` (#0a0a0a), `text-foreground` (#f5f5f5), `text-accent`/`bg-accent` (#ff9500), `bg-card-bg` (#1a1a1a), `border-border` (#333). Card idiom: `rounded-2xl border border-border/50 bg-card-bg/30 p-6 md:p-8`; muted text `text-foreground/60`. NO UI kit (no shadcn/radix), no new deps.
- **Schema apply:** this repo uses `prisma db push` (no migrations dir). Regenerate the client with `prisma generate` after editing the schema. The dev DB is reached via `fly proxy 5432:5432 --app wcb-hub-db` then a `localhost` DATABASE_URL, OR the public host `wcb-hub-db.fly.dev:5432?sslmode=require`.
- **Verification bar per task:** `npx tsc --noEmit` clean, `npx vitest run` green, and (T5) `npm run build` compiles. Tests are framework-free with dependency-injected fakes, matching `src/lib/roster.test.ts` (no mocking of code we don't own; assert on real behavior).

---

### Task 1: Schema + sheet-field sync extension

**Files:**
- Modify: `prisma/schema.prisma` (the `Member` model, lines ~10-24)
- Modify: `src/lib/roster.ts` (`MemberRecord` type ~4-13; `mapSheetRow` ~31-48; `syncRoster` upsert ~95-99)
- Test: `src/lib/roster.test.ts` (append)

**Interfaces:**
- Consumes: existing `cell(headers, row, name)`, `normalizeEmail`, `truthy` in `roster.ts`.
- Produces: `MemberRecord` gains `joinDate: Date | null`, `paymentDate: Date | null`, `referredBy: string | null`. `Member` model gains those three columns PLUS `resourceAccess Boolean?` (populated later, in Task 2 — not a sheet field, so NOT on `MemberRecord`/`mapSheetRow`). `syncRoster` persists the three sheet fields.

- [ ] **Step 1: Write the failing test** — append to `src/lib/roster.test.ts`. Add a header set with the new columns so existing tests are undisturbed.

```typescript
const HEADERS_FULL = ['Name','Tier','Payment Date','Expires','Current','Partner Email','Board Member','Join Date','Referred By','Google Email']

test('mapSheetRow maps the dashboard sheet fields', () => {
  const row = ['Jane Doe','Full','2026-01-15','2027-01-01','TRUE','partner@x.com','No','2022-05-10','Bob','jane.g@gmail.com']
  const m = mapSheetRow(HEADERS_FULL, row)!
  expect(m.joinDate?.toISOString().slice(0,10)).toBe('2022-05-10')
  expect(m.paymentDate?.toISOString().slice(0,10)).toBe('2026-01-15')
  expect(m.referredBy).toBe('Bob')
})

test('mapSheetRow: blank/invalid dashboard fields become null', () => {
  const row = ['Bob','Full','not-a-date','','TRUE','','No','','','']
  const m = mapSheetRow(HEADERS_FULL, row)!
  expect(m.paymentDate).toBeNull()   // invalid date -> null (isNaN guard)
  expect(m.joinDate).toBeNull()      // blank -> null
  expect(m.referredBy).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/roster.test.ts`
Expected: FAIL — `mapSheetRow` result has no `joinDate`/`paymentDate`/`referredBy`.

- [ ] **Step 3a: Extend the `Member` model** in `prisma/schema.prisma` — add inside the model, after `expires`:

```prisma
  joinDate       DateTime?
  paymentDate    DateTime?
  referredBy     String?
  resourceAccess Boolean?
```

(`resourceAccess` is populated in Task 2 from Google Group membership — declared here so the one `db push` covers both tasks.)

- [ ] **Step 3b: Extend `MemberRecord`** in `src/lib/roster.ts` — add after `expires: Date | null` (note: NO `resourceAccess` here — it isn't a sheet field):

```typescript
  joinDate: Date | null
  paymentDate: Date | null
  referredBy: string | null
```

- [ ] **Step 3c: Add a date-parse helper + extend `mapSheetRow`.** In `roster.ts`, add a helper near `cell`:

```typescript
function parseDate(v: string): Date | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}
```

Then in `mapSheetRow`'s returned object, reuse it for `expires` and add the new fields:

```typescript
    expires: parseDate(exp),
    joinDate: parseDate(cell(headers, row, 'Join Date')),
    paymentDate: parseDate(cell(headers, row, 'Payment Date')),
    referredBy: cell(headers, row, 'Referred By') || null,
```

(Delete the old `const expires = ...` line and old `expires:` construction — `parseDate(exp)` replaces them. Keep `const exp = cell(headers, row, 'Expires')` as `parseDate`'s input.)

- [ ] **Step 3d: Extend `syncRoster` upsert** — in both the `update:` and `create:` objects (lines ~97-98), add the three sheet fields:

```typescript
        joinDate: m.joinDate, paymentDate: m.paymentDate, referredBy: m.referredBy,
```

(Do NOT add `resourceAccess` here — Task 2 wires that in.)

- [ ] **Step 4: Regenerate client + run tests**

Run: `npx prisma generate && npx vitest run src/lib/roster.test.ts`
Expected: PASS (new + all existing `roster.test.ts` green). Then `npx tsc --noEmit` clean.

- [ ] **Step 5: Push schema to the DB**

Run (dev): start `fly proxy 5432:5432 --app wcb-hub-db` in another shell, then with a `localhost` DATABASE_URL: `npx prisma db push`. (Or DATABASE_URL = `wcb-hub-db.fly.dev:5432/?sslmode=require`.) Expected: "in sync". The four new nullable columns need no backfill.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/lib/roster.ts src/lib/roster.test.ts
git commit -m "feat(hub): sync joinDate/paymentDate/referredBy + add resourceAccess column"
```

---

### Task 2: Google Group membership → `resourceAccess` (fail-soft)

**Files:**
- Modify: `src/lib/roster.ts` (add `fetchAccessGroupMembers`; extend `syncRoster`)
- Test: `src/lib/roster.test.ts` (append)
- Reference (do not modify): `wcb_bot/data/oauth_connector_json.py` — mirror its Directory-API auth setup (scope `admin.directory.group`, domain-wide delegation `subject`).

**Interfaces:**
- Consumes: googleapis; `normalizeEmail`; `MEMBER_ACCESS_GROUP_EMAIL` env var; the bot's Directory creds.
- Produces: `export async function fetchAccessGroupMembers(): Promise<Set<string>>` — normalized emails of the access group's members. `syncRoster` gains a `deps.fetchGroupMembers?` fake seam and sets `resourceAccess` per member (fail-soft on error).

- [ ] **Step 1: Write the failing test** — append to `src/lib/roster.test.ts`. Test `syncRoster`'s use of the group set via the DI seam (do NOT hit real Google). Capture upsert data to assert on it.

```typescript
test('syncRoster sets resourceAccess from group membership', async () => {
  const upserts: any[] = []
  const db = { member: {
    upsert: async (a: any) => { upserts.push(a); },
    findMany: async () => [],
    updateMany: async () => ({ count: 0 }),
  } } as any
  const rows = [
    { emailAddress:'in@x.com', googleEmail:null, name:'A', tier:null, current:true, isBoard:false, partnerEmail:null, expires:null, joinDate:null, paymentDate:null, referredBy:null },
    { emailAddress:'out@x.com', googleEmail:null, name:'B', tier:null, current:true, isBoard:false, partnerEmail:null, expires:null, joinDate:null, paymentDate:null, referredBy:null },
  ]
  await syncRoster({ db, fetchAll: async () => rows, fetchGroupMembers: async () => new Set(['in@x.com']) })
  const inU = upserts.find(u => u.where.emailAddress === 'in@x.com')
  const outU = upserts.find(u => u.where.emailAddress === 'out@x.com')
  expect(inU.update.resourceAccess).toBe(true)
  expect(outU.update.resourceAccess).toBe(false)  // absent from set -> false, NOT skipped
})

test('syncRoster is fail-soft when the group read throws (resourceAccess untouched, sheet sync completes)', async () => {
  const upserts: any[] = []
  const db = { member: {
    upsert: async (a: any) => { upserts.push(a); },
    findMany: async () => [],
    updateMany: async () => ({ count: 0 }),
  } } as any
  const rows = [{ emailAddress:'a@x.com', googleEmail:null, name:'A', tier:null, current:true, isBoard:false, partnerEmail:null, expires:null, joinDate:null, paymentDate:null, referredBy:null }]
  const r = await syncRoster({ db, fetchAll: async () => rows, fetchGroupMembers: async () => { throw new Error('directory down') } })
  expect(r.synced).toBe(1)                                  // sheet sync still completed
  expect('resourceAccess' in upserts[0].update).toBe(false) // omitted -> left unchanged
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/roster.test.ts`
Expected: FAIL — `syncRoster` has no `fetchGroupMembers` dep and never sets `resourceAccess`.

- [ ] **Step 3a: Add `fetchAccessGroupMembers`** to `roster.ts` (near `sheetsClient`). Mirror the bot's Directory auth. The access group email comes from `MEMBER_ACCESS_GROUP_EMAIL`:

```typescript
const ACCESS_GROUP = process.env.MEMBER_ACCESS_GROUP_EMAIL

// Reuses the bot's admin.directory.group creds (domain-wide delegation).
// GOOGLE_ADMIN_SUBJECT = the Workspace admin to impersonate (as the bot does).
export async function fetchAccessGroupMembers(): Promise<Set<string>> {
  if (!ACCESS_GROUP) throw new Error('MEMBER_ACCESS_GROUP_EMAIL not set')
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  const dir = google.admin({ version: 'directory_v1', auth })
  const out = new Set<string>()
  let pageToken: string | undefined
  do {
    const res = await dir.members.list({ groupKey: ACCESS_GROUP, maxResults: 200, pageToken })
    for (const m of res.data.members ?? []) {
      if (m.email) out.add(normalizeEmail(m.email))
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return out
}
```

> Implementer note: the hub's own `GOOGLE_REFRESH_TOKEN` (minted `spreadsheets.readonly`) does NOT carry `admin.directory.group`. Per the spec's "reuse the bot's creds" decision, the deploy must provide creds/token that DO — verify against `wcb_bot/data/oauth_connector_json.py`. If the bot uses domain-wide delegation with a `subject`, replicate that here (add the `subject`/`clientOptions` the bot uses). This is a real deploy-cred step, surfaced in Task's live-verification note.

- [ ] **Step 3b: Add the `fetchGroupMembers` dep seam + set `resourceAccess`** in `syncRoster`. Change `SyncDeps`:

```typescript
type SyncDeps = {
  fetchAll?: () => Promise<MemberRecord[]>
  fetchGroupMembers?: () => Promise<Set<string>>
  db?: typeof prisma
}
```

At the top of `syncRoster`, resolve the group set fail-soft:

```typescript
  const fetchGroupMembers = deps.fetchGroupMembers ?? fetchAccessGroupMembers
  let groupSet: Set<string> | null = null
  try { groupSet = await fetchGroupMembers() } catch (e) {
    console.error('access group read failed (resourceAccess left unchanged):', e)
    groupSet = null
  }
```

In the upsert loop, build the per-member access patch and merge it into BOTH `update` and `create`:

```typescript
    const access = groupSet === null
      ? {}
      : { resourceAccess: groupSet.has(m.emailAddress) || (m.googleEmail ? groupSet.has(m.googleEmail) : false) }
    await db.member.upsert({
      where: { emailAddress: m.emailAddress },
      update: { googleEmail: m.googleEmail, name: m.name, tier: m.tier, current: m.current, isBoard: m.isBoard, partnerEmail: m.partnerEmail, expires: m.expires, joinDate: m.joinDate, paymentDate: m.paymentDate, referredBy: m.referredBy, ...access },
      create: { emailAddress: m.emailAddress, googleEmail: m.googleEmail, name: m.name, tier: m.tier, current: m.current, isBoard: m.isBoard, partnerEmail: m.partnerEmail, expires: m.expires, joinDate: m.joinDate, paymentDate: m.paymentDate, referredBy: m.referredBy, ...access },
    })
```

(When `groupSet === null` — read failed — `access` is `{}`, so `resourceAccess` is omitted and left unchanged. This is what the fail-soft test asserts.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/roster.test.ts`
Expected: PASS (both new tests + all prior). Then `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/roster.ts src/lib/roster.test.ts
git commit -m "feat(hub): resourceAccess from Google Group membership (fail-soft)"
```

---

### Task 3: `formatTenure(joinDate)` pure function

**Files:**
- Create: `src/lib/dashboard.ts`
- Test: `src/lib/dashboard.test.ts`

**Interfaces:**
- Consumes: nothing (pure). Takes a `Date | null` and, for testability, an optional `now: Date` (defaults to `new Date()`).
- Produces: `export function formatTenure(joinDate: Date | null, now?: Date): string` — `''` when no meaningful tenure; else `"N mo"` (<1yr) or `"Y yr M mo"` (≥1yr, `M` omitted when 0 → `"Y yr"`).

> `dashboard.ts` is framework-free (no next/react imports) — it's the dashboard's logic seam, sibling to `roster.ts`.

- [ ] **Step 1: Write the failing test** — `src/lib/dashboard.test.ts`:

```typescript
import { test, expect } from 'vitest'
import { formatTenure } from './dashboard'

const NOW = new Date('2026-08-10T00:00:00Z')

test('formatTenure: null join date -> empty', () => {
  expect(formatTenure(null, NOW)).toBe('')
})
test('formatTenure: future join date -> empty', () => {
  expect(formatTenure(new Date('2027-01-01T00:00:00Z'), NOW)).toBe('')
})
test('formatTenure: under a year -> "N mo"', () => {
  expect(formatTenure(new Date('2026-05-10T00:00:00Z'), NOW)).toBe('3 mo')
})
test('formatTenure: exactly one year -> "1 yr"', () => {
  expect(formatTenure(new Date('2025-08-10T00:00:00Z'), NOW)).toBe('1 yr')
})
test('formatTenure: years and months -> "Y yr M mo"', () => {
  expect(formatTenure(new Date('2022-05-10T00:00:00Z'), NOW)).toBe('4 yr 3 mo')
})
test('formatTenure: month not yet reached rolls back', () => {
  // join Jun 20, now Aug 10 -> 1 month + partial, floor to 1
  expect(formatTenure(new Date('2026-06-20T00:00:00Z'), NOW)).toBe('1 mo')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dashboard.test.ts`
Expected: FAIL — cannot find `./dashboard` / `formatTenure` not exported.

- [ ] **Step 3: Implement** in `src/lib/dashboard.ts`:

```typescript
export function formatTenure(joinDate: Date | null, now: Date = new Date()): string {
  if (!joinDate || isNaN(joinDate.getTime()) || joinDate.getTime() > now.getTime()) return ''
  let months =
    (now.getUTCFullYear() - joinDate.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - joinDate.getUTCMonth())
  if (now.getUTCDate() < joinDate.getUTCDate()) months -= 1 // not yet reached this month's day
  if (months < 0) months = 0
  const years = Math.floor(months / 12)
  const rem = months % 12
  if (years === 0) return `${rem} mo`
  return rem === 0 ? `${years} yr` : `${years} yr ${rem} mo`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dashboard.test.ts`
Expected: PASS (all 6). Then `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard.ts src/lib/dashboard.test.ts
git commit -m "feat(hub): formatTenure pure helper (computed from join date)"
```

---

### Task 4: `getMemberDashboard(email, deps?)` framework-free read

**Files:**
- Modify: `src/lib/dashboard.ts`
- Test: `src/lib/dashboard.test.ts`

**Interfaces:**
- Consumes: `prisma` from `./db`; `normalizeEmail` from `./roster`; the `Member` row shape.
- Produces: `export type DashboardRecord = { name: string | null; tier: string | null; current: boolean; isBoard: boolean; expires: Date | null; joinDate: Date | null; paymentDate: Date | null; partnerEmail: string | null; resourceAccess: boolean | null }` and `export async function getMemberDashboard(email: string, deps?: { db?: typeof prisma }): Promise<DashboardRecord | null>`.

- [ ] **Step 1: Write the failing test** — append to `src/lib/dashboard.test.ts`:

```typescript
import { getMemberDashboard } from './dashboard'

const ROW = { name:'Jane', tier:'Full', current:true, isBoard:false, expires:null, joinDate:new Date('2022-05-10'), paymentDate:null, partnerEmail:null, resourceAccess:true }

test('getMemberDashboard: hit returns the record, matching on emailAddress OR googleEmail', async () => {
  const db = { member: { findFirst: async ({ where }: any) => {
    const or = where.OR
    return (or[0].emailAddress === 'jane@x.com' || or[1].googleEmail === 'jane@x.com') ? ROW : null
  } } } as any
  const r = await getMemberDashboard('  Jane@X.com ', { db }) // normalization exercised
  expect(r?.tier).toBe('Full')
  expect(r?.resourceAccess).toBe(true)
})

test('getMemberDashboard: miss returns null', async () => {
  const db = { member: { findFirst: async () => null } } as any
  expect(await getMemberDashboard('nobody@x.com', { db })).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dashboard.test.ts`
Expected: FAIL — `getMemberDashboard` not exported.

- [ ] **Step 3: Implement** — append to `src/lib/dashboard.ts`:

```typescript
import { prisma } from './db'
import { normalizeEmail } from './roster'

export type DashboardRecord = {
  name: string | null; tier: string | null; current: boolean; isBoard: boolean
  expires: Date | null; joinDate: Date | null; paymentDate: Date | null
  partnerEmail: string | null; resourceAccess: boolean | null
}

export async function getMemberDashboard(
  email: string,
  deps: { db?: typeof prisma } = {},
): Promise<DashboardRecord | null> {
  const db = deps.db ?? prisma
  const e = normalizeEmail(email)
  const m = await db.member.findFirst({
    where: { OR: [{ emailAddress: e }, { googleEmail: e }] },
    select: {
      name: true, tier: true, current: true, isBoard: true, expires: true,
      joinDate: true, paymentDate: true, partnerEmail: true, resourceAccess: true,
    },
  })
  return m ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dashboard.test.ts`
Expected: PASS. Then `npx tsc --noEmit` clean (the `select` must match schema field names from Task 1).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard.ts src/lib/dashboard.test.ts
git commit -m "feat(hub): getMemberDashboard framework-free read (db fast-path)"
```

---

### Task 5: `visibleCards(record)` + status/label helpers

**Files:**
- Modify: `src/lib/dashboard.ts`
- Test: `src/lib/dashboard.test.ts`

**Interfaces:**
- Consumes: `DashboardRecord`, `formatTenure`.
- Produces:
  - `export function membershipStatus(r: Pick<DashboardRecord,'current'|'expires'>, now?: Date): string` — the exact status rule.
  - `export type CardKey = 'membership' | 'timeline' | 'connections' | 'access'`
  - `export function visibleCards(r: DashboardRecord, now?: Date): CardKey[]` — which cards have data. `membership` ALWAYS present. `timeline` present if any of joinDate/expires/paymentDate. `connections` present if partnerEmail. `access` present iff `resourceAccess !== null` (i.e. we actually determined it — `null` = never determined, so hide the card entirely).

- [ ] **Step 1: Write the failing test** — append to `src/lib/dashboard.test.ts`:

```typescript
import { membershipStatus, visibleCards } from './dashboard'

const NOW2 = new Date('2026-08-10T00:00:00Z')

test('membershipStatus: inactive when current=false', () => {
  expect(membershipStatus({ current:false, expires:null }, NOW2)).toBe('Inactive')
})
test('membershipStatus: active', () => {
  expect(membershipStatus({ current:true, expires:new Date('2027-01-01') }, NOW2)).toBe('Active')
})
test('membershipStatus: renews soon when expires within 30d', () => {
  const s = membershipStatus({ current:true, expires:new Date('2026-08-25T00:00:00Z') }, NOW2)
  expect(s.startsWith('Active — renews soon')).toBe(true)
})

const EMPTY = { name:null,tier:null,current:false,isBoard:false,expires:null,joinDate:null,paymentDate:null,partnerEmail:null,resourceAccess:null }

test('visibleCards: membership always shown; empty record shows only membership', () => {
  expect(visibleCards(EMPTY, NOW2)).toEqual(['membership'])
})
test('visibleCards: access hidden when resourceAccess is null (never determined)', () => {
  expect(visibleCards({ ...EMPTY, resourceAccess:null }, NOW2)).toEqual(['membership'])
})
test('visibleCards: access shown when resourceAccess is false (determined: no access)', () => {
  expect(visibleCards({ ...EMPTY, resourceAccess:false }, NOW2)).toEqual(['membership','access'])
})
test('visibleCards: timeline/connections/access appear when they have data', () => {
  const r = { ...EMPTY, joinDate:new Date('2022-01-01'), partnerEmail:'p@x.com', resourceAccess:true }
  expect(visibleCards(r, NOW2)).toEqual(['membership','timeline','connections','access'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dashboard.test.ts`
Expected: FAIL — `membershipStatus`/`visibleCards` not exported.

- [ ] **Step 3: Implement** — append to `src/lib/dashboard.ts`:

```typescript
export function membershipStatus(
  r: { current: boolean; expires: Date | null },
  now: Date = new Date(),
): string {
  if (!r.current) return 'Inactive'
  if (r.expires && !isNaN(r.expires.getTime())) {
    const days = (r.expires.getTime() - now.getTime()) / 86_400_000
    if (days >= 0 && days <= 30) {
      return `Active — renews soon (${r.expires.toISOString().slice(0, 10)})`
    }
  }
  return 'Active'
}

export type CardKey = 'membership' | 'timeline' | 'connections' | 'access'

export function visibleCards(r: DashboardRecord, now: Date = new Date()): CardKey[] {
  const cards: CardKey[] = ['membership'] // always
  if (r.joinDate || r.expires || r.paymentDate) cards.push('timeline')
  if (r.partnerEmail) cards.push('connections')
  if (r.resourceAccess !== null) cards.push('access') // null = never determined -> hide
  return cards
}
```

> `now` is currently unused by `visibleCards` — keep the param for signature symmetry with `membershipStatus`/future date-gated cards, or drop it if lint flags it (prefer dropping to avoid an unused-param warning).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dashboard.test.ts`
Expected: PASS (all dashboard.test.ts tests). Then `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard.ts src/lib/dashboard.test.ts
git commit -m "feat(hub): membershipStatus + visibleCards display helpers"
```

---

### Task 6: Hub page + presentational components

**Files:**
- Create: `src/components/members/InfoCard.tsx`
- Create: `src/components/members/FeatureNav.tsx`
- Modify: `src/app/members/page.tsx` (replace the T11 proof page)
- (No new test file — logic is already unit-tested in Tasks 2-4; this task is presentational + wiring, verified by tsc + build.)

**Interfaces:**
- Consumes: `getMemberDashboard`, `formatTenure`, `membershipStatus`, `visibleCards`, `CardKey` from `@/lib/dashboard`; `auth` from `@/lib/auth`.
- Produces: the rendered `/members` hub.

> The logic in this task (which cards show, tenure text, status text) is all delegated to the Task 3-5 pure functions — this task only arranges them into markup. Keep it thin.

- [ ] **Step 1: `InfoCard.tsx`** — a generic card wrapper matching the house idiom:

```tsx
export function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card-bg/30 p-6 md:p-8">
      <p className="text-accent font-medium tracking-wide uppercase text-sm mb-4">{title}</p>
      <dl className="space-y-2">{children}</dl>
    </div>
  )
}

export function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null // graceful blank: hide the line entirely
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-foreground/50">{label}</dt>
      <dd className="text-foreground text-right">{value}</dd>
    </div>
  )
}
```

- [ ] **Step 2: `FeatureNav.tsx`** — visible "Coming soon" cards for the deferred features:

```tsx
const FEATURES = [
  { name: 'Book Library', desc: 'Browse and borrow the club library.' },
  { name: 'Equipment', desc: 'Check out shared brewing equipment.' },
  { name: 'Shop', desc: 'Member gear and club fundraisers.' },
]

export function FeatureNav() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {FEATURES.map((f) => (
        <div key={f.name} className="rounded-2xl border border-border/40 bg-card-bg/20 p-6 opacity-60">
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold">{f.name}</p>
            <span className="text-xs text-accent/70 border border-accent/30 rounded-full px-2 py-0.5">Coming soon</span>
          </div>
          <p className="text-foreground/50 text-sm">{f.desc}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Replace `src/app/members/page.tsx`** with the hub. Keep the existing `auth()` + `redirect('/login')` guard; add the fail-soft path:

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getMemberDashboard, formatTenure, membershipStatus, visibleCards } from '@/lib/dashboard'
import { InfoCard, Row } from '@/components/members/InfoCard'
import { FeatureNav } from '@/components/members/FeatureNav'

function fmtDate(d: Date | null): string | null {
  return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null
}

export default async function MembersPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')
  const email = session.user.email
  const rec = await getMemberDashboard(email)

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-4xl mx-auto px-6 py-24">
        <p className="text-accent font-medium tracking-wide uppercase text-sm mb-4">Members Hub</p>
        <h1 className="text-3xl md:text-4xl font-bold mb-2">
          Welcome{rec?.name ? `, ${rec.name}` : ''}
        </h1>
        <p className="text-foreground/50 mb-10">{email}</p>

        {!rec ? (
          <div className="rounded-2xl border border-border/50 bg-card-bg/30 p-6 md:p-8 mb-12">
            <p className="text-foreground/70">
              We couldn&apos;t load your membership details — they may still be syncing.
              Contact an officer if this persists.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 mb-12">
            {visibleCards(rec).includes('membership') && (
              <InfoCard title="Membership">
                <Row label="Status" value={membershipStatus(rec)} />
                <Row label="Tier" value={rec.tier} />
                <Row label="Board" value={rec.isBoard ? 'Board Member' : null} />
              </InfoCard>
            )}
            {visibleCards(rec).includes('timeline') && (
              <InfoCard title="Timeline">
                <Row label="Joined" value={fmtDate(rec.joinDate)} />
                <Row label="Member for" value={formatTenure(rec.joinDate) || null} />
                <Row label="Renews" value={fmtDate(rec.expires)} />
                <Row label="Last payment" value={fmtDate(rec.paymentDate)} />
              </InfoCard>
            )}
            {visibleCards(rec).includes('connections') && (
              <InfoCard title="Connections">
                <Row label="Linked partner" value={rec.partnerEmail} />
              </InfoCard>
            )}
            {visibleCards(rec).includes('access') && (
              <InfoCard title="Resources Access">
                <Row
                  label="Drive & Calendar"
                  value={rec.resourceAccess ? 'You have access' : 'Not currently granted'}
                />
              </InfoCard>
            )}
          </div>
        )}

        <h2 className="text-xl font-semibold mb-4">Member Features</h2>
        <FeatureNav />
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Verify tsc + build**

Run: `npx tsc --noEmit` (clean) then `npm run build` (compiles; `/members` still a dynamic `ƒ` route). Then `npx vitest run` — all tests across the suite still green.

- [ ] **Step 5: Commit**

```bash
git add src/components/members src/app/members/page.tsx
git commit -m "feat(hub): members dashboard hub (info cards + feature nav shell)"
```

---

## Post-plan notes

- **New env vars (deploy):** `MEMBER_ACCESS_GROUP_EMAIL` (the Google Group whose membership grants Drive+Calendar), and whatever creds carry `admin.directory.group` for the Directory read. Per the spec, reuse the bot's creds — verify against `wcb_bot/data/oauth_connector_json.py` whether that means a `subject` (domain-wide delegation) + a broader-scoped refresh token. Add these to Vercel (all scopes) before the first post-deploy sync, or the group read fails-soft (leaves `resourceAccess` null → Access card hidden). Add both to `.env.example`.
- **Live verification (after merge/deploy):** run the sync once so the new columns populate (they're `null` until the next `syncRoster`). Confirm: (a) Timeline card shows for a member with a Join Date; (b) Resources Access card shows "You have access" for a member IN the group and "Not currently granted" for one confirmed NOT in it; (c) if the Directory creds aren't set yet, the Access card is simply hidden (fail-soft) and the rest of the dashboard still works. The emailless member (Cat Pearce Barbour) remains unsynced.
- **No new deps.** Reuses the auth module's DB + sync + Vercel setup; the only additions are the group env var(s) and the Directory scope on the reused creds.
