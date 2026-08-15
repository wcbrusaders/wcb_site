# WCB Officer Admin — Enforcement + Strike Log (Specs B + C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the enforcement engine to the board-only admin console: a member `Status` (active/interim/banned) that gates members-area access, a one-key interim freeze with a 7-day clock, an unfakeable board removal vote (each board member casts their own authenticated vote; execute locked behind quorum≥3 AND two-thirds of voters), and a per-member strike/incident log — all embodying the ratified 3-rung Code of Conduct.

**Architecture:** New Prisma models (`MemberStatus` on Member, `EnforcementCase`, `CaseVote`, `Strike`). Pure, heavily-tested decision logic in `src/lib/enforcement.ts` (vote tally, quorum/two-thirds, denominator, 7-day expiry). Board-gated server actions wrap the pure logic + record audit + write status. The members-area auth path denies access when a member's status is interim/banned. UI lives under `/members/admin` (a cases panel + a per-member strike view). Discord/Drive cascade is OUT (bot-side, separate repo) — this build sets the `Status` flag the bot will later read.

**Tech Stack:** Next.js 16 App Router (server components + actions), TypeScript, Prisma/Postgres, Vitest, Tailwind.

## Global Constraints

- Ratified 3-rung ladder: Correction (not a strike) → Strike 1 Warning → Strike 2 "Board decides" (suspension OR removal by two-thirds vote; suspended-then-reoffends = removed). No 4-rung "Strike 3" anywhere.
- **Removal vote is UNFAKEABLE:** each vote row is tied to the authenticated voter's own memberId from `auth()`. No action lets one caller vote on another's behalf. Server action re-verifies board + identity server-side every time.
- **Execute-removal is hard-locked** until BOTH: quorum floor met (≥3 eligible board members voted) AND two-thirds of those who voted approve. Non-votes = abstain (not counted). Denominator (eligible board) is snapshotted at case-open; recused members excluded.
- **Interim freeze:** any one board member can set a member's status to `interim` immediately (members-area access cut instantly); stamps actor + timestamp; starts 7-day clock; a case older than 7 days with no resolution is flagged expired in the UI.
- **Status cascade (this build):** `interim`/`banned` → members-area auth denies access. Discord/Drive/Calendar cascade is OUT (bot reads Status later — separate repo). Setting Status is all this build does toward cascade.
- Every state change (freeze, vote, execute, strike, lift) records an `AuditLog` row (reuse `src/lib/audit.ts` `recordAudit`) with server-derived actor identity.
- Board-only. Every server action calls a board re-check (reuse the `requireBoard()` pattern from `admin-actions.ts`) BEFORE any effect.
- Break-glass: none in-app (documented; president fixes at source).
- Bar: tsc clean, `next build` clean, vitest green, eslint clean. DEPLOY: `prisma db push` for the new models.

---

### Task 1: Prisma models for enforcement + strikes

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces models (consumed by later tasks):
  - `Member` gains `status String @default("active")` (values: `active` | `interim` | `banned`).
  - `EnforcementCase { id String @id @default(cuid()); createdAt DateTime @default(now()); subjectMemberId String; subjectLabel String; kind String; status String @default("open"); openedByMemberId String; openedByEmail String; eligibleBoardCount Int; recusedMemberIds String; decisionDueAt DateTime; resolvedAt DateTime?; outcome String?; votes CaseVote[] }`
    - `kind`: `interim` | `removal`. `status`: `open` | `resolved` | `expired`. `outcome`: `suspended` | `removed` | `lifted` | null. `recusedMemberIds`: comma-joined ids.
  - `CaseVote { id String @id @default(cuid()); caseId String; case EnforcementCase @relation(fields:[caseId], references:[id]); voterMemberId String; voterEmail String; vote String; createdAt DateTime @default(now()); @@unique([caseId, voterMemberId]) }`
    - `vote`: `approve` | `reject` | `abstain`. The `@@unique` makes double-voting impossible at the DB level.
  - `Strike { id String @id @default(cuid()); memberId String; memberLabel String; level String; reason String; issuedByEmail String; createdAt DateTime @default(now()); expiresAt DateTime?; clearedAt DateTime? }`
    - `level`: `correction` | `warning` | `board-decides`.

- [ ] **Step 1: Add the models**

In `prisma/schema.prisma`, add `status String @default("active")` to `model Member` (after `resourceAccess`), and add the three new models:

```prisma
model EnforcementCase {
  id                 String     @id @default(cuid())
  createdAt          DateTime   @default(now())
  subjectMemberId    String
  subjectLabel       String
  kind               String     // interim | removal
  status             String     @default("open") // open | resolved | expired
  openedByMemberId   String
  openedByEmail      String
  eligibleBoardCount Int
  recusedMemberIds   String     @default("")
  decisionDueAt      DateTime
  resolvedAt         DateTime?
  outcome            String?    // suspended | removed | lifted
  votes              CaseVote[]
}

model CaseVote {
  id             String          @id @default(cuid())
  caseId         String
  case           EnforcementCase @relation(fields: [caseId], references: [id])
  voterMemberId  String
  voterEmail     String
  vote           String          // approve | reject | abstain
  createdAt      DateTime        @default(now())
  @@unique([caseId, voterMemberId])
}

model Strike {
  id           String    @id @default(cuid())
  memberId     String
  memberLabel  String
  level        String    // correction | warning | board-decides
  reason       String
  issuedByEmail String
  createdAt    DateTime  @default(now())
  expiresAt    DateTime?
  clearedAt    DateTime?
}
```

- [ ] **Step 2: Regenerate client + verify**

Run: `npx prisma generate`, then `npx tsc --noEmit`.
Expected: clean (new models available as `prisma.enforcementCase`, `prisma.caseVote`, `prisma.strike`). Do NOT run `prisma db push` (deferred to deploy).

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: enforcement + strike Prisma models (Status, EnforcementCase, CaseVote, Strike)"
```

---

### Task 2: Pure enforcement decision logic (the vote engine)

**Files:**
- Create: `src/lib/enforcement.ts`
- Test: `src/lib/enforcement.test.ts`

**Interfaces:**
- Produces (all PURE — no DB, no auth; the security + correctness core):
  - `QUORUM_FLOOR = 3`, `DECISION_WINDOW_DAYS = 7`.
  - `type VoteValue = 'approve' | 'reject' | 'abstain'`
  - `computeEligibleBoard(boardMemberIds: string[], recusedIds: string[]): string[]` — board minus recused (dedup, order-stable).
  - `type Tally = { cast: number; approve: number; reject: number; abstain: number; quorumMet: boolean; twoThirdsMet: boolean; passes: boolean }`
  - `tallyVotes(votes: VoteValue[]): Tally` — cast = non-abstain? NO: cast = total votes recorded (approve+reject+abstain); quorumMet = cast >= QUORUM_FLOOR; twoThirds computed over approve+reject only (abstain excluded from the ratio); twoThirdsMet = approve >= ceil((approve+reject) * 2/3) AND (approve+reject) > 0; passes = quorumMet && twoThirdsMet.
  - `isExpired(decisionDueAt: Date, now: Date): boolean` — now > decisionDueAt.
  - `decisionDueDate(openedAt: Date): Date` — openedAt + 7 days.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/enforcement.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeEligibleBoard, tallyVotes, isExpired, decisionDueDate, QUORUM_FLOOR } from './enforcement'

describe('computeEligibleBoard', () => {
  it('removes recused members from the board', () => {
    expect(computeEligibleBoard(['a', 'b', 'c', 'd'], ['b'])).toEqual(['a', 'c', 'd'])
  })
  it('dedups and ignores recused ids not on the board', () => {
    expect(computeEligibleBoard(['a', 'a', 'b'], ['x'])).toEqual(['a', 'b'])
  })
})

describe('tallyVotes', () => {
  it('fails when quorum not met (fewer than 3 votes) even if unanimous', () => {
    const t = tallyVotes(['approve', 'approve'])
    expect(t.quorumMet).toBe(false)
    expect(t.passes).toBe(false)
  })
  it('passes with 3 approvals (quorum + 100% >= two-thirds)', () => {
    const t = tallyVotes(['approve', 'approve', 'approve'])
    expect(t.quorumMet).toBe(true)
    expect(t.twoThirdsMet).toBe(true)
    expect(t.passes).toBe(true)
  })
  it('two-thirds excludes abstains from the ratio but abstains count toward quorum', () => {
    // 4 votes cast (quorum met); ratio over approve+reject = 2 approve / 1 reject = 2/3 -> ceil(3*2/3)=2, met
    const t = tallyVotes(['approve', 'approve', 'reject', 'abstain'])
    expect(t.cast).toBe(4)
    expect(t.quorumMet).toBe(true)
    expect(t.twoThirdsMet).toBe(true)
    expect(t.passes).toBe(true)
  })
  it('fails two-thirds when approvals fall short of ceil(2/3 of decisive votes)', () => {
    // 3 cast (quorum met), 2 approve / 1 reject? that's 2/3 -> passes. Use 3 approve 2 reject = 3/5, ceil(5*2/3)=4, 3<4 fail
    const t = tallyVotes(['approve', 'approve', 'approve', 'reject', 'reject'])
    expect(t.quorumMet).toBe(true)
    expect(t.twoThirdsMet).toBe(false)
    expect(t.passes).toBe(false)
  })
  it('fails when all abstain (no decisive votes) even at quorum', () => {
    const t = tallyVotes(['abstain', 'abstain', 'abstain'])
    expect(t.quorumMet).toBe(true)
    expect(t.twoThirdsMet).toBe(false)
    expect(t.passes).toBe(false)
  })
})

describe('window helpers', () => {
  it('decisionDueDate is 7 days after open', () => {
    const opened = new Date('2026-08-15T00:00:00Z')
    expect(decisionDueDate(opened).toISOString()).toBe('2026-08-22T00:00:00.000Z')
  })
  it('isExpired true only after the due date', () => {
    const due = new Date('2026-08-22T00:00:00Z')
    expect(isExpired(due, new Date('2026-08-21T23:00:00Z'))).toBe(false)
    expect(isExpired(due, new Date('2026-08-22T00:00:01Z'))).toBe(true)
  })
  it('QUORUM_FLOOR is 3', () => { expect(QUORUM_FLOOR).toBe(3) })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/enforcement.test.ts`
Expected: FAIL — `./enforcement` not found.

- [ ] **Step 3: Implement `src/lib/enforcement.ts`**

```typescript
export const QUORUM_FLOOR = 3
export const DECISION_WINDOW_DAYS = 7

export type VoteValue = 'approve' | 'reject' | 'abstain'

export function computeEligibleBoard(boardMemberIds: string[], recusedIds: string[]): string[] {
  const recused = new Set(recusedIds)
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of boardMemberIds) {
    if (recused.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export type Tally = {
  cast: number; approve: number; reject: number; abstain: number
  quorumMet: boolean; twoThirdsMet: boolean; passes: boolean
}

export function tallyVotes(votes: VoteValue[]): Tally {
  const approve = votes.filter((v) => v === 'approve').length
  const reject = votes.filter((v) => v === 'reject').length
  const abstain = votes.filter((v) => v === 'abstain').length
  const cast = approve + reject + abstain
  const decisive = approve + reject
  const quorumMet = cast >= QUORUM_FLOOR
  const twoThirdsMet = decisive > 0 && approve >= Math.ceil((decisive * 2) / 3)
  return { cast, approve, reject, abstain, quorumMet, twoThirdsMet, passes: quorumMet && twoThirdsMet }
}

export function decisionDueDate(openedAt: Date): Date {
  return new Date(openedAt.getTime() + DECISION_WINDOW_DAYS * 24 * 60 * 60 * 1000)
}

export function isExpired(decisionDueAt: Date, now: Date): boolean {
  return now.getTime() > decisionDueAt.getTime()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/enforcement.test.ts`
Expected: PASS (all cases). Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/enforcement.ts src/lib/enforcement.test.ts
git commit -m "feat: pure enforcement vote engine (quorum + two-thirds, expiry, eligible board)"
```

---

### Task 3: Status gate — deny members-area access when interim/banned

**Files:**
- Modify: `src/lib/roster.ts` (extend `isCurrentMember` OR add a status check) — the members-area gate consumes this.
- Test: `src/lib/roster.test.ts`

**Interfaces:**
- Produces: `isAccessBlocked(status: string | null | undefined): boolean` — pure: returns true when status is `interim` or `banned`. Consumed by the members-area layout/auth to deny access.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/roster.test.ts`:

```typescript
import { isAccessBlocked } from './roster'

describe('isAccessBlocked', () => {
  it('blocks interim and banned', () => {
    expect(isAccessBlocked('interim')).toBe(true)
    expect(isAccessBlocked('banned')).toBe(true)
  })
  it('allows active / null / undefined', () => {
    expect(isAccessBlocked('active')).toBe(false)
    expect(isAccessBlocked(null)).toBe(false)
    expect(isAccessBlocked(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/roster.test.ts`
Expected: FAIL — `isAccessBlocked` not exported.

- [ ] **Step 3: Implement + wire into the members gate**

In `src/lib/roster.ts` add:

```typescript
export function isAccessBlocked(status: string | null | undefined): boolean {
  return status === 'interim' || status === 'banned'
}
```

Then wire it into the members-area gate. In `src/app/members/layout.tsx` (the layout that wraps all `/members/*`), after resolving the session, look up the member's `status` and, if `isAccessBlocked`, redirect to a `/members/suspended` notice (or `/login`). Read the current layout first; add a Prisma lookup of `status` by the session email and the redirect. Create a minimal `src/app/members/suspended/page.tsx` that shows "Your access is currently paused — contact the board." (public-ish, no data).

- [ ] **Step 4: Run test + build**

Run: `npx vitest run src/lib/roster.test.ts` (pass), `npx tsc --noEmit`, `npx next build`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/roster.ts src/lib/roster.test.ts src/app/members/layout.tsx src/app/members/suspended/page.tsx
git commit -m "feat: interim/banned status blocks members-area access"
```

---

### Task 4: Enforcement server actions (freeze / open case / vote / execute / strike)

**Files:**
- Create: `src/app/members/admin/_actions/enforcement-actions.ts`
- Test: `src/app/members/admin/_actions/enforcement-actions.test.ts`

**Interfaces:**
- Consumes: `auth`; `recordAudit`; `tallyVotes`, `computeEligibleBoard`, `decisionDueDate`, `isExpired` from `enforcement.ts`; `prisma`.
- Produces `'use server'` actions, each board-gated via `requireBoard()` (import/reuse the one from `admin-actions.ts` — or re-declare identically). Each wraps a PURE inner function that is unit-tested with injected deps + actor:
  - `interimFreeze(subjectMemberId, subjectLabel, reason)` → sets Member.status='interim', creates EnforcementCase(kind='interim', decisionDueAt=+7d, eligibleBoardCount/recused snapshot), audit.
  - `openRemovalCase(subjectMemberId, subjectLabel, recusedIds[])` → snapshots eligible board from live roster (isBoard=true minus subject minus recused), creates EnforcementCase(kind='removal'), audit.
  - `castVote(caseId, vote)` → the voter is `auth()`'s memberId (NEVER a parameter). Upserts a CaseVote for (caseId, thisVoter). Rejects if voter not in the case's eligible board or is recused. audit.
  - `executeRemoval(caseId)` → recomputes tally from the case's CaseVotes; only if `tallyVotes(...).passes` sets Member.status='banned', case.status='resolved', outcome='removed'; else returns {ok:false, reason:'Vote has not passed.'}. audit.
  - `liftCase(caseId)` → status back to 'active', case resolved outcome='lifted'. audit.
  - `recordStrike(memberId, memberLabel, level, reason)` → creates Strike (expiresAt=+12mo for warning/board-decides). audit.

**Testable core (unit-test these, NOT through auth/prisma):** `applyCastVote(deps, actor, caseMeta, vote)` and `applyExecuteRemoval(deps, actor, votes)` where the security rules live:
- `applyCastVote`: reject if actor null (not board); reject if actor.memberId not in caseMeta.eligibleBoardIds; else record vote as actor.memberId (proves it can't vote-as-someone-else). 
- `applyExecuteRemoval`: reject if actor null; compute `tallyVotes(votes)`; if !passes reject with reason; else signal ban.

- [ ] **Step 1: Write the failing tests**

Create `src/app/members/admin/_actions/enforcement-actions.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { applyCastVote, applyExecuteRemoval } from './enforcement-actions'

const actor = { memberId: 'm-nate', email: 'nate@wcb.com' }
const caseMeta = { id: 'c1', eligibleBoardIds: ['m-jordan', 'm-nate', 'm-karl'] }

describe('applyCastVote', () => {
  it('rejects a non-board actor (null) without recording', async () => {
    const rec = vi.fn(async () => {})
    const r = await applyCastVote({ saveVote: rec }, null, caseMeta, 'approve')
    expect(r.ok).toBe(false)
    expect(rec).not.toHaveBeenCalled()
  })
  it('rejects a board member who is not eligible on this case (recused/not-on-board)', async () => {
    const rec = vi.fn(async () => {})
    const outsider = { memberId: 'm-outsider', email: 'x@wcb.com' }
    const r = await applyCastVote({ saveVote: rec }, outsider, caseMeta, 'approve')
    expect(r.ok).toBe(false)
    expect(rec).not.toHaveBeenCalled()
  })
  it('records the vote AS THE ACTOR (never a passed-in voter id)', async () => {
    const rec = vi.fn(async () => {})
    const r = await applyCastVote({ saveVote: rec }, actor, caseMeta, 'approve')
    expect(r.ok).toBe(true)
    expect(rec).toHaveBeenCalledWith('c1', 'm-nate', 'approve') // caseId, actor.memberId, vote
  })
})

describe('applyExecuteRemoval', () => {
  it('rejects when the tally has not passed (below quorum)', async () => {
    const ban = vi.fn(async () => {})
    const r = await applyExecuteRemoval({ banMember: ban }, actor, ['approve', 'approve'])
    expect(r.ok).toBe(false)
    expect(ban).not.toHaveBeenCalled()
  })
  it('bans when quorum + two-thirds pass', async () => {
    const ban = vi.fn(async () => {})
    const r = await applyExecuteRemoval({ banMember: ban }, actor, ['approve', 'approve', 'approve'])
    expect(r.ok).toBe(true)
    expect(ban).toHaveBeenCalledOnce()
  })
  it('rejects a null actor', async () => {
    const ban = vi.fn(async () => {})
    const r = await applyExecuteRemoval({ banMember: ban }, null, ['approve', 'approve', 'approve'])
    expect(r.ok).toBe(false)
    expect(ban).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/members/admin/_actions/enforcement-actions.test.ts`
Expected: FAIL — module/functions not found.

- [ ] **Step 3: Implement the actions**

Create `src/app/members/admin/_actions/enforcement-actions.ts`. Put the pure cores first (exported for test), then the `'use server'` wrappers. Full skeleton:

```typescript
'use server'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { tallyVotes, computeEligibleBoard, decisionDueDate, type VoteValue } from '@/lib/enforcement'

type Actor = { memberId?: string; email: string }

async function requireBoard(): Promise<Actor | null> {
  const s = await auth()
  if (!s?.user?.isBoard || !s.user.email) return null
  return { memberId: s.user.memberId, email: s.user.email }
}

// ---- pure, testable cores ----
export async function applyCastVote(
  deps: { saveVote: (caseId: string, voterMemberId: string, vote: VoteValue) => Promise<void> },
  actor: Actor | null,
  caseMeta: { id: string; eligibleBoardIds: string[] },
  vote: VoteValue,
): Promise<{ ok: boolean; reason?: string }> {
  if (!actor?.memberId) return { ok: false, reason: 'Not authorized.' }
  if (!caseMeta.eligibleBoardIds.includes(actor.memberId)) return { ok: false, reason: 'You are not an eligible voter on this case.' }
  await deps.saveVote(caseMeta.id, actor.memberId, vote) // vote recorded as ACTOR, not a param
  return { ok: true }
}

export async function applyExecuteRemoval(
  deps: { banMember: () => Promise<void> },
  actor: Actor | null,
  votes: VoteValue[],
): Promise<{ ok: boolean; reason?: string }> {
  if (!actor?.memberId) return { ok: false, reason: 'Not authorized.' }
  const tally = tallyVotes(votes)
  if (!tally.passes) return { ok: false, reason: 'Vote has not passed (need quorum of 3 and two-thirds approval).' }
  await deps.banMember()
  return { ok: true }
}

// ---- 'use server' wrappers (thin; wire pure cores to prisma + auth) ----
export async function interimFreezeAction(subjectMemberId: string, subjectLabel: string, reason: string) {
  const actor = await requireBoard()
  if (!actor?.memberId) return { ok: false, reason: 'Not authorized.' }
  const now = new Date()
  await prisma.member.update({ where: { id: subjectMemberId }, data: { status: 'interim' } })
  await prisma.enforcementCase.create({ data: {
    subjectMemberId, subjectLabel, kind: 'interim', openedByMemberId: actor.memberId,
    openedByEmail: actor.email, eligibleBoardCount: 0, recusedMemberIds: '', decisionDueAt: decisionDueDate(now),
  }})
  await recordAudit({ actorMemberId: actor.memberId, actorEmail: actor.email, action: 'interim-freeze', targetMemberId: subjectMemberId, targetLabel: subjectLabel, detail: reason })
  return { ok: true }
}

export async function openRemovalCaseAction(subjectMemberId: string, subjectLabel: string, recusedIds: string[]) {
  const actor = await requireBoard()
  if (!actor?.memberId) return { ok: false, reason: 'Not authorized.' }
  const board = await prisma.member.findMany({ where: { isBoard: true }, select: { id: true } })
  const eligible = computeEligibleBoard(board.map((b) => b.id), [subjectMemberId, ...recusedIds])
  const now = new Date()
  const c = await prisma.enforcementCase.create({ data: {
    subjectMemberId, subjectLabel, kind: 'removal', openedByMemberId: actor.memberId, openedByEmail: actor.email,
    eligibleBoardCount: eligible.length, recusedMemberIds: [subjectMemberId, ...recusedIds].join(','), decisionDueAt: decisionDueDate(now),
  }})
  await recordAudit({ actorMemberId: actor.memberId, actorEmail: actor.email, action: 'open-removal-case', targetMemberId: subjectMemberId, targetLabel: subjectLabel, detail: `eligible=${eligible.length}` })
  return { ok: true, caseId: c.id }
}

export async function castVoteAction(caseId: string, vote: VoteValue) {
  const actor = await requireBoard()
  const c = await prisma.enforcementCase.findUnique({ where: { id: caseId } })
  if (!c) return { ok: false, reason: 'Case not found.' }
  const board = await prisma.member.findMany({ where: { isBoard: true }, select: { id: true } })
  const recused = c.recusedMemberIds ? c.recusedMemberIds.split(',') : []
  const eligible = computeEligibleBoard(board.map((b) => b.id), recused)
  const result = await applyCastVote({
    saveVote: async (cid, voter, v) => {
      await prisma.caseVote.upsert({
        where: { caseId_voterMemberId: { caseId: cid, voterMemberId: voter } },
        update: { vote: v },
        create: { caseId: cid, voterMemberId: voter, voterEmail: actor!.email, vote: v },
      })
    },
  }, actor, { id: caseId, eligibleBoardIds: eligible }, vote)
  if (result.ok && actor?.memberId) {
    await recordAudit({ actorMemberId: actor.memberId, actorEmail: actor.email, action: 'cast-vote', targetLabel: c.subjectLabel, detail: `${vote} on case ${caseId}` })
  }
  return result
}

export async function executeRemovalAction(caseId: string) {
  const actor = await requireBoard()
  const c = await prisma.enforcementCase.findUnique({ where: { id: caseId }, include: { votes: true } })
  if (!c) return { ok: false, reason: 'Case not found.' }
  const votes = c.votes.map((v) => v.vote as VoteValue)
  const result = await applyExecuteRemoval({
    banMember: async () => {
      await prisma.member.update({ where: { id: c.subjectMemberId }, data: { status: 'banned' } })
      await prisma.enforcementCase.update({ where: { id: caseId }, data: { status: 'resolved', resolvedAt: new Date(), outcome: 'removed' } })
    },
  }, actor, votes)
  if (result.ok && actor?.memberId) {
    await recordAudit({ actorMemberId: actor.memberId, actorEmail: actor.email, action: 'execute-removal', targetMemberId: c.subjectMemberId, targetLabel: c.subjectLabel, detail: 'removed by board vote' })
  }
  return result
}

export async function liftCaseAction(caseId: string) {
  const actor = await requireBoard()
  if (!actor?.memberId) return { ok: false, reason: 'Not authorized.' }
  const c = await prisma.enforcementCase.findUnique({ where: { id: caseId } })
  if (!c) return { ok: false, reason: 'Case not found.' }
  await prisma.member.update({ where: { id: c.subjectMemberId }, data: { status: 'active' } })
  await prisma.enforcementCase.update({ where: { id: caseId }, data: { status: 'resolved', resolvedAt: new Date(), outcome: 'lifted' } })
  await recordAudit({ actorMemberId: actor.memberId, actorEmail: actor.email, action: 'lift-case', targetMemberId: c.subjectMemberId, targetLabel: c.subjectLabel, detail: null })
  return { ok: true }
}

export async function recordStrikeAction(memberId: string, memberLabel: string, level: string, reason: string) {
  const actor = await requireBoard()
  if (!actor?.memberId) return { ok: false, reason: 'Not authorized.' }
  const now = new Date()
  const expiresAt = level === 'correction' ? null : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
  await prisma.strike.create({ data: { memberId, memberLabel, level, reason, issuedByEmail: actor.email, expiresAt } })
  await recordAudit({ actorMemberId: actor.memberId, actorEmail: actor.email, action: 'record-strike', targetMemberId: memberId, targetLabel: memberLabel, detail: `${level}: ${reason}` })
  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/members/admin/_actions/enforcement-actions.test.ts`
Expected: PASS. Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/app/members/admin/_actions/enforcement-actions.ts src/app/members/admin/_actions/enforcement-actions.test.ts
git commit -m "feat: enforcement server actions (freeze/open/vote/execute/lift/strike) with unfakeable vote + audit"
```

---

### Task 5: Enforcement UI on the admin page (cases + voting + strikes)

**Files:**
- Create: `src/app/members/admin/enforcement/page.tsx` (board-gated; lists open cases + a form to open a case / freeze; renders each case with the current tally + the CURRENT board member's vote buttons; shows expired flag)
- Create: `src/components/members/EnforcementPanel.tsx` (client; vote buttons call `castVoteAction`, execute/lift call their actions, open/freeze forms)

**Interfaces:**
- Consumes: `auth`; `prisma` (read cases + votes + strikes); the enforcement actions; `tallyVotes`, `isExpired` from `enforcement.ts`.

- [ ] **Step 1: Implement the page (server, board-gated)**

Create `src/app/members/admin/enforcement/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { tallyVotes, isExpired, type VoteValue } from '@/lib/enforcement'
import { EnforcementPanel } from '@/components/members/EnforcementPanel'

export const dynamic = 'force-dynamic'

export default async function EnforcementPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  if (!session.user.isBoard) redirect('/members')

  const now = new Date()
  const cases = await prisma.enforcementCase.findMany({ where: { status: 'open' }, include: { votes: true }, orderBy: { createdAt: 'desc' } })
  const view = cases.map((c) => {
    const tally = tallyVotes(c.votes.map((v) => v.vote as VoteValue))
    return {
      id: c.id, kind: c.kind, subjectLabel: c.subjectLabel, subjectMemberId: c.subjectMemberId,
      eligibleBoardCount: c.eligibleBoardCount, decisionDueAt: c.decisionDueAt.toISOString(),
      expired: isExpired(c.decisionDueAt, now), tally,
      myVote: c.votes.find((v) => v.voterMemberId === session.user!.memberId)?.vote ?? null,
    }
  })
  // candidate members to open a case against (current, not already banned)
  const members = await prisma.member.findMany({ where: { current: true }, select: { id: true, name: true, status: true }, orderBy: { name: 'asc' } })

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl font-bold">Enforcement</h1>
      <p className="text-foreground/50 text-sm mt-1">Board only. Interim freeze is one-key; removal needs quorum of 3 and two-thirds of votes cast.</p>
      <EnforcementPanel cases={view} members={members.map((m) => ({ id: m.id, name: m.name ?? '(no name)', status: m.status }))} />
    </div>
  )
}
```

- [ ] **Step 2: Implement the client panel**

Create `src/components/members/EnforcementPanel.tsx` ('use client'): a section to open a case (pick a member → "Interim freeze" or "Open removal vote"), and per open case: show subject, kind, due date (red if expired), the live tally (`cast`/approve/reject, quorumMet, twoThirdsMet, passes), the current board member's vote buttons (Approve / Reject / Abstain → `castVoteAction`), an "Execute removal" button (enabled only when `tally.passes`, calls `executeRemovalAction`), and a "Lift" button (`liftCaseAction`). Use `useTransition`, surface results. Match members-area dark tokens. Escape apostrophes.

Keep it functional and clear; reuse the run-in-transition pattern from `AdminRoster.tsx`. The Execute button MUST be disabled unless `c.tally.passes` (defense-in-depth; the action also re-checks server-side).

- [ ] **Step 3: Verify build + gate**

Run: `npx tsc --noEmit`, `npx next build` (`/members/admin/enforcement` = ƒ). If dev server available: non-board → redirected; board sees the panel.

- [ ] **Step 4: Commit**

```bash
git add src/app/members/admin/enforcement/page.tsx src/components/members/EnforcementPanel.tsx
git commit -m "feat: enforcement UI (open case, freeze, cast vote, execute/lift) board-gated"
```

---

### Task 6: Link enforcement from the admin page + per-member strike view

**Files:**
- Modify: `src/app/members/admin/page.tsx` (add a link to `/members/admin/enforcement`)
- Modify: `src/components/members/AdminRoster.tsx` (add a per-member "strikes" summary or a record-strike control — minimal: a link/button per member to record a strike via `recordStrikeAction`)

**Interfaces:**
- Consumes: `recordStrikeAction` from enforcement-actions; existing AdminRoster.

- [ ] **Step 1: Add the enforcement link on the admin page**

In `src/app/members/admin/page.tsx`, add near the header a `<Link href="/members/admin/enforcement">` styled as a button ("Enforcement & cases →").

- [ ] **Step 2: Add record-strike control to each roster row**

In `AdminRoster.tsx`, add to each `MemberRow` a compact control: a select for level (Correction / Warning / Board decides), a reason input, and a "Record strike" button calling `recordStrikeAction(m.email??m.id, m.name, level, reason)`. NOTE: `recordStrikeAction` takes `memberId` — the roster Row currently has `email` not `id`. Pass a stable identifier: extend the Row mapping in `page.tsx` to include `id` (from the roster/DB) OR use email as the memberId key consistently. Simplest: add `id` to the Row (the DB member id if available; else email). Wire it through. Keep it minimal and board-gated (the action re-checks).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`, `npx next build`.

- [ ] **Step 4: Commit**

```bash
git add src/app/members/admin/page.tsx src/components/members/AdminRoster.tsx
git commit -m "feat: link enforcement + per-member record-strike control on admin roster"
```

---

## Self-Review

**Spec coverage (B + C):**
- Status field + interim/banned blocks members-area access → Tasks 1, 3 ✅
- Interim freeze (1-key, 7-day clock, expiry flag) → Tasks 1, 2 (`decisionDueDate`/`isExpired`), 4 (`interimFreezeAction`), 5 (UI + expired flag) ✅
- Unfakeable removal vote (vote tied to authenticated actor; quorum 3 + two-thirds; non-vote=abstain; denominator snapshot; recusal) → Tasks 2 (`tallyVotes`/`computeEligibleBoard`), 4 (`applyCastVote` records as actor; `castVoteAction` upsert with @@unique) ✅
- Execute hard-locked behind passes → Tasks 2, 4 (`applyExecuteRemoval`), 5 (button disabled unless passes + server re-check) ✅
- Strike log (3-rung levels, 12-mo expiry) → Tasks 1 (Strike model), 4 (`recordStrikeAction`), 6 (UI) ✅
- Every state change audited → Task 4 (all actions call recordAudit) ✅
- Board-gated everywhere → Tasks 4, 5 (requireBoard + page gate) ✅
- Discord/Drive cascade OUT → documented; only Status is set ✅

**Placeholder scan:** none. Task 5 step 2 + Task 6 step 2 describe UI in prose but give the exact actions/props/behavior + the run-in-transition pattern to reuse; acceptable for UI glue (the security-critical logic is fully coded + tested in Tasks 2/4).

**Type consistency:** `VoteValue` (Task 2) used in Tasks 4, 5. `tallyVotes` Tally shape (Task 2) consumed in Tasks 4, 5. `applyCastVote`/`applyExecuteRemoval` signatures (Task 4 impl) match their tests. `EnforcementCase`/`CaseVote`/`Strike` fields (Task 1) match the prisma calls in Task 4.

---

## Notes for the implementer
- DEPLOY: `prisma db push` for the 4 model changes (Member.status + EnforcementCase + CaseVote + Strike) before use.
- The unfakeable-vote guarantee lives in Task 4: `castVoteAction` derives the voter from `auth()` and passes `actor.memberId` to `saveVote` — the vote value is the only client input. The `@@unique([caseId, voterMemberId])` prevents double-voting at the DB. Tests assert the vote is recorded as the actor, never a passed-in id.
- `recordStrikeAction`/UI: don't overbuild the strike view — a record control + audit is the C requirement; a rich per-member history view can come later.
- Do NOT build the Discord/Drive cascade (separate bot repo). Setting `Member.status` is the boundary of this build.
