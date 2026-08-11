# Officer Holdings View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A board-only `/members/holdings` page showing who currently holds which club items, grouped by member, overdue-first, with per-member returned-loan history and a board "mark returned on their behalf" action.

**Architecture:** Two framework-free query helpers added to `src/lib/lending.ts` (`listActiveHoldings`, `listMemberHistory`) return plain view types over existing `Loan`/`Copy`/`LoanableItem`/`Member` rows — no schema change. A new board-gated server page renders a client `HoldingsMemberCard` per member. The board return reuses the existing `returnLoan(loanId, memberId, isBoard=true, cond)` (which already skips the ownership check when `isBoard` is true), wrapped by a new `boardReturnLoanAction`. Two nav surfaces (`SiteHeader`, `FeatureNav`) gain a board-only Holdings link.

**Tech Stack:** Next.js 16 App Router (server components + server actions), React 19, TypeScript, Prisma 6 / Postgres, Tailwind v4 (existing CSS-var tokens), Vitest.

## Global Constraints

- No schema migration and no new npm dependency — reads existing tables only.
- Board-gate every board surface server-side: `auth()` → non-board `redirect('/members')` on pages; `requireBoard()` in the action. UI hiding is never the enforcement.
- Do NOT modify `returnLoan` — its signature `returnLoan(loanId, actingMemberId, isBoard, cond?, deps?)` already skips ownership when `isBoard` is true. The member `returnAction` must stay byte-unchanged.
- Query helpers are framework-free and dependency-injectable for tests: `(..., deps: { db?: typeof prisma; now?: Date } = {})`, mirroring `listTitles`/`returnLoan`.
- `Loan.memberId` is a plain String with NO Prisma relation — member name/email come from a batched `member.findMany({ where: { id: { in: ids } } })`; a loan whose `memberId` has no `Member` row must still render (labeled "Unknown member"), never dropped or throwing.
- Active loan = `returnedAt: null`. Overdue = `dueAt < now`.
- Condition list for equipment returns is `['New','Good','Fair','Poor','Damaged']` (existing `CONDITIONS` in `TitleCard.tsx`); default `'Good'`.
- Visual tokens: cards `rounded-2xl border border-border/50 bg-card-bg/30`, overdue text `text-red-400`, accent `#ff9500`. Match existing hub styling.
- Dates rendered as `d.toISOString().slice(0,10)` (matches the existing card convention).

---

## File Structure

- `src/lib/lending.ts` (MODIFY) — add `HoldingLoan`, `MemberHoldings`, `HistoryLoan` types + `listActiveHoldings()` + `listMemberHistory()`. Framework-free.
- `src/lib/lending.test.ts` (MODIFY) — unit tests for both helpers with DI'd-fake db + fixed `now`.
- `src/app/members/_actions/lending-actions.ts` (MODIFY) — add `boardReturnLoanAction`; add a `listMemberHistoryAction` thin wrapper (board-gated) so the client expander can fetch history.
- `src/app/members/_actions/holdings-actions.test.ts` (CREATE) — test the board gate on `boardReturnLoanAction`.
- `src/app/members/holdings/page.tsx` (CREATE) — board-gated server page.
- `src/components/members/HoldingsMemberCard.tsx` (CREATE) — client component: member card, holdings rows, Mark-returned (confirm + condition), Show-past-loans expander.
- `src/components/SiteHeader.tsx` (MODIFY) — board-only "Holdings" top-nav link.
- `src/components/members/FeatureNav.tsx` (MODIFY) — accept `isBoard`, add a board-only Holdings hub card.
- `src/app/members/page.tsx` (MODIFY) — pass `isBoard` to `<FeatureNav />`.

---

### Task 1: Query helpers `listActiveHoldings` + `listMemberHistory`

**Files:**
- Modify: `src/lib/lending.ts` (add types + two functions; place after `renewLoan`, near the other read helpers)
- Test: `src/lib/lending.test.ts` (append)

**Interfaces:**
- Consumes: `prisma` (already imported in lending.ts), the `Loan`/`Copy`/`LoanableItem`/`Member` models.
- Produces:
  ```ts
  export type HoldingLoan = {
    loanId: string
    itemTitle: string
    category: 'book' | 'equipment'
    copyLabel: string | null
    checkedOutAt: Date
    dueAt: Date
    overdue: boolean
  }
  export type MemberHoldings = {
    memberId: string
    name: string | null
    email: string | null
    loans: HoldingLoan[]      // sorted dueAt asc
    overdueCount: number
  }
  export type HistoryLoan = {
    loanId: string
    itemTitle: string
    category: 'book' | 'equipment'
    copyLabel: string | null
    checkedOutAt: Date
    returnedAt: Date
    conditionIn: string | null
  }
  export async function listActiveHoldings(deps?: { db?: typeof prisma; now?: Date }): Promise<MemberHoldings[]>
  export async function listMemberHistory(memberId: string, deps?: { db?: typeof prisma }): Promise<HistoryLoan[]>
  ```

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/lending.test.ts`:

```ts
import { listActiveHoldings, listMemberHistory } from './lending'

// Fixed clock so overdue is deterministic
const NOW = new Date('2026-08-15T00:00:00Z')

// A fake db exposing only what these helpers call: loan.findMany + member.findMany
function holdingsDb(loans: any[], members: any[]) {
  return {
    loan: {
      findMany: async ({ where }: any) => {
        // returnedAt null vs not-null is the only filter the helpers use
        const wantReturnedNull = where?.returnedAt === null
        const wantMember = where?.memberId
        return loans.filter((l) =>
          (wantReturnedNull ? l.returnedAt === null : l.returnedAt !== null) &&
          (wantMember ? l.memberId === wantMember : true)
        )
      },
    },
    member: {
      findMany: async ({ where }: any) => {
        const ids: string[] = where?.id?.in ?? []
        return members.filter((m) => ids.includes(m.id))
      },
    },
  } as any
}

const loanRow = (over: any = {}) => ({
  id: 'l1', memberId: 'm1', checkedOutAt: new Date('2026-08-01T00:00:00Z'),
  dueAt: new Date('2026-08-20T00:00:00Z'), returnedAt: null, conditionIn: null,
  copy: { label: null, item: { title: 'Wine thief', category: 'equipment' } },
  ...over,
})

test('listActiveHoldings: groups active loans by member, computes overdue, sorts overdue-members-first then name', async () => {
  const loans = [
    loanRow({ id: 'a', memberId: 'm1', dueAt: new Date('2026-08-10T00:00:00Z') }), // overdue (before NOW)
    loanRow({ id: 'b', memberId: 'm2', dueAt: new Date('2026-08-20T00:00:00Z') }), // not overdue
    loanRow({ id: 'c', memberId: 'm2', dueAt: new Date('2026-08-25T00:00:00Z') }), // not overdue
    loanRow({ id: 'd', memberId: 'x9', dueAt: new Date('2026-08-01T00:00:00Z') }), // overdue, member missing
  ]
  const members = [
    { id: 'm1', name: 'Zed', emailAddress: 'zed@x.com' },
    { id: 'm2', name: 'Amy', emailAddress: 'amy@x.com' },
  ]
  const res = await listActiveHoldings({ db: holdingsDb(loans, members), now: NOW })
  // overdue members first: m1 (Zed, overdue) and x9 (unknown, overdue) before m2 (Amy, none overdue)
  const overdueFirst = res.slice(0, 2).map((r) => r.memberId).sort()
  expect(overdueFirst).toEqual(['m1', 'x9'])
  expect(res[res.length - 1].memberId).toBe('m2') // no overdue -> last
  const m2 = res.find((r) => r.memberId === 'm2')!
  expect(m2.loans.length).toBe(2)
  expect(m2.overdueCount).toBe(0)
  expect(m2.loans[0].dueAt.getTime()).toBeLessThanOrEqual(m2.loans[1].dueAt.getTime()) // dueAt asc
  const m1 = res.find((r) => r.memberId === 'm1')!
  expect(m1.overdueCount).toBe(1)
  expect(m1.loans[0].overdue).toBe(true)
  expect(m1.name).toBe('Zed')
  expect(m1.email).toBe('zed@x.com')
})

test('listActiveHoldings: a loan whose member is missing is kept with null name/email (unknown member)', async () => {
  const loans = [loanRow({ id: 'd', memberId: 'ghost' })]
  const res = await listActiveHoldings({ db: holdingsDb(loans, []), now: NOW })
  expect(res.length).toBe(1)
  expect(res[0].memberId).toBe('ghost')
  expect(res[0].name).toBeNull()
  expect(res[0].email).toBeNull()
})

test('listActiveHoldings: empty when no active loans', async () => {
  const res = await listActiveHoldings({ db: holdingsDb([], []), now: NOW })
  expect(res).toEqual([])
})

test('listMemberHistory: returns only that member returned loans, newest-returned first', async () => {
  const loans = [
    loanRow({ id: 'r1', memberId: 'm1', returnedAt: new Date('2026-07-01T00:00:00Z'), conditionIn: 'Good' }),
    loanRow({ id: 'r2', memberId: 'm1', returnedAt: new Date('2026-08-01T00:00:00Z'), conditionIn: 'Fair' }),
    loanRow({ id: 'active', memberId: 'm1', returnedAt: null }),
    loanRow({ id: 'other', memberId: 'm2', returnedAt: new Date('2026-08-02T00:00:00Z') }),
  ]
  const res = await listMemberHistory('m1', { db: holdingsDb(loans, []) })
  expect(res.map((h) => h.loanId)).toEqual(['r2', 'r1']) // m1 only, newest returnedAt first, no active/other
  expect(res[0].conditionIn).toBe('Fair')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/lending.test.ts`
Expected: FAIL — `listActiveHoldings`/`listMemberHistory` not exported.

- [ ] **Step 3: Implement the helpers**

Add to `src/lib/lending.ts` (after `renewLoan`, before `addTitle`):

```ts
export type HoldingLoan = {
  loanId: string
  itemTitle: string
  category: ItemCategory
  copyLabel: string | null
  checkedOutAt: Date
  dueAt: Date
  overdue: boolean
}
export type MemberHoldings = {
  memberId: string
  name: string | null
  email: string | null
  loans: HoldingLoan[]
  overdueCount: number
}
export type HistoryLoan = {
  loanId: string
  itemTitle: string
  category: ItemCategory
  copyLabel: string | null
  checkedOutAt: Date
  returnedAt: Date
  conditionIn: string | null
}

export async function listActiveHoldings(
  deps: { db?: typeof prisma; now?: Date } = {},
): Promise<MemberHoldings[]> {
  const db = deps.db ?? prisma
  const now = deps.now ?? new Date()
  const loans = await db.loan.findMany({
    where: { returnedAt: null },
    include: { copy: { include: { item: true } } },
    orderBy: { dueAt: 'asc' },
  })
  // Batch-load member details (memberId has no relation)
  const ids = [...new Set((loans as any[]).map((l) => l.memberId))]
  const members = ids.length
    ? await db.member.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, emailAddress: true } })
    : []
  const mMap = new Map((members as any[]).map((m) => [m.id, m]))
  const byMember = new Map<string, MemberHoldings>()
  for (const l of loans as any[]) {
    const overdue = l.dueAt.getTime() < now.getTime()
    const hl: HoldingLoan = {
      loanId: l.id,
      itemTitle: l.copy?.item?.title ?? '(unknown item)',
      category: (l.copy?.item?.category ?? 'equipment') as ItemCategory,
      copyLabel: l.copy?.label ?? null,
      checkedOutAt: l.checkedOutAt,
      dueAt: l.dueAt,
      overdue,
    }
    let mh = byMember.get(l.memberId)
    if (!mh) {
      const m = mMap.get(l.memberId)
      mh = { memberId: l.memberId, name: m?.name ?? null, email: m?.emailAddress ?? null, loans: [], overdueCount: 0 }
      byMember.set(l.memberId, mh)
    }
    mh.loans.push(hl) // loans arrive dueAt-asc from the query, preserved per member
    if (overdue) mh.overdueCount++
  }
  return [...byMember.values()].sort((a, b) => {
    // overdue members first, then by name (nulls last), then memberId for stability
    const ao = a.overdueCount > 0 ? 0 : 1
    const bo = b.overdueCount > 0 ? 0 : 1
    if (ao !== bo) return ao - bo
    const an = a.name ?? '￿'
    const bn = b.name ?? '￿'
    if (an !== bn) return an.localeCompare(bn)
    return a.memberId.localeCompare(b.memberId)
  })
}

export async function listMemberHistory(
  memberId: string,
  deps: { db?: typeof prisma } = {},
): Promise<HistoryLoan[]> {
  const db = deps.db ?? prisma
  const loans = await db.loan.findMany({
    where: { memberId, returnedAt: { not: null } },
    include: { copy: { include: { item: true } } },
    orderBy: { returnedAt: 'desc' },
  })
  return (loans as any[]).map((l) => ({
    loanId: l.id,
    itemTitle: l.copy?.item?.title ?? '(unknown item)',
    category: (l.copy?.item?.category ?? 'equipment') as ItemCategory,
    copyLabel: l.copy?.label ?? null,
    checkedOutAt: l.checkedOutAt,
    returnedAt: l.returnedAt as Date,
    conditionIn: l.conditionIn ?? null,
  }))
}
```

Note for the test fake: the fake's `loan.findMany` ignores `orderBy`, so the test asserts sort behavior the helper guarantees itself (`listActiveHoldings` sorts members in code; `listMemberHistory` relies on the DB `orderBy`). For `listMemberHistory`, since the fake ignores `orderBy`, add an in-code stable sort by `returnedAt` desc as a belt-and-suspenders so the test is honest:

Adjust `listMemberHistory` to sort in code too (do not rely solely on DB order):
```ts
  const mapped = (loans as any[]).map((l) => ({ /* ...as above... */ }))
  mapped.sort((a, b) => b.returnedAt.getTime() - a.returnedAt.getTime())
  return mapped
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/lending.test.ts`
Expected: PASS (all four new tests + existing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/lending.ts src/lib/lending.test.ts
git commit -m "feat(lending): listActiveHoldings + listMemberHistory query helpers"
```

---

### Task 2: `boardReturnLoanAction` + `listMemberHistoryAction`

**Files:**
- Modify: `src/app/members/_actions/lending-actions.ts` (add two exports)
- Test: `src/app/members/_actions/holdings-actions.test.ts` (create)

**Interfaces:**
- Consumes: existing `requireBoard()` (returns `{ memberId, isBoard, name }`), `returnLoan(loanId, actingMemberId, isBoard, cond?)`, `revalidateBrowse()`, `listMemberHistory` (Task 1), `type Condition`, `type HistoryLoan`.
- Produces:
  ```ts
  export async function boardReturnLoanAction(
    loanId: string, cond?: { conditionIn?: Condition; noteIn?: string }
  ): Promise<ReturnResult>   // existing ReturnResult shape
  export async function listMemberHistoryAction(memberId: string): Promise<HistoryLoan[]>
  ```

- [ ] **Step 1: Write the failing test (board gate is the load-bearing behavior)**

Create `src/app/members/_actions/holdings-actions.test.ts`:

```ts
import { test, expect, vi, beforeEach } from 'vitest'

// Mock the auth + db + returnLoan seams the action composes, so we test the
// ACTION's gate + wiring (not returnLoan internals, which have their own tests).
const authMock = vi.fn()
const returnLoanMock = vi.fn()
const listMemberHistoryMock = vi.fn()

vi.mock('@/lib/auth', () => ({ auth: () => authMock(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: {} }))
vi.mock('@/lib/notify', () => ({ notifyOfficersCheckout: vi.fn() }))
vi.mock('@vercel/blob', () => ({ del: vi.fn() }))
vi.mock('@/lib/lending', async (orig) => {
  const actual = await (orig as any)()
  return { ...actual, returnLoan: (...a: any[]) => returnLoanMock(...a), listMemberHistory: (...a: any[]) => listMemberHistoryMock(...a) }
})

beforeEach(() => { authMock.mockReset(); returnLoanMock.mockReset(); listMemberHistoryMock.mockReset() })

test('boardReturnLoanAction: non-board caller is rejected before returnLoan runs', async () => {
  authMock.mockResolvedValue({ user: { memberId: 'm1', isBoard: false } })
  const { boardReturnLoanAction } = await import('./lending-actions')
  await expect(boardReturnLoanAction('loan1', { conditionIn: 'Good' })).rejects.toThrow('forbidden')
  expect(returnLoanMock).not.toHaveBeenCalled()
})

test('boardReturnLoanAction: board caller calls returnLoan with isBoard=true (can return any loan)', async () => {
  authMock.mockResolvedValue({ user: { memberId: 'boardId', isBoard: true } })
  returnLoanMock.mockResolvedValue({ ok: true })
  const { boardReturnLoanAction } = await import('./lending-actions')
  const r = await boardReturnLoanAction('someoneElsesLoan', { conditionIn: 'Fair' })
  expect(r).toEqual({ ok: true })
  // (loanId, actingMemberId, isBoard, cond)
  expect(returnLoanMock).toHaveBeenCalledWith('someoneElsesLoan', 'boardId', true, { conditionIn: 'Fair' })
})

test('listMemberHistoryAction: non-board rejected; board gets history', async () => {
  const { listMemberHistoryAction } = await import('./lending-actions')
  authMock.mockResolvedValue({ user: { memberId: 'm1', isBoard: false } })
  await expect(listMemberHistoryAction('m9')).rejects.toThrow('forbidden')
  authMock.mockResolvedValue({ user: { memberId: 'b', isBoard: true } })
  listMemberHistoryMock.mockResolvedValue([{ loanId: 'h1' }])
  const res = await listMemberHistoryAction('m9')
  expect(res).toEqual([{ loanId: 'h1' }])
  expect(listMemberHistoryMock).toHaveBeenCalledWith('m9')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/members/_actions/holdings-actions.test.ts`
Expected: FAIL — `boardReturnLoanAction`/`listMemberHistoryAction` not exported.

- [ ] **Step 3: Implement the actions**

In `src/app/members/_actions/lending-actions.ts`: add `listMemberHistory` and `type HistoryLoan` to the existing import from `@/lib/lending`, then add:

```ts
export async function boardReturnLoanAction(loanId: string, cond?: { conditionIn?: Condition; noteIn?: string }) {
  const { memberId } = await requireBoard()
  // returnLoan already skips the ownership check when isBoard=true, so a board
  // member may return ANY member's loan. We pass the board member's own id as
  // actingMemberId (unused for the ownership branch when isBoard is true).
  const r = await returnLoan(loanId, memberId, true, cond)
  if (r.ok) { revalidateBrowse(); revalidatePath('/members/holdings') }
  return r
}

export async function listMemberHistoryAction(memberId: string) {
  await requireBoard()
  return listMemberHistory(memberId)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/members/_actions/holdings-actions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/members/_actions/lending-actions.ts src/app/members/_actions/holdings-actions.test.ts
git commit -m "feat(lending): boardReturnLoanAction + listMemberHistoryAction (board-gated)"
```

---

### Task 3: `HoldingsMemberCard` client component

**Files:**
- Create: `src/components/members/HoldingsMemberCard.tsx`

**Interfaces:**
- Consumes: `type MemberHoldings`, `type HistoryLoan` from `@/lib/lending`; `boardReturnLoanAction`, `listMemberHistoryAction` from `@/app/members/_actions/lending-actions`.
- Produces: `export function HoldingsMemberCard({ member }: { member: MemberHoldings })`

- [ ] **Step 1: Write the component**

Create `src/components/members/HoldingsMemberCard.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import type { MemberHoldings, HistoryLoan } from '@/lib/lending'
import { boardReturnLoanAction, listMemberHistoryAction } from '@/app/members/_actions/lending-actions'

const CONDITIONS = ['New', 'Good', 'Fair', 'Poor', 'Damaged'] as const
const iso = (d: Date) => new Date(d).toISOString().slice(0, 10)

export function HoldingsMemberCard({ member }: { member: MemberHoldings }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [confirmingLoan, setConfirmingLoan] = useState<string | null>(null)
  const [cond, setCond] = useState<string>('Good')
  const [history, setHistory] = useState<HistoryLoan[] | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  function doReturn(loanId: string, isEquip: boolean) {
    setErr(null)
    start(async () => {
      const r = await boardReturnLoanAction(loanId, isEquip ? { conditionIn: cond as (typeof CONDITIONS)[number] } : undefined)
      if (!r.ok) setErr(r.reason === 'already_returned' ? 'Already returned — refresh.' : 'Could not return — refresh.')
      else setConfirmingLoan(null)
    })
  }

  function toggleHistory() {
    setErr(null)
    if (showHistory) { setShowHistory(false); return }
    if (history) { setShowHistory(true); return }
    start(async () => {
      try { setHistory(await listMemberHistoryAction(member.memberId)); setShowHistory(true) }
      catch { setErr('Could not load history.') }
    })
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card-bg/30 p-6 md:p-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="font-semibold">{member.name ?? 'Unknown member'}</p>
          {member.email
            ? <a href={`mailto:${member.email}`} className="text-accent/80 hover:text-accent text-sm">{member.email}</a>
            : <p className="text-foreground/40 text-sm">no email on file</p>}
        </div>
        <span className="text-sm text-foreground/60">
          {member.loans.length} item{member.loans.length === 1 ? '' : 's'}
          {member.overdueCount > 0 && <span className="ml-2 text-red-400">· {member.overdueCount} overdue</span>}
        </span>
      </div>

      <ul className="mt-4 space-y-2">
        {member.loans.map((l) => {
          const isEquip = l.category === 'equipment'
          return (
            <li key={l.loanId} className="rounded-lg border border-border/40 bg-background/40 px-4 py-2 text-sm">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span>
                  <span className="font-medium">{l.itemTitle}</span>
                  {l.copyLabel && <span className="text-foreground/50"> ({l.copyLabel})</span>}
                  <span className="ml-2 text-xs text-foreground/40 border border-border/40 rounded-full px-2 py-0.5">{l.category}</span>
                </span>
                <span className="text-foreground/60">
                  out {iso(l.checkedOutAt)} · due <span className={l.overdue ? 'text-red-400' : ''}>{iso(l.dueAt)}</span>
                </span>
              </div>
              {confirmingLoan === l.loanId ? (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="text-foreground/70">Return “{l.itemTitle}” for {member.name ?? 'this member'}?</span>
                  {isEquip && (
                    <select value={cond} onChange={(e) => setCond(e.target.value)} className="rounded-lg border border-border bg-background/60 px-2 py-1 text-sm">
                      {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                  <button disabled={pending} onClick={() => doReturn(l.loanId, isEquip)} className="bg-accent hover:bg-accent-hover text-background px-3 py-1 rounded-full text-sm disabled:opacity-50">Confirm return</button>
                  <button disabled={pending} onClick={() => setConfirmingLoan(null)} className="border border-border px-3 py-1 rounded-full text-sm">Cancel</button>
                </div>
              ) : (
                <button disabled={pending} onClick={() => { setCond('Good'); setConfirmingLoan(l.loanId) }} className="mt-2 border border-border px-3 py-1 rounded-full text-xs disabled:opacity-50">Mark returned</button>
              )}
            </li>
          )
        })}
      </ul>

      <button disabled={pending} onClick={toggleHistory} className="mt-4 text-sm text-foreground/50 hover:text-foreground disabled:opacity-50">
        {showHistory ? 'Hide past loans' : 'Show past loans'}
      </button>
      {showHistory && history && (
        history.length === 0
          ? <p className="mt-2 text-sm text-foreground/40">No past loans.</p>
          : <ul className="mt-2 space-y-1 text-sm text-foreground/60">
              {history.map((h) => (
                <li key={h.loanId}>
                  {h.itemTitle}{h.copyLabel ? ` (${h.copyLabel})` : ''} · {iso(h.checkedOutAt)} → {iso(h.returnedAt)}
                  {h.category === 'equipment' && h.conditionIn && <span className="ml-1 text-foreground/40">[{h.conditionIn}]</span>}
                </li>
              ))}
            </ul>
      )}
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/components/members/HoldingsMemberCard.tsx
git commit -m "feat(lending): HoldingsMemberCard (board return + history expander)"
```

---

### Task 4: Board-gated `/members/holdings` page

**Files:**
- Create: `src/app/members/holdings/page.tsx`

**Interfaces:**
- Consumes: `auth` from `@/lib/auth`, `listActiveHoldings` from `@/lib/lending`, `HoldingsMemberCard` (Task 3), `redirect` from `next/navigation`.

- [ ] **Step 1: Write the page**

Create `src/app/members/holdings/page.tsx` (mirror the board-gate + layout of `equipment/page.tsx`):

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listActiveHoldings } from '@/lib/lending'
import { HoldingsMemberCard } from '@/components/members/HoldingsMemberCard'

export default async function HoldingsPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  if (!session.user.isBoard) redirect('/members')

  const members = await listActiveHoldings()

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl font-bold">Current holdings</h1>
      <p className="text-foreground/50 text-sm mt-1">Everything currently checked out, by member. Board only.</p>
      {members.length === 0 ? (
        <p className="mt-8 text-foreground/60">No items are currently checked out.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {members.map((m) => <HoldingsMemberCard key={m.memberId} member={m} />)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build compiles + route present**

Run: `npm run build`
Expected: compiles; `/members/holdings` appears as a dynamic `ƒ` route.

- [ ] **Step 3: Commit**

```bash
git add src/app/members/holdings/page.tsx
git commit -m "feat(lending): board-gated /members/holdings page"
```

---

### Task 5: Board-only Holdings nav links

**Files:**
- Modify: `src/components/SiteHeader.tsx` (add board-only top-nav link)
- Modify: `src/components/members/FeatureNav.tsx` (accept `isBoard`, add board Holdings hub card)
- Modify: `src/app/members/page.tsx` (pass `isBoard` to `<FeatureNav />`)

**Interfaces:**
- Consumes: `session.user.isBoard` (already on the session; SiteHeader already calls `auth()`).
- Produces: `FeatureNav` signature changes to `export function FeatureNav({ isBoard }: { isBoard: boolean })`.

- [ ] **Step 1: SiteHeader — add board-only link**

In `src/components/SiteHeader.tsx`, compute board and add a link between Equipment and Sign out. Change the top of the component:

```tsx
  const session = await auth()
  const signedIn = !!session?.user?.memberId
  const isBoard = !!session?.user?.isBoard
```

Then after the Equipment `<Link>`:

```tsx
              {isBoard && (
                <Link href="/members/holdings" className="text-foreground/70 hover:text-foreground transition-colors">
                  Holdings
                </Link>
              )}
```

- [ ] **Step 2: FeatureNav — accept isBoard + board card**

In `src/components/members/FeatureNav.tsx`, change the signature and append a board-only card before the "Shop" coming-soon card:

```tsx
export function FeatureNav({ isBoard }: { isBoard: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {LIVE.map((f) => ( /* unchanged */
        <Link key={f.name} href={f.href} className="rounded-2xl border border-border/40 bg-card-bg/20 p-6 hover:bg-card-bg/40 transition-colors">
          <p className="font-semibold mb-2">{f.name}</p>
          <p className="text-foreground/50 text-sm">{f.desc}</p>
        </Link>
      ))}
      {isBoard && (
        <Link href="/members/holdings" className="rounded-2xl border border-accent/30 bg-card-bg/20 p-6 hover:bg-card-bg/40 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold">Holdings</p>
            <span className="text-xs text-accent/70 border border-accent/30 rounded-full px-2 py-0.5">Board</span>
          </div>
          <p className="text-foreground/50 text-sm">Who currently has which club items.</p>
        </Link>
      )}
      <div className="rounded-2xl border border-border/40 bg-card-bg/20 p-6 opacity-60"> {/* Shop card unchanged */}
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

- [ ] **Step 3: members/page.tsx — pass isBoard**

In `src/app/members/page.tsx`, the page already has `const session = await auth()` (line 12). Change the `<FeatureNav />` render (line 68) to pass the session board flag — do NOT add a second `auth()` call, and do NOT use `rec.isBoard` (that's the dashboard record; the session flag `session.user.isBoard` is the auth-authoritative one used everywhere else for gating):

```tsx
        <FeatureNav isBoard={!!session.user.isBoard} />
```

- [ ] **Step 4: Verify build + types**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; `/members` and `/members/holdings` both compile.

- [ ] **Step 5: Commit**

```bash
git add src/components/SiteHeader.tsx src/components/members/FeatureNav.tsx src/app/members/page.tsx
git commit -m "feat(lending): board-only Holdings nav link (header + hub card)"
```

---

## Final verification (after all tasks)

- `npx tsc --noEmit` clean
- `npx vitest run` green (existing 73 + 4 holdings-helper + 3 action-gate = 80)
- `npm run build` compiles; `/members/holdings` is a dynamic `ƒ` route
- `npx eslint src/lib/lending.ts src/app/members/_actions/lending-actions.ts src/components/members/HoldingsMemberCard.tsx src/app/members/holdings/page.tsx src/components/SiteHeader.tsx src/components/members/FeatureNav.tsx` — no new errors (pre-existing `any` in lending.ts allowed)
- Manual (post-deploy): as board, `/members/holdings` lists holders overdue-first; mark-returned confirms + frees the item; show-past-loans works; as a non-board member, the link is absent and visiting `/members/holdings` redirects to `/members`.
