# WCB Lending System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the members-area lending system — a shared book + equipment library where each title can have multiple physical copies, with self-service checkout, returns, renewals, full loan history, per-copy equipment condition tracking, board admin, and a fail-soft Discord officer notification on checkout.

**Architecture:** A framework-free logic core (`src/lib/lending.ts`, DI'd db, unit-tested like `roster.ts`/`dashboard.ts`) holds all queries + mutations as pure functions. Next App Router **Server Actions** (`'use server'`) are the thin wrappers that authenticate, re-check `isBoard`, call the core, and fire the notification. Server-component pages render browse (one card per title); a client `ItemCard` holds the interactive buttons. Three new Prisma models: `LoanableItem` (title), `Copy` (physical unit), `Loan`.

**Tech Stack:** Next.js 16 (App Router, server components + server actions) + React 19 + TypeScript, Prisma 6 + Postgres (Fly), Tailwind v4 (hand-rolled tokens), Vitest, NextAuth v5 (`auth()` read-side).

## Global Constraints

- **Branch:** `feat/lending-system` (already created off `feat/members-dashboard`).
- **Title vs copy:** the club owns MULTIPLE copies of some titles. `LoanableItem` = the title (metadata, no status/condition). `Copy` = a physical unit (its own `status` + `currentCondition`). `Loan` points at a `copyId`. Browse = one card per title showing "N of M available".
- **Framework-free core:** `src/lib/lending.ts` + `src/lib/notify.ts` must NOT import next/next-auth/react. Only server actions + pages import framework code.
- **No Prisma enums:** schema uses plain `String`/`Boolean` (0 enum blocks exist). `category`/`status`/condition are `String`; represent allowed values as TS union types + validate in `lending.ts`. No `enum` blocks.
- **Member untouched:** `Loan.memberId` and `LoanableItem.addedById` are plain `String` (a `Member.id`) — NO relation/back-relation to `Member`. Real relations only between the 3 new models (`LoanableItem`→`Copy`→`Loan`).
- **Additive:** does NOT change `isCurrentMember`, the roster gate/sync, the dashboard, or auth. New models + new files only (plus the one-line FeatureNav edit).
- **Atomic copy claim:** checkout picks a candidate available copy, then `copy.updateMany({ where: { id: copyId, status: 'available' }, data: { status: 'out' } })` — `count === 1` = claimed; `count === 0` = lost that copy, try the next available copy; none left → `{ ok:false, reason:'unavailable' }`. `Loan` created only on a win, in a `$transaction`. Never read-then-write.
- **Due periods:** book = 30 days, equipment = 14 days from checkout. **Renewal cap = 2** (`renewedCount < 2`). Renew extends `dueAt` by the category default.
- **`canRenew(copy)` seam:** today returns `true` (holds deferred). Route the renew decision through it, don't hardcode inline.
- **Returns:** member may return their OWN active loan; `isBoard` may return ANY. Non-holder non-board → typed failure.
- **Condition = equipment only:** rating `New | Good | Fair | Poor | Damaged` + optional note, at checkout (`conditionOut`/`noteOut`) and return (`conditionIn`/`noteIn`). Books leave them null. Return updates the COPY's `currentCondition` from `conditionIn`.
- **Covers:** `coverUrl(isbn)` → `https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg` (trimmed); null/blank → null → placeholder. No storage.
- **Board admin:** gated on `session.user.isBoard`, RE-CHECKED server-side in every board action. Add title (+ N copies), add copies to a title, edit title, per-copy archive (soft-delete `Copy.status: 'archived'`). A copy currently `out` can't be archived. Never hard-delete. Browse excludes titles with 0 non-archived copies.
- **Discord notify:** `notify.ts` posts to `DISCORD_OFFICER_WEBHOOK_URL` on checkout only, fire-and-forget + fail-soft (unset/error → caught + logged, checkout still succeeds).
- **Styling:** house Tailwind v4 tokens (`bg-background`, `text-accent`/`bg-accent` #ff9500, `bg-card-bg`, `border-border`, `text-foreground/60`); card idiom `rounded-2xl border border-border/50 bg-card-bg/30 p-6 md:p-8`. No UI kit, no new deps.
- **Verification bar per task:** `npx tsc --noEmit` clean, `npx vitest run` green; UI/action tasks also `npm run build`. Framework-free tests with DI'd fakes, mutation-resistant. Implementers run `npx prisma generate` after schema edits but SKIP `db push` (no dev DB) — note it in the report.

---

### Task 1: Schema — `LoanableItem` + `Copy` + `Loan`

**Files:** Modify `prisma/schema.prisma`. (No test — verified by `prisma generate` + `tsc`.)

**Interfaces produced:** three models the plan consumes. Field names are load-bearing.

- [ ] **Step 1: Add the models** to `prisma/schema.prisma`:

```prisma
model LoanableItem {
  id          String   @id @default(cuid())
  category    String   // "book" | "equipment"
  title       String
  description String?
  addedById   String   // Member.id (no relation)
  author      String?  // book
  isbn        String?  // book
  notes       String?  // equipment
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  copies      Copy[]
  @@index([category])
}

model Copy {
  id               String       @id @default(cuid())
  itemId           String
  item             LoanableItem @relation(fields: [itemId], references: [id])
  status           String       @default("available") // "available" | "out" | "archived"
  label            String?
  currentCondition String?      // equipment: last return's conditionIn
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
  loans            Loan[]
  @@index([itemId, status])
}

model Loan {
  id           String   @id @default(cuid())
  copyId       String
  copy         Copy     @relation(fields: [copyId], references: [id])
  memberId     String   // Member.id (no relation)
  checkedOutAt DateTime @default(now())
  dueAt        DateTime
  returnedAt   DateTime?
  renewedCount Int      @default(0)
  conditionOut String?
  noteOut      String?
  conditionIn  String?
  noteIn       String?
  @@index([copyId])
  @@index([memberId])
}
```

- [ ] **Step 2: Regenerate the client** — `npx prisma generate` (succeeds; the 3 models appear).
- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean.
- [ ] **Step 4:** Do NOT run `prisma db push` (no dev DB) — note in report.
- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(lending): LoanableItem + Copy + Loan Prisma models"
```

---

### Task 2: `coverUrl` + `listTitles` — read core (copy-count aware)

**Files:** Create `src/lib/lending.ts`; Test `src/lib/lending.test.ts`.

**Interfaces produced:**
- `export type ItemCategory = 'book' | 'equipment'`
- `export type Condition = 'New' | 'Good' | 'Fair' | 'Poor' | 'Damaged'`
- `export function coverUrl(isbn: string | null | undefined): string | null`
- `export type TitleView = { id: string; category: string; title: string; description: string | null; author: string | null; isbn: string | null; notes: string | null; availableCount: number; totalCount: number; myLoan: { loanId: string; copyId: string; dueAt: Date; renewedCount: number } | null }`
- `export async function listTitles(category: ItemCategory, viewerMemberId: string, opts?: { availableOnly?: boolean }, deps?: { db?: typeof prisma }): Promise<TitleView[]>` — one entry per title with ≥1 non-archived copy; `availableCount` = copies with status 'available', `totalCount` = non-archived copies; `myLoan` = the viewer's active loan on any copy of this title, if any.

- [ ] **Step 1: Write the failing test** — `src/lib/lending.test.ts`:

```typescript
import { test, expect } from 'vitest'
import { coverUrl, listTitles } from './lending'

test('coverUrl: valid ISBN -> Open Library URL; trims; null/blank -> null', () => {
  expect(coverUrl(' 9780312429980 ')).toBe('https://covers.openlibrary.org/b/isbn/9780312429980-L.jpg')
  expect(coverUrl(null)).toBeNull()
  expect(coverUrl('')).toBeNull()
})

test('listTitles: per-title available/total counts, excludes all-archived, maps my active loan', async () => {
  // title T1: 3 copies (1 available, 1 out to me, 1 out to other) -> available 1 / total 3, myLoan set
  // title T2: 2 copies both archived -> excluded
  const titles = [
    { id: 'T1', category: 'book', title: 'Dune', description: null, author: 'H', isbn: '111', notes: null,
      copies: [
        { id: 'c1', status: 'available', loans: [] },
        { id: 'c2', status: 'out', loans: [{ id: 'L2', copyId: 'c2', memberId: 'me', dueAt: new Date('2027-01-01'), renewedCount: 1, returnedAt: null }] },
        { id: 'c3', status: 'out', loans: [{ id: 'L3', copyId: 'c3', memberId: 'other', dueAt: new Date('2027-01-01'), renewedCount: 0, returnedAt: null }] },
      ] },
    { id: 'T2', category: 'book', title: 'Gone', description: null, author: null, isbn: null, notes: null,
      copies: [ { id: 'c4', status: 'archived', loans: [] }, { id: 'c5', status: 'archived', loans: [] } ] },
  ]
  const db = { loanableItem: { findMany: async ({ where }: any) => {
    expect(where.category).toBe('book')
    return titles
  } } } as any
  const out = await listTitles('book', 'me', {}, { db })
  expect(out.map(t => t.id)).toEqual(['T1']) // T2 all-archived -> excluded
  expect(out[0].availableCount).toBe(1)
  expect(out[0].totalCount).toBe(2) // non-archived copies only (c1,c2,c3 are non-archived => 3)... see note
  expect(out[0].myLoan?.loanId).toBe('L2')
})
```

> Note for implementer: `totalCount` = non-archived copies. In the fixture T1 has 3 non-archived copies (c1 available, c2+c3 out) → **`totalCount` should be 3**, `availableCount` 1. Fix the test's `totalCount` expectation to `3` when writing (the inline `2` above is a deliberate think-it-through: count c1+c2+c3). Assert `availableCount === 1`, `totalCount === 3`.

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/lending.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `src/lib/lending.ts`:

```typescript
import { prisma } from './db'

export type ItemCategory = 'book' | 'equipment'
export type Condition = 'New' | 'Good' | 'Fair' | 'Poor' | 'Damaged'

export function coverUrl(isbn: string | null | undefined): string | null {
  const v = (isbn ?? '').trim()
  return v ? `https://covers.openlibrary.org/b/isbn/${v}-L.jpg` : null
}

export type TitleView = {
  id: string; category: string; title: string; description: string | null
  author: string | null; isbn: string | null; notes: string | null
  availableCount: number; totalCount: number
  myLoan: { loanId: string; copyId: string; dueAt: Date; renewedCount: number } | null
}

export async function listTitles(
  category: ItemCategory,
  viewerMemberId: string,
  opts: { availableOnly?: boolean } = {},
  deps: { db?: typeof prisma } = {},
): Promise<TitleView[]> {
  const db = deps.db ?? prisma
  const rows = await db.loanableItem.findMany({
    where: { category },
    include: { copies: { where: { status: { not: 'archived' } }, include: { loans: { where: { returnedAt: null } } } } },
    orderBy: { title: 'asc' },
  })
  const views: TitleView[] = []
  for (const r of rows as any[]) {
    const copies = r.copies ?? []
    if (copies.length === 0) continue // all copies archived -> hide title
    const available = copies.filter((c: any) => c.status === 'available').length
    if (opts.availableOnly && available === 0) continue
    let myLoan: TitleView['myLoan'] = null
    for (const c of copies) {
      const l = (c.loans ?? []).find((x: any) => x.memberId === viewerMemberId)
      if (l) { myLoan = { loanId: l.id, copyId: c.id, dueAt: l.dueAt, renewedCount: l.renewedCount }; break }
    }
    views.push({
      id: r.id, category: r.category, title: r.title, description: r.description,
      author: r.author, isbn: r.isbn, notes: r.notes,
      availableCount: available, totalCount: copies.length, myLoan,
    })
  }
  return views
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/lib/lending.test.ts` (with `totalCount` fixed to 3) → PASS. `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lending.ts src/lib/lending.test.ts
git commit -m "feat(lending): coverUrl + listTitles (per-title copy counts)"
```

---

### Task 3: `checkoutTitle` — claim an available copy atomically

**Files:** Modify `src/lib/lending.ts`; Test `src/lib/lending.test.ts`.

**Interfaces produced:**
- `export const DUE_DAYS: Record<ItemCategory, number>` = `{ book: 30, equipment: 14 }`
- `export type CheckoutResult = { ok: true; loanId: string; copyId: string; dueAt: Date } | { ok: false; reason: 'unavailable' | 'not_found' }`
- `export async function checkoutTitle(itemId: string, memberId: string, cond?: { conditionOut?: Condition; noteOut?: string }, deps?: { db?: typeof prisma; now?: Date }): Promise<CheckoutResult>` — finds the title's available copies, claims one atomically (retrying other copies if a claim loses), creates the loan.

- [ ] **Step 1: Write the failing test** — append to `src/lib/lending.test.ts`:

```typescript
import { checkoutTitle } from './lending'

function fakeCheckoutDb(category: string, availableCopyIds: string[], claimable: Set<string>) {
  const created: any[] = []
  const flipped: string[] = []
  return {
    _created: created, _flipped: flipped,
    loanableItem: { findUnique: async () => ({ id: 'T1', category }) },
    copy: {
      findMany: async ({ where }: any) => {
        expect(where.itemId).toBe('T1'); expect(where.status).toBe('available')
        return availableCopyIds.map(id => ({ id }))
      },
      updateMany: async ({ where }: any) => {
        // claim succeeds only if this copy is in `claimable`
        if (where.status === 'available' && claimable.has(where.id)) { flipped.push(where.id); return { count: 1 } }
        return { count: 0 }
      },
    },
    loan: { create: async ({ data }: any) => { created.push(data); return { id: 'L1', ...data } } },
    $transaction: async (fn: any) => fn({
      copy: { updateMany: async ({ where }: any) => (where.status === 'available' && claimable.has(where.id) ? (flipped.push(where.id), { count: 1 }) : { count: 0 }) },
      loan: { create: async ({ data }: any) => { created.push(data); return { id: 'L1', ...data } } },
    }),
  } as any
}

const NOW = new Date('2026-08-10T00:00:00Z')

test('checkoutTitle: book with an available copy -> claims it, loan created, dueAt now+30d', async () => {
  const db = fakeCheckoutDb('book', ['c1', 'c2'], new Set(['c1']))
  const r = await checkoutTitle('T1', 'm1', {}, { db, now: NOW })
  expect(r.ok).toBe(true)
  if (r.ok) { expect(r.copyId).toBe('c1'); expect(r.dueAt.toISOString().slice(0,10)).toBe('2026-09-09') }
  expect(db._created[0].conditionOut).toBeUndefined()
})

test('checkoutTitle: race — first candidate lost, retries next available copy', async () => {
  const db = fakeCheckoutDb('book', ['c1', 'c2'], new Set(['c2'])) // c1 not claimable (taken), c2 is
  const r = await checkoutTitle('T1', 'm1', {}, { db, now: NOW })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.copyId).toBe('c2')
})

test('checkoutTitle: no copies claimable -> unavailable, no loan', async () => {
  const db = fakeCheckoutDb('book', ['c1'], new Set()) // c1 lost the race
  const r = await checkoutTitle('T1', 'm1', {}, { db, now: NOW })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.reason).toBe('unavailable')
  expect(db._created.length).toBe(0)
})

test('checkoutTitle: equipment records conditionOut, dueAt now+14d', async () => {
  const db = fakeCheckoutDb('equipment', ['c1'], new Set(['c1']))
  const r = await checkoutTitle('T1', 'm1', { conditionOut: 'Good', noteOut: 'clean' }, { db, now: NOW })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.dueAt.toISOString().slice(0,10)).toBe('2026-08-24')
  expect(db._created[0].conditionOut).toBe('Good')
})
```

- [ ] **Step 2: Run test to verify it fails** — FAIL (`checkoutTitle` missing).

- [ ] **Step 3: Implement** — append to `src/lib/lending.ts`:

```typescript
export const DUE_DAYS: Record<ItemCategory, number> = { book: 30, equipment: 14 }

export type CheckoutResult =
  | { ok: true; loanId: string; copyId: string; dueAt: Date }
  | { ok: false; reason: 'unavailable' | 'not_found' }

export async function checkoutTitle(
  itemId: string,
  memberId: string,
  cond: { conditionOut?: Condition; noteOut?: string } = {},
  deps: { db?: typeof prisma; now?: Date } = {},
): Promise<CheckoutResult> {
  const db = deps.db ?? prisma
  const now = deps.now ?? new Date()
  const item = await db.loanableItem.findUnique({ where: { id: itemId } })
  if (!item) return { ok: false, reason: 'not_found' }
  const days = DUE_DAYS[item.category as ItemCategory] ?? 14
  const dueAt = new Date(now.getTime() + days * 86_400_000)
  const isEquip = item.category === 'equipment'

  const candidates = await db.copy.findMany({ where: { itemId, status: 'available' } })
  for (const c of candidates as any[]) {
    const result = await db.$transaction(async (tx: any) => {
      const claim = await tx.copy.updateMany({ where: { id: c.id, status: 'available' }, data: { status: 'out' } })
      if (claim.count !== 1) return null // lost this copy; try the next candidate
      const loan = await tx.loan.create({
        data: { copyId: c.id, memberId, dueAt, ...(isEquip && cond.conditionOut ? { conditionOut: cond.conditionOut, noteOut: cond.noteOut ?? null } : {}) },
      })
      return { loanId: loan.id, copyId: c.id }
    })
    if (result) return { ok: true, loanId: result.loanId, copyId: result.copyId, dueAt }
  }
  return { ok: false, reason: 'unavailable' }
}
```

- [ ] **Step 4: Run test to verify it passes** — PASS (all checkout tests + Task 2). `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lending.ts src/lib/lending.test.ts
git commit -m "feat(lending): checkoutTitle claims an available copy atomically"
```

---

### Task 4: `returnLoan` + `renewLoan` + `canRenew`

**Files:** Modify `src/lib/lending.ts`; Test `src/lib/lending.test.ts`.

**Interfaces produced:**
- `export function canRenew(_copy: { id: string }): boolean` (today `true` — holds seam)
- `export const RENEW_CAP = 2`
- `export type ReturnResult = { ok: true } | { ok: false; reason: 'not_found' | 'forbidden' | 'already_returned' }`
- `export async function returnLoan(loanId: string, actingMemberId: string, isBoard: boolean, cond?: { conditionIn?: Condition; noteIn?: string }, deps?: { db?: typeof prisma; now?: Date }): Promise<ReturnResult>`
- `export type RenewResult = { ok: true; dueAt: Date } | { ok: false; reason: 'not_found' | 'forbidden' | 'already_returned' | 'cap_reached' | 'blocked' }`
- `export async function renewLoan(loanId: string, actingMemberId: string, deps?: { db?: typeof prisma }): Promise<RenewResult>`

The loan's `copy` (with `item.category`) is loaded via `include: { copy: { include: { item: true } } }`.

- [ ] **Step 1: Write the failing test** — append to `src/lib/lending.test.ts`:

```typescript
import { returnLoan, renewLoan, canRenew, RENEW_CAP } from './lending'

function fakeLoanDb(loan: any) {
  const upd: any = { loan: {}, copy: {} }
  return {
    _upd: upd,
    loan: { findUnique: async () => loan, update: async ({ data }: any) => { Object.assign(upd.loan, data); return { ...loan, ...data } } },
    copy: { update: async ({ data }: any) => { Object.assign(upd.copy, data); return data } },
  } as any
}

test('returnLoan: holder returns equipment -> returnedAt set, copy available + currentCondition updated', async () => {
  const loan = { id: 'L1', copyId: 'c1', memberId: 'm1', returnedAt: null, copy: { id: 'c1', item: { category: 'equipment' } } }
  const db = fakeLoanDb(loan)
  const r = await returnLoan('L1', 'm1', false, { conditionIn: 'Fair', noteIn: 'scuffed' }, { db, now: new Date('2026-08-10') })
  expect(r.ok).toBe(true)
  expect(db._upd.loan.conditionIn).toBe('Fair')
  expect(db._upd.copy.status).toBe('available')
  expect(db._upd.copy.currentCondition).toBe('Fair')
})

test('returnLoan: non-holder non-board -> forbidden, no change', async () => {
  const loan = { id: 'L1', copyId: 'c1', memberId: 'm1', returnedAt: null, copy: { id: 'c1', item: { category: 'book' } } }
  const db = fakeLoanDb(loan)
  const r = await returnLoan('L1', 'other', false, {}, { db })
  expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe('forbidden')
  expect(db._upd.loan.returnedAt).toBeUndefined()
})

test('returnLoan: board returns anyone', async () => {
  const loan = { id: 'L1', copyId: 'c1', memberId: 'm1', returnedAt: null, copy: { id: 'c1', item: { category: 'book' } } }
  const db = fakeLoanDb(loan)
  expect((await returnLoan('L1', 'officer', true, {}, { db, now: new Date('2026-08-10') })).ok).toBe(true)
})

test('renewLoan: holder under cap -> extends dueAt +30d (book), bumps count', async () => {
  const loan = { id: 'L1', copyId: 'c1', memberId: 'm1', returnedAt: null, renewedCount: 0, dueAt: new Date('2026-08-20'), copy: { id: 'c1', item: { category: 'book' } } }
  const db = fakeLoanDb(loan)
  const r = await renewLoan('L1', 'm1', { db })
  expect(r.ok).toBe(true); if (r.ok) expect(r.dueAt.toISOString().slice(0,10)).toBe('2026-09-19')
  expect(db._upd.loan.renewedCount).toBe(1)
})

test('renewLoan: at cap -> cap_reached, no change', async () => {
  const loan = { id: 'L1', copyId: 'c1', memberId: 'm1', returnedAt: null, renewedCount: RENEW_CAP, dueAt: new Date('2026-08-20'), copy: { id: 'c1', item: { category: 'book' } } }
  const db = fakeLoanDb(loan)
  const r = await renewLoan('L1', 'm1', { db })
  expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe('cap_reached')
  expect(db._upd.loan.renewedCount).toBeUndefined()
})

test('canRenew: seam returns true', () => { expect(canRenew({ id: 'c1' })).toBe(true) })
```

- [ ] **Step 2: Run test to verify it fails** — FAIL (exports missing).

- [ ] **Step 3: Implement** — append to `src/lib/lending.ts`:

```typescript
export const RENEW_CAP = 2

// Holds seam: today any holder may renew. A future hold queue overrides this
// to return false when someone is waiting on the copy.
export function canRenew(_copy: { id: string }): boolean { return true }

export type ReturnResult = { ok: true } | { ok: false; reason: 'not_found' | 'forbidden' | 'already_returned' }

export async function returnLoan(
  loanId: string, actingMemberId: string, isBoard: boolean,
  cond: { conditionIn?: Condition; noteIn?: string } = {},
  deps: { db?: typeof prisma; now?: Date } = {},
): Promise<ReturnResult> {
  const db = deps.db ?? prisma
  const now = deps.now ?? new Date()
  const loan = await db.loan.findUnique({ where: { id: loanId }, include: { copy: { include: { item: true } } } })
  if (!loan) return { ok: false, reason: 'not_found' }
  if (loan.returnedAt) return { ok: false, reason: 'already_returned' }
  if (!isBoard && loan.memberId !== actingMemberId) return { ok: false, reason: 'forbidden' }
  const isEquip = loan.copy?.item?.category === 'equipment'
  await db.loan.update({ where: { id: loanId }, data: { returnedAt: now, ...(isEquip && cond.conditionIn ? { conditionIn: cond.conditionIn, noteIn: cond.noteIn ?? null } : {}) } })
  await db.copy.update({ where: { id: loan.copyId }, data: { status: 'available', ...(isEquip && cond.conditionIn ? { currentCondition: cond.conditionIn } : {}) } })
  return { ok: true }
}

export type RenewResult =
  | { ok: true; dueAt: Date }
  | { ok: false; reason: 'not_found' | 'forbidden' | 'already_returned' | 'cap_reached' | 'blocked' }

export async function renewLoan(loanId: string, actingMemberId: string, deps: { db?: typeof prisma } = {}): Promise<RenewResult> {
  const db = deps.db ?? prisma
  const loan = await db.loan.findUnique({ where: { id: loanId }, include: { copy: { include: { item: true } } } })
  if (!loan) return { ok: false, reason: 'not_found' }
  if (loan.returnedAt) return { ok: false, reason: 'already_returned' }
  if (loan.memberId !== actingMemberId) return { ok: false, reason: 'forbidden' }
  if (loan.renewedCount >= RENEW_CAP) return { ok: false, reason: 'cap_reached' }
  if (!canRenew({ id: loan.copyId })) return { ok: false, reason: 'blocked' }
  const days = DUE_DAYS[(loan.copy?.item?.category as ItemCategory)] ?? 14
  const dueAt = new Date(loan.dueAt.getTime() + days * 86_400_000)
  await db.loan.update({ where: { id: loanId }, data: { dueAt, renewedCount: loan.renewedCount + 1 } })
  return { ok: true, dueAt }
}
```

- [ ] **Step 4: Run test to verify it passes** — PASS (return/renew + prior). `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lending.ts src/lib/lending.test.ts
git commit -m "feat(lending): returnLoan + renewLoan + canRenew seam"
```

---

### Task 5: `addTitle` / `addCopies` / `editTitle` / `archiveCopy` — board mutations

**Files:** Modify `src/lib/lending.ts`; Test `src/lib/lending.test.ts`.

**Interfaces produced:**
- `export type NewTitleInput = { category: ItemCategory; title: string; description?: string; author?: string; isbn?: string; notes?: string; copies?: number; initialCondition?: Condition }`
- `export async function addTitle(input: NewTitleInput, addedById: string, deps?: { db?: typeof prisma }): Promise<{ id: string }>` — creates the title + `max(1, copies ?? 1)` `Copy` rows (status available; `currentCondition` seeded from `initialCondition` for equipment).
- `export async function addCopies(itemId: string, count: number, initialCondition: Condition | undefined, deps?: { db?: typeof prisma }): Promise<{ added: number }>`
- `export async function editTitle(id: string, patch: Partial<Omit<NewTitleInput, 'category' | 'copies' | 'initialCondition'>>, deps?: { db?: typeof prisma }): Promise<void>`
- `export type ArchiveResult = { ok: true } | { ok: false; reason: 'not_found' | 'out' }`
- `export async function archiveCopy(copyId: string, deps?: { db?: typeof prisma }): Promise<ArchiveResult>`

> These do NOT check `isBoard` — the caller (server action, Task 7) enforces it. Keeping the core auth-free preserves the framework-free seam. Intentional — not a "missing auth check".

- [ ] **Step 1: Write the failing test** — append:

```typescript
import { addTitle, archiveCopy } from './lending'

test('addTitle: creates title + N available copies with addedById', async () => {
  let title: any = null; const copies: any[] = []
  const db = { loanableItem: { create: async ({ data }: any) => { title = data; return { id: 'T1' } } },
    copy: { create: async ({ data }: any) => { copies.push(data); return { id: 'c' + copies.length } } } } as any
  const r = await addTitle({ category: 'book', title: 'Dune', author: 'H', isbn: '1', copies: 3 }, 'officer', { db })
  expect(r.id).toBe('T1')
  expect(title.addedById).toBe('officer')
  expect(copies.length).toBe(3)
  expect(copies.every(c => c.status === 'available' && c.itemId === 'T1')).toBe(true)
})

test('addTitle: defaults to 1 copy; equipment seeds currentCondition', async () => {
  const copies: any[] = []
  const db = { loanableItem: { create: async () => ({ id: 'T1' }) },
    copy: { create: async ({ data }: any) => { copies.push(data); return { id: 'c1' } } } } as any
  await addTitle({ category: 'equipment', title: 'pH Meter', initialCondition: 'New' }, 'officer', { db })
  expect(copies.length).toBe(1)
  expect(copies[0].currentCondition).toBe('New')
})

test('archiveCopy: available -> archived; out -> blocked (no update)', async () => {
  const okDb = { copy: { findUnique: async () => ({ id: 'c1', status: 'available' }), update: async ({ data }: any) => data } } as any
  expect((await archiveCopy('c1', { db: okDb })).ok).toBe(true)
  let updated = false
  const outDb = { copy: { findUnique: async () => ({ id: 'c1', status: 'out' }), update: async () => { updated = true; return {} } } } as any
  const r = await archiveCopy('c1', { db: outDb })
  expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe('out')
  expect(updated).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails** — FAIL.

- [ ] **Step 3: Implement** — append:

```typescript
export type NewTitleInput = {
  category: ItemCategory; title: string; description?: string
  author?: string; isbn?: string; notes?: string
  copies?: number; initialCondition?: Condition
}

export async function addTitle(input: NewTitleInput, addedById: string, deps: { db?: typeof prisma } = {}): Promise<{ id: string }> {
  const db = deps.db ?? prisma
  const title = await db.loanableItem.create({
    data: {
      category: input.category, title: input.title, description: input.description ?? null,
      author: input.author ?? null, isbn: input.isbn ?? null, notes: input.notes ?? null, addedById,
    },
  })
  const n = Math.max(1, input.copies ?? 1)
  const seed = input.category === 'equipment' ? (input.initialCondition ?? null) : null
  for (let i = 0; i < n; i++) {
    await db.copy.create({ data: { itemId: title.id, status: 'available', currentCondition: seed } })
  }
  return { id: title.id }
}

export async function addCopies(itemId: string, count: number, initialCondition: Condition | undefined, deps: { db?: typeof prisma } = {}): Promise<{ added: number }> {
  const db = deps.db ?? prisma
  const n = Math.max(1, count)
  for (let i = 0; i < n; i++) {
    await db.copy.create({ data: { itemId, status: 'available', currentCondition: initialCondition ?? null } })
  }
  return { added: n }
}

export async function editTitle(id: string, patch: Partial<Omit<NewTitleInput, 'category' | 'copies' | 'initialCondition'>>, deps: { db?: typeof prisma } = {}): Promise<void> {
  const db = deps.db ?? prisma
  await db.loanableItem.update({ where: { id }, data: { ...patch } })
}

export type ArchiveResult = { ok: true } | { ok: false; reason: 'not_found' | 'out' }

export async function archiveCopy(copyId: string, deps: { db?: typeof prisma } = {}): Promise<ArchiveResult> {
  const db = deps.db ?? prisma
  const copy = await db.copy.findUnique({ where: { id: copyId } })
  if (!copy) return { ok: false, reason: 'not_found' }
  if (copy.status === 'out') return { ok: false, reason: 'out' }
  await db.copy.update({ where: { id: copyId }, data: { status: 'archived' } })
  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes** — PASS (board mutations + prior). `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lending.ts src/lib/lending.test.ts
git commit -m "feat(lending): addTitle/addCopies/editTitle/archiveCopy board mutations"
```

---

### Task 6: `notify.ts` — Discord officer notification (fail-soft)

**Files:** Create `src/lib/notify.ts`; Test `src/lib/notify.test.ts`.

**Interfaces produced:** `export async function notifyOfficersCheckout(input: { memberName: string; title: string; category: string; dueAt: Date }, deps?: { fetch?: typeof fetch; webhookUrl?: string }): Promise<void>` — builds a message + POSTs to the Discord webhook; ALWAYS resolves (never throws), even on error or unset URL.

- [ ] **Step 1: Write the failing test** — `src/lib/notify.test.ts`:

```typescript
import { test, expect } from 'vitest'
import { notifyOfficersCheckout } from './notify'

const INPUT = { memberName: 'Jordan L.', title: 'pH Meter', category: 'equipment', dueAt: new Date('2026-08-24T00:00:00Z') }

test('posts a message with item + due date to the webhook', async () => {
  let body: any = null
  const fakeFetch = (async (_u: string, init: any) => { body = JSON.parse(init.body); return { ok: true } }) as any
  await notifyOfficersCheckout(INPUT, { fetch: fakeFetch, webhookUrl: 'https://discord/webhook' })
  expect(body.content).toContain('pH Meter')
  expect(body.content).toContain('2026-08-24')
})

test('unset webhook -> no-op, no fetch, no throw', async () => {
  let called = false
  const fakeFetch = (async () => { called = true; return { ok: true } }) as any
  await expect(notifyOfficersCheckout(INPUT, { fetch: fakeFetch, webhookUrl: '' })).resolves.toBeUndefined()
  expect(called).toBe(false)
})

test('fetch throws -> swallowed (still resolves)', async () => {
  const fakeFetch = (async () => { throw new Error('discord down') }) as any
  await expect(notifyOfficersCheckout(INPUT, { fetch: fakeFetch, webhookUrl: 'https://discord/webhook' })).resolves.toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails** — FAIL (module missing).

- [ ] **Step 3: Implement** `src/lib/notify.ts`:

```typescript
export async function notifyOfficersCheckout(
  input: { memberName: string; title: string; category: string; dueAt: Date },
  deps: { fetch?: typeof fetch; webhookUrl?: string } = {},
): Promise<void> {
  const url = deps.webhookUrl ?? process.env.DISCORD_OFFICER_WEBHOOK_URL ?? ''
  if (!url) return
  const doFetch = deps.fetch ?? fetch
  const due = input.dueAt.toISOString().slice(0, 10)
  const content = `📦 ${input.memberName} checked out **${input.title}** (${input.category}) · due ${due} · arrange handoff.`
  try {
    await doFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content }) })
  } catch (e) {
    console.error('officer notification failed (checkout still succeeded):', e)
  }
}
```

- [ ] **Step 4: Run test to verify it passes** — PASS (all 3). `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notify.ts src/lib/notify.test.ts
git commit -m "feat(lending): notify.ts Discord officer notification (fail-soft)"
```

---

### Task 7: Server actions — auth + isBoard wiring

**Files:** Create `src/app/members/_actions/lending-actions.ts`. (No unit test — thin auth wrappers over the tested core; verified by tsc + build.)

**Interfaces produced:** `'use server'` actions the Task 8 UI imports: `checkoutAction`, `returnAction`, `renewAction`, `addTitleAction`, `addCopiesAction`, `editTitleAction`, `archiveCopyAction`. Each returns a plain serializable `{ ok, reason? }`/`{ ok, id }` result.

- [ ] **Step 1: Create the actions file**:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import {
  checkoutTitle, returnLoan, renewLoan, addTitle, addCopies, editTitle, archiveCopy,
  type NewTitleInput, type Condition,
} from '@/lib/lending'
import { notifyOfficersCheckout } from '@/lib/notify'

function revalidateBrowse() { revalidatePath('/members/library'); revalidatePath('/members/equipment') }

async function requireMember() {
  const session = await auth()
  const memberId = session?.user?.memberId
  if (!memberId) throw new Error('unauthorized')
  return { memberId, isBoard: !!session!.user!.isBoard, name: session!.user!.name ?? session!.user!.email ?? 'A member' }
}
async function requireBoard() {
  const m = await requireMember()
  if (!m.isBoard) throw new Error('forbidden')
  return m
}

export async function checkoutAction(itemId: string, itemTitle: string, category: string, cond?: { conditionOut?: Condition; noteOut?: string }) {
  const { memberId, name } = await requireMember()
  const r = await checkoutTitle(itemId, memberId, cond)
  if (r.ok) { await notifyOfficersCheckout({ memberName: name, title: itemTitle, category, dueAt: r.dueAt }); revalidateBrowse() }
  return r
}
export async function returnAction(loanId: string, cond?: { conditionIn?: Condition; noteIn?: string }) {
  const { memberId, isBoard } = await requireMember()
  const r = await returnLoan(loanId, memberId, isBoard, cond)
  if (r.ok) revalidateBrowse()
  return r
}
export async function renewAction(loanId: string) {
  const { memberId } = await requireMember()
  const r = await renewLoan(loanId, memberId)
  if (r.ok) revalidateBrowse()
  return r
}
export async function addTitleAction(input: NewTitleInput) {
  const { memberId } = await requireBoard()
  const r = await addTitle(input, memberId)
  revalidateBrowse()
  return { ok: true as const, id: r.id }
}
export async function addCopiesAction(itemId: string, count: number, initialCondition?: Condition) {
  await requireBoard()
  const r = await addCopies(itemId, count, initialCondition)
  revalidateBrowse()
  return { ok: true as const, added: r.added }
}
export async function editTitleAction(id: string, patch: Partial<Omit<NewTitleInput, 'category' | 'copies' | 'initialCondition'>>) {
  await requireBoard()
  await editTitle(id, patch)
  revalidateBrowse()
  return { ok: true as const }
}
export async function archiveCopyAction(copyId: string) {
  await requireBoard()
  const r = await archiveCopy(copyId)
  if (r.ok) revalidateBrowse()
  return r
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean (confirms action signatures line up with the core types + session shape `memberId`/`isBoard`/`name`).
- [ ] **Step 3: Verify build** — `npm run build` compiles; server actions register.
- [ ] **Step 4: Commit**

```bash
git add src/app/members/_actions/lending-actions.ts
git commit -m "feat(lending): server actions (auth + isBoard wiring)"
```

---

### Task 8: Pages + `TitleCard` + board add-form + FeatureNav links

**Files:** Create `src/components/members/TitleCard.tsx`, `src/components/members/AddTitleForm.tsx`; Create `src/app/members/library/page.tsx`, `src/app/members/equipment/page.tsx`; Modify `src/components/members/FeatureNav.tsx`.

**Interfaces consumed:** `listTitles`, `coverUrl`, `TitleView` from `@/lib/lending`; the Task 7 actions; `auth` from `@/lib/auth`.

- [ ] **Step 1: `TitleCard.tsx`** — `'use client'`. Renders one `TitleView`. Books show `coverUrl(isbn)` (placeholder div on null) + author; equipment shows description. Availability line: **"{availableCount} of {totalCount} available"**. Actions by state:
  - `availableCount > 0` → "Check out" (equipment first shows a condition `<select>` → passes `conditionOut`).
  - `myLoan` set → "You have this · due {date}" + "Return" (equipment shows condition select → `conditionIn`) + "Renew"; overdue (`myLoan.dueAt < now`) → red "Overdue".
  - Board (`isBoard`) → per-title "Add copy" + "Edit"; archive is per-copy (v1: an "Archive a copy" affordance that archives one available copy via `archiveCopyAction` — the card doesn't enumerate individual copies in v1; board manages counts. If no available copy to archive, disable).
  Use the house card idiom. On `{ok:false}`, show the reason inline (`unavailable` → "Just taken — refresh."). Buttons call the Task 7 actions via `useTransition`.

```tsx
'use client'
import { useState, useTransition } from 'react'
import type { TitleView } from '@/lib/lending'
import { coverUrl } from '@/lib/lending'
import { checkoutAction, returnAction, renewAction } from '@/app/members/_actions/lending-actions'

const CONDITIONS = ['New','Good','Fair','Poor','Damaged'] as const

export function TitleCard({ item, isBoard }: { item: TitleView; isBoard: boolean }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [cond, setCond] = useState<string>('Good')
  const isEquip = item.category === 'equipment'
  const cover = coverUrl(item.isbn)
  const overdue = item.myLoan && item.myLoan.dueAt.getTime() < Date.now()

  function run(fn: () => Promise<{ ok: boolean; reason?: string }>) {
    setErr(null)
    start(async () => { const r = await fn(); if (!r.ok) setErr(r.reason === 'unavailable' ? 'Just taken — refresh.' : (r.reason ?? 'Action failed.')) })
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card-bg/30 p-6 md:p-8">
      {item.category === 'book' && (cover
        ? <img src={cover} alt="" className="w-20 h-28 object-cover rounded mb-3 bg-card-bg" />
        : <div className="w-20 h-28 rounded mb-3 bg-card-bg/60 border border-border/40" />)}
      <p className="font-semibold">{item.title}</p>
      {item.author && <p className="text-foreground/50 text-sm">{item.author}</p>}
      {item.description && <p className="text-foreground/60 text-sm mt-1">{item.description}</p>}
      <p className="text-foreground/50 text-sm mt-2">{item.availableCount} of {item.totalCount} available</p>
      {item.myLoan && <p className="text-foreground/70 text-sm mt-1">You have this · due {item.myLoan.dueAt.toISOString().slice(0,10)}{overdue && <span className="ml-2 text-red-400">Overdue</span>}</p>}

      {isEquip && (item.availableCount > 0 || item.myLoan) && (
        <select value={cond} onChange={e => setCond(e.target.value)} className="mt-3 block rounded-lg border border-border bg-background/60 px-2 py-1 text-sm">
          {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {item.availableCount > 0 && !item.myLoan && (
          <button disabled={pending} onClick={() => run(() => checkoutAction(item.id, item.title, item.category, isEquip ? { conditionOut: cond as any } : undefined))}
            className="bg-accent hover:bg-accent-hover text-background font-medium px-4 py-1.5 rounded-full text-sm disabled:opacity-50">Check out</button>
        )}
        {item.myLoan && (
          <>
            <button disabled={pending} onClick={() => run(() => returnAction(item.myLoan!.loanId, isEquip ? { conditionIn: cond as any } : undefined))}
              className="border border-border px-4 py-1.5 rounded-full text-sm disabled:opacity-50">Return</button>
            <button disabled={pending} onClick={() => run(() => renewAction(item.myLoan!.loanId))}
              className="border border-border px-4 py-1.5 rounded-full text-sm disabled:opacity-50">Renew</button>
          </>
        )}
      </div>
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
    </div>
  )
}
```

- [ ] **Step 2: `AddTitleForm.tsx`** — `'use client'`, board-only (rendered only when `isBoard`). Fields per category: book → title, author, isbn, description, # copies; equipment → title, description, notes, # copies, initial condition. Calls `addTitleAction(input)`; on success clears (revalidate refreshes the list). Keep minimal, house input styling (`rounded-xl border border-border bg-background/60 px-4 py-3`).

```tsx
'use client'
import { useState, useTransition } from 'react'
import { addTitleAction } from '@/app/members/_actions/lending-actions'

export function AddTitleForm({ category }: { category: 'book' | 'equipment' }) {
  const [pending, start] = useTransition()
  const [f, setF] = useState<any>({ title: '', author: '', isbn: '', description: '', notes: '', copies: 1, initialCondition: 'New' })
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })
  return (
    <form className="rounded-2xl border border-border/50 bg-card-bg/20 p-6 mb-8 space-y-3"
      onSubmit={(e) => { e.preventDefault(); start(async () => { await addTitleAction({
        category, title: f.title, description: f.description || undefined,
        author: category === 'book' ? (f.author || undefined) : undefined,
        isbn: category === 'book' ? (f.isbn || undefined) : undefined,
        notes: category === 'equipment' ? (f.notes || undefined) : undefined,
        copies: Number(f.copies) || 1,
        initialCondition: category === 'equipment' ? f.initialCondition : undefined,
      }); setF({ ...f, title: '', author: '', isbn: '', description: '', notes: '' }) }) }}>
      <p className="text-accent uppercase text-sm font-medium">Add {category}</p>
      <input required placeholder="Title" value={f.title} onChange={set('title')} className="w-full rounded-xl border border-border bg-background/60 px-4 py-2" />
      {category === 'book' && <input placeholder="Author" value={f.author} onChange={set('author')} className="w-full rounded-xl border border-border bg-background/60 px-4 py-2" />}
      {category === 'book' && <input placeholder="ISBN (for cover)" value={f.isbn} onChange={set('isbn')} className="w-full rounded-xl border border-border bg-background/60 px-4 py-2" />}
      <input placeholder="Description" value={f.description} onChange={set('description')} className="w-full rounded-xl border border-border bg-background/60 px-4 py-2" />
      {category === 'equipment' && <input placeholder="Notes" value={f.notes} onChange={set('notes')} className="w-full rounded-xl border border-border bg-background/60 px-4 py-2" />}
      <div className="flex gap-3 items-center">
        <label className="text-sm text-foreground/60"># copies <input type="number" min={1} value={f.copies} onChange={set('copies')} className="w-16 ml-2 rounded-lg border border-border bg-background/60 px-2 py-1" /></label>
        {category === 'equipment' && <select value={f.initialCondition} onChange={set('initialCondition')} className="rounded-lg border border-border bg-background/60 px-2 py-1 text-sm">{['New','Good','Fair','Poor','Damaged'].map(c => <option key={c}>{c}</option>)}</select>}
      </div>
      <button disabled={pending} className="bg-accent hover:bg-accent-hover text-background font-medium px-5 py-2 rounded-full text-sm disabled:opacity-50">Add</button>
    </form>
  )
}
```

- [ ] **Step 3: `library/page.tsx`** (server component, gated):

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listTitles } from '@/lib/lending'
import { TitleCard } from '@/components/members/TitleCard'
import { AddTitleForm } from '@/components/members/AddTitleForm'

export default async function LibraryPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  const isBoard = !!session.user.isBoard
  const items = await listTitles('book', session.user.memberId)
  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-4xl mx-auto px-6 py-24">
        <p className="text-accent font-medium tracking-wide uppercase text-sm mb-4">Members Hub</p>
        <h1 className="text-3xl md:text-4xl font-bold mb-8">Book Library</h1>
        {isBoard && <AddTitleForm category="book" />}
        {items.length === 0 ? <p className="text-foreground/50">No books yet.</p> : (
          <div className="grid gap-4 md:grid-cols-2">{items.map(i => <TitleCard key={i.id} item={i} isBoard={isBoard} />)}</div>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: `equipment/page.tsx`** — identical shape, `listTitles('equipment', memberId)`, `<AddTitleForm category="equipment" />`, heading "Equipment".

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listTitles } from '@/lib/lending'
import { TitleCard } from '@/components/members/TitleCard'
import { AddTitleForm } from '@/components/members/AddTitleForm'

export default async function EquipmentPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  const isBoard = !!session.user.isBoard
  const items = await listTitles('equipment', session.user.memberId)
  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-4xl mx-auto px-6 py-24">
        <p className="text-accent font-medium tracking-wide uppercase text-sm mb-4">Members Hub</p>
        <h1 className="text-3xl md:text-4xl font-bold mb-8">Equipment</h1>
        {isBoard && <AddTitleForm category="equipment" />}
        {items.length === 0 ? <p className="text-foreground/50">No equipment yet.</p> : (
          <div className="grid gap-4 md:grid-cols-2">{items.map(i => <TitleCard key={i.id} item={i} isBoard={isBoard} />)}</div>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 5: FeatureNav → real links.** In `src/components/members/FeatureNav.tsx`: Book Library + Equipment become `<Link>`s (drop "Coming soon" + `opacity-60`); Shop stays "Coming soon".

```tsx
import Link from 'next/link'

const LIVE = [
  { name: 'Book Library', desc: 'Browse and borrow the club library.', href: '/members/library' },
  { name: 'Equipment', desc: 'Check out shared brewing equipment.', href: '/members/equipment' },
]

export function FeatureNav() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {LIVE.map((f) => (
        <Link key={f.name} href={f.href} className="rounded-2xl border border-border/40 bg-card-bg/20 p-6 hover:bg-card-bg/40 transition-colors">
          <p className="font-semibold mb-2">{f.name}</p>
          <p className="text-foreground/50 text-sm">{f.desc}</p>
        </Link>
      ))}
      <div className="rounded-2xl border border-border/40 bg-card-bg/20 p-6 opacity-60">
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold">Shop</p>
          <span className="text-xs text-accent/70 border border-accent/30 rounded-full px-2 py-0.5">Coming soon</span>
        </div>
        <p className="text-foreground/50 text-sm">Member gear and club fundraisers.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Verify** — `npx tsc --noEmit` clean; `npm run build` compiles (`/members/library` + `/members/equipment` dynamic `ƒ`); `npx vitest run` all green; `npx eslint` clean on new files. The `<img>` cover will trip `@next/next/no-img-element` — either add a scoped `{/* eslint-disable-next-line @next/next/no-img-element */}` with a comment (Open Library covers are external, next/image optimization not worth it), or use `next/image` with `covers.openlibrary.org` allowed in `next.config`. Implementer's choice; tsc+build must pass and lint must be clean on the new files.

- [ ] **Step 7: Commit**

```bash
git add src/components/members/TitleCard.tsx src/components/members/AddTitleForm.tsx src/components/members/FeatureNav.tsx src/app/members/library src/app/members/equipment
git commit -m "feat(lending): browse pages + TitleCard + AddTitleForm + FeatureNav links"
```

---

## Post-plan notes

- **New env var (deploy):** `DISCORD_OFFICER_WEBHOOK_URL` (Discord Incoming Webhook for the officers channel). Unset → notifications no-op (fail-soft). Add to `.env.example`.
- **db push (deploy/controller):** after merge, `prisma db push` applies the 3 new models. Committed `prisma generate` on build covers the client. No backfill.
- **Live smoke (post-deploy):** as board, add a book (3 copies) + an equipment item (2 copies, condition); as a member, check out a copy (Discord officers post appears, "3 of 3" → "2 of 3"), return it (equipment condition-in updates that copy), renew a book, hit the 2-renewal cap; a second member checks out another copy of the same title simultaneously (both succeed, different copies); confirm non-board sees no Add controls; archive a copy and confirm the count drops; archive all copies → title leaves browse.
- **v1 board-archive UI note:** the card offers archive of "a copy" (one available copy), not per-copy enumeration — deliberate v1 simplicity; a full copy-manager is a later refinement. If the reviewer flags the lack of per-copy listing, that's the documented v1 scope, not a defect.
- **No new deps.** Prisma/Postgres/NextAuth/Tailwind; Discord via plain `fetch`.
