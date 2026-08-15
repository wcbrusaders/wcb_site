# WCB Officer Admin Shell (Spec A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the board-only admin shell at `/members/admin` — a roster view all officers can see (currently locked to one person's Google Sheet), two targeted roster write-backs (secondary email, partner link), and an action audit log — as the secure foundation that later Specs B (enforcement) and C (strike log) build on.

**Architecture:** A new board-gated route under the existing `/members` segment, following the established board-gate pattern (`auth()` → redirect unless `session.user.isBoard`). Roster reads reuse `roster.ts`'s existing Google client; the two write actions write back to the roster Google Sheet via a new `updateRosterCell`-style helper. Every write action is recorded in a new Prisma `AuditLog` table. All writes go through server actions that re-verify board status server-side.

**Tech Stack:** Next.js 16 App Router (server components + server actions), TypeScript, Tailwind (WCB dark tokens), Vitest, Prisma/Postgres, `googleapis` (existing roster client).

## Global Constraints

- Route `/members/admin` is BOARD-ONLY. Gate exactly like `src/app/members/holdings/page.tsx`: `const session = await auth(); if (!session?.user?.memberId) redirect('/login'); if (!session.user.isBoard) redirect('/members')`.
- Every server action re-verifies board status server-side via `auth()` (never trusts the client) BEFORE any read of PII or any write. A non-board caller gets a rejection, not the data.
- Roster Google Sheet stays the single source of truth. Write actions write back to the sheet (append/update the member's row), never to a divergent store. The bot + `syncRoster` continue to own sync.
- Every write action records an `AuditLog` row: who (actor member id + email), what (action type + target member), when, and a human detail string.
- Roster data is low-sensitivity (names, emails, tiers, dates, partner links) — NOT high-grade PII. Security protects the WRITE actions, not the view. No TOTP, no PII masking (explicit scope decision).
- Add the `AuditLog` model to `prisma/schema.prisma`. Repo uses `prisma db push` (no migration files); note the deploy step.
- Bar: tsc clean, `next build` clean, vitest green, eslint clean. Match existing members-area styling.
- Board members are identified by `session.user.isBoard` (already populated from the `Member` table in `src/lib/auth.ts`).

---

### Task 1: AuditLog Prisma model + query helper

**Files:**
- Modify: `prisma/schema.prisma` (add `AuditLog` model)
- Create: `src/lib/audit.ts`
- Test: `src/lib/audit.test.ts`

**Interfaces:**
- Produces:
  - Prisma model `AuditLog { id String @id @default(cuid()); createdAt DateTime @default(now()); actorMemberId String?; actorEmail String; action String; targetMemberId String?; targetLabel String?; detail String? }`
  - `type AuditEntry = { actorMemberId?: string | null; actorEmail: string; action: string; targetMemberId?: string | null; targetLabel?: string | null; detail?: string | null }`
  - `recordAudit(entry: AuditEntry, db?: typeof prisma): Promise<void>` — inserts one row.
  - `formatAudit(action: string, targetLabel: string | null, detail: string | null): string` — pure, for display: e.g. `"set-secondary-email → Jane Doe: added jane2@x.com"`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/audit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatAudit } from './audit'

describe('formatAudit', () => {
  it('renders action, target, and detail', () => {
    expect(formatAudit('set-secondary-email', 'Jane Doe', 'added jane2@x.com'))
      .toBe('set-secondary-email → Jane Doe: added jane2@x.com')
  })
  it('omits the target arrow when no target', () => {
    expect(formatAudit('viewed-roster', null, null)).toBe('viewed-roster')
  })
  it('includes target but no detail when detail is null', () => {
    expect(formatAudit('set-partner', 'Jane Doe', null)).toBe('set-partner → Jane Doe')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/audit.test.ts`
Expected: FAIL — `./audit` module not found.

- [ ] **Step 3: Add the Prisma model + implement audit.ts**

In `prisma/schema.prisma`, add:

```prisma
model AuditLog {
  id             String   @id @default(cuid())
  createdAt      DateTime @default(now())
  actorMemberId  String?
  actorEmail     String
  action         String
  targetMemberId String?
  targetLabel    String?
  detail         String?
}
```

Create `src/lib/audit.ts`:

```typescript
import { prisma } from './db'

export type AuditEntry = {
  actorMemberId?: string | null
  actorEmail: string
  action: string
  targetMemberId?: string | null
  targetLabel?: string | null
  detail?: string | null
}

export async function recordAudit(entry: AuditEntry, db = prisma): Promise<void> {
  await db.auditLog.create({
    data: {
      actorMemberId: entry.actorMemberId ?? null,
      actorEmail: entry.actorEmail,
      action: entry.action,
      targetMemberId: entry.targetMemberId ?? null,
      targetLabel: entry.targetLabel ?? null,
      detail: entry.detail ?? null,
    },
  })
}

export function formatAudit(action: string, targetLabel: string | null, detail: string | null): string {
  let s = action
  if (targetLabel) s += ` → ${targetLabel}`
  if (detail) s += `: ${detail}`
  return s
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/audit.test.ts`
Expected: PASS. Then `npx prisma generate` (regenerate client so `prisma.auditLog` types exist), then `npx tsc --noEmit` — no new errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma src/lib/audit.ts src/lib/audit.test.ts
git commit -m "feat: AuditLog model + audit recording/formatting helper"
```

---

### Task 2: Roster write-back helper (secondary email + partner link)

**Files:**
- Modify: `src/lib/roster.ts` (add write helpers)
- Test: `src/lib/roster.test.ts`

**Interfaces:**
- Consumes: existing `sheetsClient()`, `SHEET_ID`, `TAB`, `fetchAllRosterRows`, `normalizeEmail`, `MemberRecord` from `roster.ts`.
- Produces:
  - `validateSecondaryEmail(email: string): { ok: true; value: string } | { ok: false; reason: string }` — pure: trims + normalizes, rejects empty / obviously-invalid (no `@`).
  - `setRosterField(memberEmail: string, column: 'Google Email' | 'Partner Email', value: string, deps?): Promise<{ ok: boolean; reason?: string }>` — finds the member's row by primary email, writes `value` into the named column, returns ok/failure. (`deps` allows injecting a fake sheets client + row fetch for testing.)

- [ ] **Step 1: Write the failing test**

Add to `src/lib/roster.test.ts`:

```typescript
import { validateSecondaryEmail } from './roster'

describe('validateSecondaryEmail', () => {
  it('accepts and normalizes a valid email', () => {
    expect(validateSecondaryEmail('  Jane2@Example.COM ')).toEqual({ ok: true, value: 'jane2@example.com' })
  })
  it('rejects empty', () => {
    expect(validateSecondaryEmail('   ').ok).toBe(false)
  })
  it('rejects a string with no @', () => {
    expect(validateSecondaryEmail('notanemail').ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/roster.test.ts`
Expected: FAIL — `validateSecondaryEmail` not exported.

- [ ] **Step 3: Implement the helpers**

In `src/lib/roster.ts` add:

```typescript
export function validateSecondaryEmail(email: string): { ok: true; value: string } | { ok: false; reason: string } {
  const v = normalizeEmail(email)
  if (!v) return { ok: false, reason: 'Email is required.' }
  if (!v.includes('@') || v.startsWith('@') || v.endsWith('@')) return { ok: false, reason: 'That does not look like an email.' }
  return { ok: true, value: v }
}

type WriteDeps = {
  fetchAll?: () => Promise<MemberRecord[]>
  writeCell?: (rowNumber: number, column: string, value: string) => Promise<void>
}

// Writes `value` into `column` for the row whose primary email matches memberEmail.
// Row number = header row (1) + index + 1 (sheet is 1-based, row 1 is headers).
export async function setRosterField(
  memberEmail: string,
  column: 'Google Email' | 'Partner Email',
  value: string,
  deps: WriteDeps = {},
): Promise<{ ok: boolean; reason?: string }> {
  const fetchAll = deps.fetchAll ?? fetchAllRosterRows
  const target = normalizeEmail(memberEmail)
  const rows = await fetchAll()
  const idx = rows.findIndex((m) => m.emailAddress === target)
  if (idx === -1) return { ok: false, reason: 'Member not found.' }
  const rowNumber = idx + 2 // +1 for header, +1 for 1-based
  const write = deps.writeCell ?? realWriteCell
  await write(rowNumber, column, value)
  return { ok: true }
}

async function realWriteCell(rowNumber: number, column: string, value: string): Promise<void> {
  if (!SHEET_ID) throw new Error('MEMBER_ROSTER_SHEET_ID not set')
  const sheets = sheetsClient()
  // Resolve the column letter from the header row.
  const headerRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!1:1` })
  const headers = (headerRes.data.values?.[0] ?? []).map((h) => String(h).trim())
  const colIdx = headers.indexOf(column)
  if (colIdx === -1) throw new Error(`Column "${column}" not found in roster`)
  const colLetter = String.fromCharCode(65 + colIdx) // A, B, C... (assumes < 26 cols)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!${colLetter}${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/roster.test.ts`
Expected: PASS (all prior roster tests still green + the 3 new). Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/roster.ts src/lib/roster.test.ts
git commit -m "feat: roster write-back helpers (validate + setRosterField)"
```

---

### Task 3: Admin server actions (board-gated, audited)

**Files:**
- Create: `src/app/members/admin/_actions/admin-actions.ts`
- Test: `src/app/members/admin/_actions/admin-actions.test.ts`

**Interfaces:**
- Consumes: `auth` from `@/lib/auth`; `setRosterField`, `validateSecondaryEmail` from `@/lib/roster`; `recordAudit` from `@/lib/audit`.
- Produces (all `'use server'`):
  - `requireBoard(): Promise<{ memberId?: string; email: string } | null>` — helper: returns the actor if board, else null. (Reads `auth()`.)
  - `setSecondaryEmailAction(memberEmail: string, memberName: string, secondary: string): Promise<{ ok: boolean; reason?: string }>` — board-gated; validates; writes `Google Email` column; records audit; returns result.
  - `setPartnerAction(memberEmail: string, memberName: string, partnerEmail: string): Promise<{ ok: boolean; reason?: string }>` — board-gated; validates the partner email; writes `Partner Email` column; records audit.

**Note for implementer:** server actions can't be unit-tested through the real `auth()`/Next runtime easily. Extract the pure decision logic into a testable inner function and test THAT. Specifically implement `applySecondaryEmail(deps, actor, memberEmail, memberName, secondary)` where deps = `{ setRosterField, recordAudit }` and actor = the board actor or null; the exported `'use server'` action is a thin wrapper that resolves the actor via `requireBoard()` then calls the inner function. Test the inner function.

- [ ] **Step 1: Write the failing test**

Create `src/app/members/admin/_actions/admin-actions.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { applySecondaryEmail } from './admin-actions'

const actor = { memberId: 'm-actor', email: 'jordan@wcb.com' }

function deps() {
  return {
    setRosterField: vi.fn(async () => ({ ok: true as const })),
    recordAudit: vi.fn(async () => {}),
  }
}

describe('applySecondaryEmail', () => {
  it('rejects when actor is not board (null actor)', async () => {
    const d = deps()
    const r = await applySecondaryEmail(d, null, 'jane@x.com', 'Jane', 'jane2@x.com')
    expect(r.ok).toBe(false)
    expect(d.setRosterField).not.toHaveBeenCalled()
    expect(d.recordAudit).not.toHaveBeenCalled()
  })
  it('rejects an invalid email without writing', async () => {
    const d = deps()
    const r = await applySecondaryEmail(d, actor, 'jane@x.com', 'Jane', 'notanemail')
    expect(r.ok).toBe(false)
    expect(d.setRosterField).not.toHaveBeenCalled()
  })
  it('writes the normalized email and records an audit entry when board', async () => {
    const d = deps()
    const r = await applySecondaryEmail(d, actor, 'jane@x.com', 'Jane', ' Jane2@X.com ')
    expect(r.ok).toBe(true)
    expect(d.setRosterField).toHaveBeenCalledWith('jane@x.com', 'Google Email', 'jane2@x.com')
    expect(d.recordAudit).toHaveBeenCalledOnce()
    const entry = d.recordAudit.mock.calls[0][0]
    expect(entry.action).toBe('set-secondary-email')
    expect(entry.actorEmail).toBe('jordan@wcb.com')
    expect(entry.targetLabel).toBe('Jane')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/members/admin/_actions/admin-actions.test.ts`
Expected: FAIL — module/`applySecondaryEmail` not found.

- [ ] **Step 3: Implement the actions**

Create `src/app/members/admin/_actions/admin-actions.ts`:

```typescript
'use server'

import { auth } from '@/lib/auth'
import { setRosterField, validateSecondaryEmail } from '@/lib/roster'
import { recordAudit, type AuditEntry } from '@/lib/audit'

type Actor = { memberId?: string; email: string }

type Deps = {
  setRosterField: typeof setRosterField
  recordAudit: (e: AuditEntry) => Promise<void>
}

export async function requireBoard(): Promise<Actor | null> {
  const s = await auth()
  if (!s?.user?.isBoard || !s.user.email) return null
  return { memberId: s.user.memberId, email: s.user.email }
}

// Pure, testable core. actor === null means "not board" → reject.
export async function applySecondaryEmail(
  deps: Deps, actor: Actor | null,
  memberEmail: string, memberName: string, secondary: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!actor) return { ok: false, reason: 'Not authorized.' }
  const v = validateSecondaryEmail(secondary)
  if (!v.ok) return { ok: false, reason: v.reason }
  const w = await deps.setRosterField(memberEmail, 'Google Email', v.value)
  if (!w.ok) return { ok: false, reason: w.reason ?? 'Write failed.' }
  await deps.recordAudit({
    actorMemberId: actor.memberId, actorEmail: actor.email,
    action: 'set-secondary-email', targetLabel: memberName, detail: `set to ${v.value}`,
  })
  return { ok: true }
}

export async function applyPartner(
  deps: Deps, actor: Actor | null,
  memberEmail: string, memberName: string, partnerEmail: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!actor) return { ok: false, reason: 'Not authorized.' }
  const v = validateSecondaryEmail(partnerEmail) // same shape check
  if (!v.ok) return { ok: false, reason: v.reason }
  const w = await deps.setRosterField(memberEmail, 'Partner Email', v.value)
  if (!w.ok) return { ok: false, reason: w.reason ?? 'Write failed.' }
  await deps.recordAudit({
    actorMemberId: actor.memberId, actorEmail: actor.email,
    action: 'set-partner', targetLabel: memberName, detail: `linked ${v.value}`,
  })
  return { ok: true }
}

const realDeps: Deps = { setRosterField, recordAudit }

export async function setSecondaryEmailAction(memberEmail: string, memberName: string, secondary: string) {
  return applySecondaryEmail(realDeps, await requireBoard(), memberEmail, memberName, secondary)
}

export async function setPartnerAction(memberEmail: string, memberName: string, partnerEmail: string) {
  return applyPartner(realDeps, await requireBoard(), memberEmail, memberName, partnerEmail)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/members/admin/_actions/admin-actions.test.ts`
Expected: PASS. Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/app/members/admin/_actions/admin-actions.ts src/app/members/admin/_actions/admin-actions.test.ts
git commit -m "feat: board-gated admin server actions (secondary email, partner) with audit"
```

---

### Task 4: The admin page — roster view + write UI

**Files:**
- Create: `src/app/members/admin/page.tsx`
- Create: `src/components/members/AdminRoster.tsx` (client component for the interactive rows)

**Interfaces:**
- Consumes: `auth` from `@/lib/auth`; `fetchAllRosterRows` from `@/lib/roster`; `setSecondaryEmailAction`, `setPartnerAction` from the actions module.

- [ ] **Step 1: Implement the page (server component, board-gated)**

Create `src/app/members/admin/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { fetchAllRosterRows } from '@/lib/roster'
import { AdminRoster } from '@/components/members/AdminRoster'

// Board-only console. Always reflect live roster (no static caching of member data).
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  if (!session.user.isBoard) redirect('/members')

  const rows = await fetchAllRosterRows()
  const members = rows.map((m) => ({
    name: m.name ?? '(no name)',
    email: m.emailAddress,
    googleEmail: m.googleEmail,
    tier: m.tier,
    current: m.current,
    isBoard: m.isBoard,
    role: m.role,
    partnerEmail: m.partnerEmail,
    expires: m.expires ? m.expires.toISOString().slice(0, 10) : null,
  }))

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl font-bold">Admin — Roster</h1>
      <p className="text-foreground/50 text-sm mt-1">
        Board-only. {members.length} members. Edits write back to the roster and are logged.
      </p>
      <AdminRoster members={members} />
    </div>
  )
}
```

- [ ] **Step 2: Implement the client roster component**

Create `src/components/members/AdminRoster.tsx`. Render a table/list of members (name, email, tier, current, board/role, expires). For each member provide a small inline form to set a secondary (Google) email and a partner email, calling `setSecondaryEmailAction` / `setPartnerAction` in a transition and surfacing ok/failure. Match members-area dark styling (border-border, bg-card-bg, text-accent). Escape apostrophes (react/no-unescaped-entities).

```tsx
'use client'
import { useState, useTransition } from 'react'
import { setSecondaryEmailAction, setPartnerAction } from '@/app/members/admin/_actions/admin-actions'

type Row = {
  name: string; email: string; googleEmail: string | null; tier: string | null
  current: boolean; isBoard: boolean; role: string | null; partnerEmail: string | null; expires: string | null
}

export function AdminRoster({ members }: { members: Row[] }) {
  return (
    <div className="mt-6 space-y-3">
      {members.map((m) => <MemberRow key={m.email} m={m} />)}
    </div>
  )
}

function MemberRow({ m }: { m: Row }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [secondary, setSecondary] = useState('')
  const [partner, setPartner] = useState('')

  function run(fn: () => Promise<{ ok: boolean; reason?: string }>, okMsg: string) {
    setMsg(null)
    start(async () => {
      const r = await fn()
      setMsg(r.ok ? okMsg : (r.reason ?? 'Failed.'))
    })
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card-bg/30 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-semibold">{m.name}</span>
        {m.isBoard && <span className="text-xs text-accent border border-accent/40 rounded-full px-2 py-0.5">{m.role ?? 'Board'}</span>}
        <span className={`text-xs ${m.current ? 'text-green-400' : 'text-foreground/40'}`}>{m.current ? 'current' : 'lapsed'}</span>
        {m.tier && <span className="text-xs text-foreground/50">{m.tier}</span>}
        {m.expires && <span className="text-xs text-foreground/40">expires {m.expires}</span>}
      </div>
      <p className="text-foreground/60 text-sm mt-1">{m.email}{m.googleEmail && ` · 2nd: ${m.googleEmail}`}{m.partnerEmail && ` · partner: ${m.partnerEmail}`}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input value={secondary} onChange={(e) => setSecondary(e.target.value)} placeholder="secondary email"
          className="rounded-lg border border-border bg-background/60 px-3 py-1 text-sm" />
        <button disabled={pending || !secondary} onClick={() => run(() => setSecondaryEmailAction(m.email, m.name, secondary), 'Secondary email saved.')}
          className="border border-border px-3 py-1 rounded-full text-sm disabled:opacity-50">Set 2nd email</button>
        <input value={partner} onChange={(e) => setPartner(e.target.value)} placeholder="partner email"
          className="rounded-lg border border-border bg-background/60 px-3 py-1 text-sm" />
        <button disabled={pending || !partner} onClick={() => run(() => setPartnerAction(m.email, m.name, partner), 'Partner linked.')}
          className="border border-border px-3 py-1 rounded-full text-sm disabled:opacity-50">Link partner</button>
      </div>
      {msg && <p className="mt-2 text-sm text-foreground/70">{msg}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Verify build + gate**

Run: `npx tsc --noEmit`, then `npx next build` (`/members/admin` compiles as `ƒ` dynamic). If a dev server is available, confirm: a non-board member hitting `/members/admin` is redirected to `/members`; a board member sees the roster.

- [ ] **Step 4: Commit**

```bash
git add src/app/members/admin/page.tsx src/components/members/AdminRoster.tsx
git commit -m "feat: /members/admin roster view + inline write actions (board-gated)"
```

---

### Task 5: Add Admin to the members nav (board-only link)

**Files:**
- Modify: `src/lib/nav.ts`
- Test: `src/lib/nav.test.ts` (if it exists; else add one)

**Interfaces:**
- Consumes: existing `MEMBER_LINKS`, `NavLink`, `visibleLinks(isBoard)` from `nav.ts`.

- [ ] **Step 1: Write/extend the failing test**

Add to `src/lib/nav.test.ts` (create if absent):

```typescript
import { describe, it, expect } from 'vitest'
import { visibleLinks } from './nav'

describe('admin nav link', () => {
  it('shows the Admin link to board members', () => {
    expect(visibleLinks(true).some((l) => l.href === '/members/admin')).toBe(true)
  })
  it('hides the Admin link from non-board members', () => {
    expect(visibleLinks(false).some((l) => l.href === '/members/admin')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nav.test.ts`
Expected: FAIL — no `/members/admin` link yet.

- [ ] **Step 3: Add the board-only Admin link**

In `src/lib/nav.ts`, add to `MEMBER_LINKS` (after Holdings, keep board links together). Use an existing `IconName` (e.g. `'shield'`):

```typescript
  { href: '/members/admin', label: 'Admin', icon: 'shield', board: true },
```

(`visibleLinks` already filters `board` links by `isBoard`, so no other change needed.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nav.test.ts`
Expected: PASS. Then `npx tsc --noEmit` and `npx next build`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav.ts src/lib/nav.test.ts
git commit -m "feat: board-only Admin link in members nav"
```

---

## Self-Review

**Spec coverage (Spec A):**
- Board-gated `/members/admin` route → Task 4 (+ nav Task 5) ✅
- Roster view for all officers → Task 4 ✅
- Two write actions (secondary email, partner link) written back to the sheet → Tasks 2 (helper) + 3 (actions) + 4 (UI) ✅
- Action audit log → Task 1 (model+helper) + 3 (actions record) ✅
- Server-side board re-check on every write → Task 3 (`requireBoard` in every action; `applyX` rejects null actor) ✅
- Sheet stays source of truth (write-back) → Task 2 ✅
- Security right-sized (protect writes, no TOTP/masking) → Task 3 gating; no masking added ✅

**Placeholder scan:** none. All code blocks concrete.

**Type consistency:** `AuditEntry` (Task 1) consumed by `recordAudit` + actions (Task 3); `setRosterField(memberEmail, column, value)` signature (Task 2) called identically in Task 3's test + impl; `Row` shape (Task 4 page) matches `AdminRoster` prop. `visibleLinks`/`NavLink.board` (Task 5) already exist.

---

## Notes for the implementer
- DEPLOY: after merge, run `prisma db push` so the live Postgres gets the `AuditLog` table (repo uses db push, no migration files). Same pattern as the `role` column.
- The two write actions assume the roster sheet's secondary-email column is header `Google Email` and partner column is `Partner Email` (both already mapped in `mapSheetRow`). If the real sheet uses different header text, adjust the column names in Task 2/3 — do NOT invent new columns.
- `realWriteCell` assumes < 26 roster columns (single-letter A–Z). If the sheet has ≥ 26 columns, the column-letter math needs extending — flag it, don't silently break.
