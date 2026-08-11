# Competition Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/members/competitions` subsystem where members track external homebrew comps + their beer entries, and officers see all entries across the club to plan shipping (containers to buy = club-ship entries × bottles-required).

**Architecture:** Two additive Prisma models (`Competition`, `CompEntry`). A framework-free logic module `src/lib/competitions.ts` (pure functions + DI'd db, unit-tested) holds all queries + derived logistics dates + the banner computation. Server actions in `src/app/members/_actions/competition-actions.ts` enforce permissions. A member dashboard page, an officer section, and a live hub banner consume them. No cron/email/push, no external address API.

**Tech Stack:** Next.js 16 App Router (server components + server actions), React 19, TypeScript, Prisma 6 / Postgres, Tailwind v4 (existing CSS-var tokens), Vitest.

## Global Constraints

- Additive only: two new models, no change to existing lending/auth/dashboard tables. New env: none. New npm dependency: none.
- No Prisma enums — `channel` is a `String` with a TS union `type EntryChannel = 'club_ship' | 'self_ship' | 'dropoff'`.
- `CompEntry.memberId` is a plain `String` with NO relation (lending convention); member details come from a batched `member.findMany({ where: { id: { in: ids } } })`; an entry whose memberId has no Member row must render as "Unknown member," never dropped/throwing.
- Logic module `src/lib/competitions.ts` is framework-free and DI'd for tests: `(..., deps: { db?: typeof prisma; now?: Date } = {})`. Mirrors `src/lib/lending.ts`.
- Permissions (server-enforced; UI hiding is never the gate): anyone logged-in adds a comp; a comp is editable by its `addedById` OR a board member; deletable by board only. Entries are mutable only by their owner (`memberId === actor`). Officers do NOT edit others' entries (owner-only, per approved default).
- Derived dates: `commitByDate = deliverByDate = shippingDeadline − 7 days` (kept as two named helpers so they can diverge later). `isPast = shippingDeadline < now`. `podTotal = (# club_ship entries) × bottlesRequired`.
- Banner is live-computed on page load — NO cron/email/push. Not dismissible in v1.
- Officers see all entries in full (beer name + style + owner + channel + registered); members see only their own; no peer visibility; no field redaction.
- Addresses are free text; render a Google Maps link `https://www.google.com/maps/search/?api=1&query=<encodeURIComponent(address)>`. No validation.
- Visual tokens: cards `rounded-2xl border border-border/50 bg-card-bg/30`, forms `bg-card-bg/20`, accent `#ff9500`, red `text-red-400` for urgent/overdue. Dates `d.toISOString().slice(0,10)`.

---

## File Structure

- `prisma/schema.prisma` (MODIFY) — add `Competition` + `CompEntry` models.
- `src/lib/competitions.ts` (CREATE) — types, queries, derived helpers, banner computation, state-change cores.
- `src/lib/competitions.test.ts` (CREATE) — unit tests (DI'd-fake db + fixed now).
- `src/app/members/_actions/competition-actions.ts` (CREATE) — permission-gated server actions.
- `src/app/members/_actions/competition-actions.test.ts` (CREATE) — permission-gate tests.
- `src/app/members/competitions/page.tsx` (CREATE) — member dashboard (+ officer section when board).
- `src/components/members/AddCompetitionForm.tsx` (CREATE) — client add-comp form.
- `src/components/members/CompetitionCard.tsx` (CREATE) — client: one comp + own entries + entry/comp controls.
- `src/components/members/OfficerCompetitions.tsx` (CREATE) — board-only club-wide table.
- `src/components/members/CompBanner.tsx` (CREATE) — live hub banner (client presentational; takes computed items).
- `src/components/SiteHeader.tsx` (MODIFY) — "Competitions" nav link (all members).
- `src/components/members/FeatureNav.tsx` (MODIFY) — Competitions hub card.
- `src/app/members/page.tsx` (MODIFY) — render `<CompBanner>` from `computeBannerItems`.

Build in 4 phases: **Phase 1** (Tasks 1–3: model + logic + actions), **Phase 2** (Tasks 4–6: member dashboard + nav), **Phase 3** (Task 7: officer section), **Phase 4** (Tasks 8–9: banner). Each phase is independently shippable.

---

## PHASE 1 — Data model, logic, actions

### Task 1: Prisma models `Competition` + `CompEntry`

**Files:**
- Modify: `prisma/schema.prisma` (append the two models after the `Loan` model)

- [ ] **Step 1: Add the models**

Append to `prisma/schema.prisma`:

```prisma
model Competition {
  id                   String      @id @default(cuid())
  name                 String
  homepageUrl          String
  registrationDeadline DateTime
  shippingDeadline     DateTime
  bottlesRequired      Int
  shippingAddress      String
  dropoffAddress       String?
  addedById            String
  entries              CompEntry[]
  createdAt            DateTime    @default(now())
  updatedAt            DateTime    @updatedAt
  @@index([shippingDeadline])
}

model CompEntry {
  id            String      @id @default(cuid())
  competitionId String
  competition   Competition @relation(fields: [competitionId], references: [id], onDelete: Cascade)
  memberId      String
  beerName      String
  style         String
  channel       String      // 'club_ship' | 'self_ship' | 'dropoff'
  registered    Boolean     @default(false)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  @@index([competitionId])
  @@index([memberId])
}
```

- [ ] **Step 2: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: success; the client now knows `competition` + `compEntry` delegates. (Do NOT run `db push` here — that's a deploy step against the live DB.)

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(competitions): Competition + CompEntry Prisma models"
```

---

### Task 2: Logic module `src/lib/competitions.ts` (queries + derived + banner)

**Files:**
- Create: `src/lib/competitions.ts`
- Test: `src/lib/competitions.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/db`.
- Produces:
  ```ts
  export type EntryChannel = 'club_ship' | 'self_ship' | 'dropoff'
  export type CompEntryView = { id: string; memberId: string; memberName: string | null; beerName: string; style: string; channel: EntryChannel; registered: boolean }
  export type CompetitionView = {
    id: string; name: string; homepageUrl: string
    registrationDeadline: Date; shippingDeadline: Date; bottlesRequired: number
    shippingAddress: string; dropoffAddress: string | null; addedById: string
    commitByDate: Date; deliverByDate: Date; isPast: boolean
  }
  export type MemberCompView = CompetitionView & { myEntries: CompEntryView[] }
  export type OfficerCompView = CompetitionView & { entries: CompEntryView[]; podTotal: number; perMember: { memberId: string; memberName: string | null; entryCount: number; clubShipCount: number; registeredCount: number }[] }
  export type BannerItem = { competitionId: string; competitionName: string; kind: 'register' | 'commit' | 'deliver' | 'ship'; date: Date; daysAway: number; detail: string }
  export type NewCompetitionInput = { name: string; homepageUrl: string; registrationDeadline: Date; shippingDeadline: Date; bottlesRequired: number; shippingAddress: string; dropoffAddress?: string | null }
  export type NewEntryInput = { beerName: string; style: string; channel: EntryChannel; registered: boolean }
  export type CompResult = { ok: true; id: string } | { ok: false; reason: 'validation' | 'not_found' | 'forbidden' }
  export type MutResult = { ok: true } | { ok: false; reason: 'not_found' | 'forbidden' }

  export function mapsUrl(address: string): string
  export function isPast(shippingDeadline: Date, now: Date): boolean
  export function commitByDate(shippingDeadline: Date): Date
  export function deliverByDate(shippingDeadline: Date): Date
  export function podTotal(entries: { channel: EntryChannel }[], bottlesRequired: number): number
  export async function listMemberComps(memberId: string, deps?: { db?: typeof prisma; now?: Date }): Promise<MemberCompView[]>
  export async function listPastComps(deps?: { db?: typeof prisma; now?: Date }): Promise<CompetitionView[]>
  export async function listOfficerComps(deps?: { db?: typeof prisma; now?: Date }): Promise<OfficerCompView[]>
  export function computeBannerItems(comps: OfficerCompView[], memberId: string, isBoard: boolean, now: Date): BannerItem[]
  export async function addCompetition(input: NewCompetitionInput, addedById: string, deps?: { db?: typeof prisma }): Promise<CompResult>
  export async function editCompetition(id: string, patch: Partial<NewCompetitionInput>, actor: { memberId: string; isBoard: boolean }, deps?: { db?: typeof prisma }): Promise<MutResult>
  export async function deleteCompetition(id: string, deps?: { db?: typeof prisma }): Promise<MutResult>
  export async function addEntry(competitionId: string, input: NewEntryInput, memberId: string, deps?: { db?: typeof prisma }): Promise<CompResult>
  export async function editEntry(entryId: string, patch: Partial<NewEntryInput>, memberId: string, deps?: { db?: typeof prisma }): Promise<MutResult>
  export async function deleteEntry(entryId: string, memberId: string, deps?: { db?: typeof prisma }): Promise<MutResult>
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/competitions.test.ts`:

```ts
import { test, expect } from 'vitest'
import {
  mapsUrl, isPast, commitByDate, deliverByDate, podTotal,
  listMemberComps, listOfficerComps, computeBannerItems,
  addCompetition, editCompetition, deleteCompetition, addEntry, editEntry, deleteEntry,
} from './competitions'

const day = 86400000
const NOW = new Date('2026-09-01T00:00:00Z')

test('mapsUrl encodes the address into a google maps query URL', () => {
  expect(mapsUrl('123 Main St, Holly Springs NC')).toBe(
    'https://www.google.com/maps/search/?api=1&query=123%20Main%20St%2C%20Holly%20Springs%20NC'
  )
})

test('isPast: shipping deadline before now is past', () => {
  expect(isPast(new Date(NOW.getTime() - day), NOW)).toBe(true)
  expect(isPast(new Date(NOW.getTime() + day), NOW)).toBe(false)
})

test('commitByDate/deliverByDate are 7 days before shipping deadline', () => {
  const ship = new Date('2026-09-20T00:00:00Z')
  expect(commitByDate(ship).toISOString()).toBe('2026-09-13T00:00:00.000Z')
  expect(deliverByDate(ship).toISOString()).toBe('2026-09-13T00:00:00.000Z')
})

test('podTotal counts only club_ship entries times bottlesRequired', () => {
  const entries = [{ channel: 'club_ship' as const }, { channel: 'club_ship' as const }, { channel: 'self_ship' as const }, { channel: 'dropoff' as const }]
  expect(podTotal(entries, 3)).toBe(6) // 2 club_ship * 3 bottles
  expect(podTotal([], 3)).toBe(0)
})

// --- fake db ---
function db(comps: any[], entries: any[], members: any[] = []) {
  const findComp = (id: string) => comps.find((c) => c.id === id)
  const findEntry = (id: string) => entries.find((e) => e.id === id)
  return {
    competition: {
      findMany: async ({ where }: any = {}) => {
        // where.shippingDeadline is { lt: now } (past) or { gte: now } (active)
        let rows = comps
        if (where?.shippingDeadline?.lt) rows = rows.filter((c) => c.shippingDeadline < where.shippingDeadline.lt)
        if (where?.shippingDeadline?.gte) rows = rows.filter((c) => c.shippingDeadline >= where.shippingDeadline.gte)
        return rows.map((c) => ({ ...c, entries: entries.filter((e) => e.competitionId === c.id) }))
      },
      findUnique: async ({ where }: any) => findComp(where.id) ?? null,
      create: async ({ data }: any) => { const row = { id: 'newcomp', ...data }; comps.push(row); return row },
      update: async ({ where, data }: any) => { Object.assign(findComp(where.id), data); return findComp(where.id) },
      delete: async ({ where }: any) => { const i = comps.findIndex((c) => c.id === where.id); comps.splice(i, 1); return {} },
    },
    compEntry: {
      findUnique: async ({ where }: any) => findEntry(where.id) ?? null,
      create: async ({ data }: any) => { const row = { id: 'newentry', ...data }; entries.push(row); return row },
      update: async ({ where, data }: any) => { Object.assign(findEntry(where.id), data); return findEntry(where.id) },
      delete: async ({ where }: any) => { const i = entries.findIndex((e) => e.id === where.id); entries.splice(i, 1); return {} },
    },
    member: {
      findMany: async ({ where }: any) => members.filter((m) => (where?.id?.in ?? []).includes(m.id)),
    },
  } as any
}

const comp = (over: any = {}) => ({
  id: 'c1', name: 'SHA Open', homepageUrl: 'https://sha.org',
  registrationDeadline: new Date('2026-09-10T00:00:00Z'), shippingDeadline: new Date('2026-09-20T00:00:00Z'),
  bottlesRequired: 3, shippingAddress: '1 A St', dropoffAddress: null, addedById: 'm1', ...over,
})
const entry = (over: any = {}) => ({ id: 'e1', competitionId: 'c1', memberId: 'm1', beerName: 'Hazy', style: 'NEIPA', channel: 'club_ship', registered: true, ...over })

test('listMemberComps: only the viewer own entries, active only, with derived dates', async () => {
  const comps = [comp(), comp({ id: 'c2', shippingDeadline: new Date(NOW.getTime() - day) })] // c2 is past
  const entries = [entry({ id: 'e1', memberId: 'm1' }), entry({ id: 'e2', memberId: 'm2' })]
  const res = await listMemberComps('m1', { db: db(comps, entries), now: NOW })
  expect(res.map((c) => c.id)).toEqual(['c1']) // c2 past -> excluded
  expect(res[0].myEntries.map((e) => e.id)).toEqual(['e1']) // only m1's entry
  expect(res[0].commitByDate.toISOString()).toBe('2026-09-13T00:00:00.000Z')
  expect(res[0].isPast).toBe(false)
})

test('listOfficerComps: all entries + podTotal + per-member breakdown; unknown member kept', async () => {
  const comps = [comp()]
  const entries = [
    entry({ id: 'e1', memberId: 'm1', channel: 'club_ship', registered: true }),
    entry({ id: 'e2', memberId: 'm1', channel: 'dropoff', registered: false }),
    entry({ id: 'e3', memberId: 'ghost', channel: 'club_ship', registered: true }),
  ]
  const members = [{ id: 'm1', name: 'Amy' }]
  const res = await listOfficerComps({ db: db(comps, entries, members), now: NOW })
  expect(res[0].entries.length).toBe(3)
  expect(res[0].podTotal).toBe(6) // 2 club_ship * 3
  const amy = res[0].perMember.find((p) => p.memberId === 'm1')!
  expect(amy.entryCount).toBe(2); expect(amy.clubShipCount).toBe(1); expect(amy.registeredCount).toBe(1)
  const ghost = res[0].perMember.find((p) => p.memberId === 'ghost')!
  expect(ghost.memberName).toBeNull() // unknown member kept, name null
})

test('computeBannerItems: member sees own approaching items; officer additionally sees club-wide', async () => {
  const comps = [comp()]
  const entries = [entry({ id: 'e1', memberId: 'm1', channel: 'club_ship' })]
  const officer = await listOfficerComps({ db: db(comps, entries, [{ id: 'm1', name: 'Amy' }]), now: NOW })
  // ship deadline 2026-09-20; commit/deliver 09-13; NOW 09-01 -> deliver ~12 days away (within a reasonable window)
  const memberItems = computeBannerItems(officer, 'm1', false, NOW)
  expect(memberItems.some((b) => b.competitionId === 'c1')).toBe(true)
  const nonEntrant = computeBannerItems(officer, 'nobody', false, NOW)
  expect(nonEntrant.length).toBe(0) // not their entry -> no member banner
  const officerItems = computeBannerItems(officer, 'nobody', true, NOW)
  expect(officerItems.some((b) => b.detail.includes('bottle') || b.kind === 'ship')).toBe(true) // club-wide logistics flag
})

test('addCompetition: rejects missing required fields; accepts valid', async () => {
  const store = db([], [])
  const bad = await addCompetition({ name: '', homepageUrl: 'x', registrationDeadline: NOW, shippingDeadline: NOW, bottlesRequired: 0, shippingAddress: '' } as any, 'm1', { db: store })
  expect(bad.ok).toBe(false)
  const good = await addCompetition({ name: 'C', homepageUrl: 'https://x', registrationDeadline: NOW, shippingDeadline: NOW, bottlesRequired: 2, shippingAddress: '1 A St' }, 'm1', { db: store })
  expect(good.ok).toBe(true)
})

test('editCompetition: adder or board only', async () => {
  const comps = [comp({ addedById: 'm1' })]
  const store = () => db(comps.map((c) => ({ ...c })), [])
  expect((await editCompetition('c1', { name: 'X' }, { memberId: 'm1', isBoard: false }, { db: store() })).ok).toBe(true)  // adder
  expect((await editCompetition('c1', { name: 'X' }, { memberId: 'other', isBoard: true }, { db: store() })).ok).toBe(true) // board
  expect((await editCompetition('c1', { name: 'X' }, { memberId: 'other', isBoard: false }, { db: store() })).ok).toBe(false) // neither
})

test('deleteCompetition: not_found when missing', async () => {
  expect((await deleteCompetition('nope', { db: db([], []) })).ok).toBe(false)
})

test('entry mutations: owner-only', async () => {
  const entries = [entry({ id: 'e1', memberId: 'm1' })]
  const store = () => db([comp()], entries.map((e) => ({ ...e })))
  expect((await addEntry('c1', { beerName: 'B', style: 'S', channel: 'dropoff', registered: false }, 'm2', { db: store() })).ok).toBe(true) // anyone adds their OWN
  expect((await editEntry('e1', { beerName: 'X' }, 'm1', { db: store() })).ok).toBe(true)  // owner
  expect((await editEntry('e1', { beerName: 'X' }, 'm2', { db: store() })).ok).toBe(false) // not owner
  expect((await deleteEntry('e1', 'm2', { db: store() })).ok).toBe(false) // not owner
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/competitions.test.ts`
Expected: FAIL — `./competitions` not found.

- [ ] **Step 3: Implement `src/lib/competitions.ts`**

```ts
import { prisma } from '@/lib/db'

export type EntryChannel = 'club_ship' | 'self_ship' | 'dropoff'
const SEVEN_DAYS = 7 * 86400000
const BANNER_WINDOW_DAYS = 21 // surface items within ~3 weeks

export type CompEntryView = { id: string; memberId: string; memberName: string | null; beerName: string; style: string; channel: EntryChannel; registered: boolean }
export type CompetitionView = {
  id: string; name: string; homepageUrl: string
  registrationDeadline: Date; shippingDeadline: Date; bottlesRequired: number
  shippingAddress: string; dropoffAddress: string | null; addedById: string
  commitByDate: Date; deliverByDate: Date; isPast: boolean
}
export type MemberCompView = CompetitionView & { myEntries: CompEntryView[] }
export type OfficerCompView = CompetitionView & {
  entries: CompEntryView[]; podTotal: number
  perMember: { memberId: string; memberName: string | null; entryCount: number; clubShipCount: number; registeredCount: number }[]
}
export type BannerItem = { competitionId: string; competitionName: string; kind: 'register' | 'commit' | 'deliver' | 'ship'; date: Date; daysAway: number; detail: string }
export type NewCompetitionInput = { name: string; homepageUrl: string; registrationDeadline: Date; shippingDeadline: Date; bottlesRequired: number; shippingAddress: string; dropoffAddress?: string | null }
export type NewEntryInput = { beerName: string; style: string; channel: EntryChannel; registered: boolean }
export type CompResult = { ok: true; id: string } | { ok: false; reason: 'validation' | 'not_found' | 'forbidden' }
export type MutResult = { ok: true } | { ok: false; reason: 'not_found' | 'forbidden' }

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}
export function isPast(shippingDeadline: Date, now: Date): boolean { return shippingDeadline.getTime() < now.getTime() }
export function commitByDate(shippingDeadline: Date): Date { return new Date(shippingDeadline.getTime() - SEVEN_DAYS) }
export function deliverByDate(shippingDeadline: Date): Date { return new Date(shippingDeadline.getTime() - SEVEN_DAYS) }
export function podTotal(entries: { channel: EntryChannel }[], bottlesRequired: number): number {
  return entries.filter((e) => e.channel === 'club_ship').length * bottlesRequired
}

function toCompView(c: any, now: Date): CompetitionView {
  return {
    id: c.id, name: c.name, homepageUrl: c.homepageUrl,
    registrationDeadline: c.registrationDeadline, shippingDeadline: c.shippingDeadline, bottlesRequired: c.bottlesRequired,
    shippingAddress: c.shippingAddress, dropoffAddress: c.dropoffAddress ?? null, addedById: c.addedById,
    commitByDate: commitByDate(c.shippingDeadline), deliverByDate: deliverByDate(c.shippingDeadline), isPast: isPast(c.shippingDeadline, now),
  }
}

async function memberNames(db: typeof prisma, ids: string[]): Promise<Map<string, string | null>> {
  const uniq = [...new Set(ids)]
  const rows = uniq.length ? await db.member.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } }) : []
  return new Map((rows as any[]).map((m) => [m.id, m.name ?? null]))
}

export async function listMemberComps(memberId: string, deps: { db?: typeof prisma; now?: Date } = {}): Promise<MemberCompView[]> {
  const db = deps.db ?? prisma
  const now = deps.now ?? new Date()
  const comps = await db.competition.findMany({ where: { shippingDeadline: { gte: now } }, include: { entries: true }, orderBy: { shippingDeadline: 'asc' } })
  return (comps as any[]).map((c) => ({
    ...toCompView(c, now),
    myEntries: (c.entries ?? []).filter((e: any) => e.memberId === memberId).map((e: any) => ({
      id: e.id, memberId: e.memberId, memberName: null, beerName: e.beerName, style: e.style, channel: e.channel as EntryChannel, registered: e.registered,
    })),
  }))
}

export async function listPastComps(deps: { db?: typeof prisma; now?: Date } = {}): Promise<CompetitionView[]> {
  const db = deps.db ?? prisma
  const now = deps.now ?? new Date()
  const comps = await db.competition.findMany({ where: { shippingDeadline: { lt: now } }, orderBy: { shippingDeadline: 'desc' } })
  return (comps as any[]).map((c) => toCompView(c, now))
}

export async function listOfficerComps(deps: { db?: typeof prisma; now?: Date } = {}): Promise<OfficerCompView[]> {
  const db = deps.db ?? prisma
  const now = deps.now ?? new Date()
  const comps = await db.competition.findMany({ where: { shippingDeadline: { gte: now } }, include: { entries: true }, orderBy: { shippingDeadline: 'asc' } })
  const allIds = (comps as any[]).flatMap((c) => (c.entries ?? []).map((e: any) => e.memberId))
  const names = await memberNames(db, allIds)
  return (comps as any[]).map((c) => {
    const entries: CompEntryView[] = (c.entries ?? []).map((e: any) => ({
      id: e.id, memberId: e.memberId, memberName: names.get(e.memberId) ?? null,
      beerName: e.beerName, style: e.style, channel: e.channel as EntryChannel, registered: e.registered,
    }))
    const byMember = new Map<string, { memberId: string; memberName: string | null; entryCount: number; clubShipCount: number; registeredCount: number }>()
    for (const e of entries) {
      let pm = byMember.get(e.memberId)
      if (!pm) { pm = { memberId: e.memberId, memberName: e.memberName, entryCount: 0, clubShipCount: 0, registeredCount: 0 }; byMember.set(e.memberId, pm) }
      pm.entryCount++
      if (e.channel === 'club_ship') pm.clubShipCount++
      if (e.registered) pm.registeredCount++
    }
    return { ...toCompView(c, now), entries, podTotal: podTotal(entries, c.bottlesRequired), perMember: [...byMember.values()] }
  })
}

export function computeBannerItems(comps: OfficerCompView[], memberId: string, isBoard: boolean, now: Date): BannerItem[] {
  const items: BannerItem[] = []
  const daysAway = (d: Date) => Math.ceil((d.getTime() - now.getTime()) / 86400000)
  for (const c of comps) {
    const mine = c.entries.filter((e) => e.memberId === memberId)
    const myClubShip = mine.filter((e) => e.channel === 'club_ship')
    // Member's own approaching items
    if (mine.length) {
      const reg = daysAway(c.registrationDeadline)
      if (reg >= 0 && reg <= BANNER_WINDOW_DAYS && mine.some((e) => !e.registered))
        items.push({ competitionId: c.id, competitionName: c.name, kind: 'register', date: c.registrationDeadline, daysAway: reg, detail: `Register your ${mine.length} entr${mine.length === 1 ? 'y' : 'ies'}` })
      if (myClubShip.length) {
        const del = daysAway(c.deliverByDate)
        if (del >= 0 && del <= BANNER_WINDOW_DAYS)
          items.push({ competitionId: c.id, competitionName: c.name, kind: 'deliver', date: c.deliverByDate, daysAway: del, detail: `Deliver your ${myClubShip.length} club-ship entr${myClubShip.length === 1 ? 'y' : 'ies'} to the shipper` })
      }
    }
    // Officer club-wide logistics
    if (isBoard && c.podTotal > 0) {
      const ship = daysAway(c.shippingDeadline)
      if (ship >= 0 && ship <= BANNER_WINDOW_DAYS)
        items.push({ competitionId: c.id, competitionName: c.name, kind: 'ship', date: c.shippingDeadline, daysAway: ship, detail: `${c.entries.filter((e) => e.channel === 'club_ship').length} club-ship entries · ~${c.podTotal} bottles` })
    }
  }
  return items.sort((a, b) => a.daysAway - b.daysAway)
}

function validComp(i: NewCompetitionInput): boolean {
  return !!(i.name?.trim() && i.homepageUrl?.trim() && i.registrationDeadline && i.shippingDeadline && i.bottlesRequired >= 1 && i.shippingAddress?.trim())
}

export async function addCompetition(input: NewCompetitionInput, addedById: string, deps: { db?: typeof prisma } = {}): Promise<CompResult> {
  const db = deps.db ?? prisma
  if (!validComp(input)) return { ok: false, reason: 'validation' }
  const c = await db.competition.create({ data: {
    name: input.name.trim(), homepageUrl: input.homepageUrl.trim(),
    registrationDeadline: input.registrationDeadline, shippingDeadline: input.shippingDeadline,
    bottlesRequired: input.bottlesRequired, shippingAddress: input.shippingAddress.trim(),
    dropoffAddress: input.dropoffAddress?.trim() || null, addedById,
  } })
  return { ok: true, id: c.id }
}

export async function editCompetition(id: string, patch: Partial<NewCompetitionInput>, actor: { memberId: string; isBoard: boolean }, deps: { db?: typeof prisma } = {}): Promise<MutResult> {
  const db = deps.db ?? prisma
  const c = await db.competition.findUnique({ where: { id } })
  if (!c) return { ok: false, reason: 'not_found' }
  if (!actor.isBoard && (c as any).addedById !== actor.memberId) return { ok: false, reason: 'forbidden' }
  await db.competition.update({ where: { id }, data: { ...patch } })
  return { ok: true }
}

export async function deleteCompetition(id: string, deps: { db?: typeof prisma } = {}): Promise<MutResult> {
  const db = deps.db ?? prisma
  const c = await db.competition.findUnique({ where: { id } })
  if (!c) return { ok: false, reason: 'not_found' }
  await db.competition.delete({ where: { id } }) // cascades entries
  return { ok: true }
}

export async function addEntry(competitionId: string, input: NewEntryInput, memberId: string, deps: { db?: typeof prisma } = {}): Promise<CompResult> {
  const db = deps.db ?? prisma
  if (!input.beerName?.trim() || !input.style?.trim()) return { ok: false, reason: 'validation' }
  const comp = await db.competition.findUnique({ where: { id: competitionId } })
  if (!comp) return { ok: false, reason: 'not_found' }
  const e = await db.compEntry.create({ data: { competitionId, memberId, beerName: input.beerName.trim(), style: input.style.trim(), channel: input.channel, registered: input.registered } })
  return { ok: true, id: e.id }
}

export async function editEntry(entryId: string, patch: Partial<NewEntryInput>, memberId: string, deps: { db?: typeof prisma } = {}): Promise<MutResult> {
  const db = deps.db ?? prisma
  const e = await db.compEntry.findUnique({ where: { id: entryId } })
  if (!e) return { ok: false, reason: 'not_found' }
  if ((e as any).memberId !== memberId) return { ok: false, reason: 'forbidden' }
  await db.compEntry.update({ where: { id: entryId }, data: { ...patch } })
  return { ok: true }
}

export async function deleteEntry(entryId: string, memberId: string, deps: { db?: typeof prisma } = {}): Promise<MutResult> {
  const db = deps.db ?? prisma
  const e = await db.compEntry.findUnique({ where: { id: entryId } })
  if (!e) return { ok: false, reason: 'not_found' }
  if ((e as any).memberId !== memberId) return { ok: false, reason: 'forbidden' }
  await db.compEntry.delete({ where: { id: entryId } })
  return { ok: true }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/competitions.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/competitions.ts src/lib/competitions.test.ts
git commit -m "feat(competitions): competitions logic module (queries, derived dates, banner, CRUD cores)"
```

---

### Task 3: Server actions `src/app/members/_actions/competition-actions.ts`

**Files:**
- Create: `src/app/members/_actions/competition-actions.ts`
- Test: `src/app/members/_actions/competition-actions.test.ts`

**Interfaces:**
- Consumes: `auth` from `@/lib/auth`; the competitions cores + types from `@/lib/competitions`; `revalidatePath` from `next/cache`.
- Produces server actions:
  ```ts
  export async function addCompetitionAction(input: NewCompetitionInput): Promise<CompResult>
  export async function editCompetitionAction(id: string, patch: Partial<NewCompetitionInput>): Promise<MutResult>
  export async function deleteCompetitionAction(id: string): Promise<MutResult>
  export async function addEntryAction(competitionId: string, input: NewEntryInput): Promise<CompResult>
  export async function editEntryAction(entryId: string, patch: Partial<NewEntryInput>): Promise<MutResult>
  export async function deleteEntryAction(entryId: string): Promise<MutResult>
  ```

- [ ] **Step 1: Write the failing test (gates are the load-bearing behavior)**

Create `src/app/members/_actions/competition-actions.test.ts`:

```ts
import { test, expect, vi, beforeEach } from 'vitest'

const authMock = vi.fn()
const core = {
  addCompetition: vi.fn(), editCompetition: vi.fn(), deleteCompetition: vi.fn(),
  addEntry: vi.fn(), editEntry: vi.fn(), deleteEntry: vi.fn(),
}
vi.mock('@/lib/auth', () => ({ auth: () => authMock(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: {} }))
vi.mock('@/lib/competitions', async (orig) => {
  const actual = await (orig as any)()
  return { ...actual, ...Object.fromEntries(Object.entries(core).map(([k, fn]) => [k, (...a: any[]) => (fn as any)(...a)])) }
})

beforeEach(() => { authMock.mockReset(); Object.values(core).forEach((f) => f.mockReset()) })

test('all actions reject a logged-out caller', async () => {
  authMock.mockResolvedValue(null)
  const a = await import('./competition-actions')
  await expect(a.addCompetitionAction({} as any)).rejects.toThrow('unauthorized')
  await expect(a.deleteCompetitionAction('x')).rejects.toThrow('unauthorized')
})

test('deleteCompetitionAction requires board', async () => {
  const a = await import('./competition-actions')
  authMock.mockResolvedValue({ user: { memberId: 'm1', isBoard: false } })
  await expect(a.deleteCompetitionAction('c1')).rejects.toThrow('forbidden')
  authMock.mockResolvedValue({ user: { memberId: 'm1', isBoard: true } })
  core.deleteCompetition.mockResolvedValue({ ok: true })
  expect(await a.deleteCompetitionAction('c1')).toEqual({ ok: true })
  expect(core.deleteCompetition).toHaveBeenCalledWith('c1')
})

test('editCompetitionAction passes actor {memberId,isBoard} to the core (core enforces adder-or-board)', async () => {
  const a = await import('./competition-actions')
  authMock.mockResolvedValue({ user: { memberId: 'm7', isBoard: false } })
  core.editCompetition.mockResolvedValue({ ok: true })
  await a.editCompetitionAction('c1', { name: 'X' })
  expect(core.editCompetition).toHaveBeenCalledWith('c1', { name: 'X' }, { memberId: 'm7', isBoard: false })
})

test('entry actions pass the caller memberId as owner (core enforces owner-only)', async () => {
  const a = await import('./competition-actions')
  authMock.mockResolvedValue({ user: { memberId: 'm3', isBoard: false } })
  core.addEntry.mockResolvedValue({ ok: true, id: 'e1' })
  core.editEntry.mockResolvedValue({ ok: true })
  core.deleteEntry.mockResolvedValue({ ok: true })
  await a.addEntryAction('c1', { beerName: 'B', style: 'S', channel: 'dropoff', registered: false })
  expect(core.addEntry).toHaveBeenCalledWith('c1', { beerName: 'B', style: 'S', channel: 'dropoff', registered: false }, 'm3')
  await a.editEntryAction('e1', { beerName: 'X' })
  expect(core.editEntry).toHaveBeenCalledWith('e1', { beerName: 'X' }, 'm3')
  await a.deleteEntryAction('e1')
  expect(core.deleteEntry).toHaveBeenCalledWith('e1', 'm3')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/members/_actions/competition-actions.test.ts`
Expected: FAIL — module not found / actions not exported.

- [ ] **Step 3: Implement the actions**

Create `src/app/members/_actions/competition-actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import {
  addCompetition, editCompetition, deleteCompetition, addEntry, editEntry, deleteEntry,
  type NewCompetitionInput, type NewEntryInput,
} from '@/lib/competitions'

async function requireMember() {
  const session = await auth()
  const memberId = session?.user?.memberId
  if (!memberId) throw new Error('unauthorized')
  return { memberId, isBoard: !!session!.user!.isBoard }
}
async function requireBoard() {
  const m = await requireMember()
  if (!m.isBoard) throw new Error('forbidden')
  return m
}
function revalidateComps() { revalidatePath('/members/competitions'); revalidatePath('/members') }

export async function addCompetitionAction(input: NewCompetitionInput) {
  const { memberId } = await requireMember()
  const r = await addCompetition(input, memberId)
  if (r.ok) revalidateComps()
  return r
}
export async function editCompetitionAction(id: string, patch: Partial<NewCompetitionInput>) {
  const { memberId, isBoard } = await requireMember()
  const r = await editCompetition(id, patch, { memberId, isBoard })
  if (r.ok) revalidateComps()
  return r
}
export async function deleteCompetitionAction(id: string) {
  await requireBoard()
  const r = await deleteCompetition(id)
  if (r.ok) revalidateComps()
  return r
}
export async function addEntryAction(competitionId: string, input: NewEntryInput) {
  const { memberId } = await requireMember()
  const r = await addEntry(competitionId, input, memberId)
  if (r.ok) revalidateComps()
  return r
}
export async function editEntryAction(entryId: string, patch: Partial<NewEntryInput>) {
  const { memberId } = await requireMember()
  const r = await editEntry(entryId, patch, memberId)
  if (r.ok) revalidateComps()
  return r
}
export async function deleteEntryAction(entryId: string) {
  const { memberId } = await requireMember()
  const r = await deleteEntry(entryId, memberId)
  if (r.ok) revalidateComps()
  return r
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/members/_actions/competition-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/members/_actions/competition-actions.ts src/app/members/_actions/competition-actions.test.ts
git commit -m "feat(competitions): permission-gated server actions"
```

---

## PHASE 2 — Member dashboard + nav

### Task 4: `AddCompetitionForm` + `CompetitionCard` client components

**Files:**
- Create: `src/components/members/AddCompetitionForm.tsx`
- Create: `src/components/members/CompetitionCard.tsx`

**Interfaces:**
- Consumes: `type MemberCompView, CompEntryView, EntryChannel, NewCompetitionInput, NewEntryInput`, `mapsUrl` from `@/lib/competitions`; the actions from `@/app/members/_actions/competition-actions`.
- Produces: `export function AddCompetitionForm()`, `export function CompetitionCard({ comp, viewerIsBoard, viewerId }: { comp: MemberCompView; viewerIsBoard: boolean; viewerId: string })`.

- [ ] **Step 1: Write `AddCompetitionForm.tsx`** (mirror `AddTitleForm` idiom: `'use client'`, `useState`+`useTransition`, date inputs → `new Date(value)`)

```tsx
'use client'
import { useState, useTransition } from 'react'
import { addCompetitionAction } from '@/app/members/_actions/competition-actions'

const EMPTY = { name: '', homepageUrl: '', registrationDeadline: '', shippingDeadline: '', bottlesRequired: 3, shippingAddress: '', dropoffAddress: '' }

export function AddCompetitionForm() {
  const [pending, start] = useTransition()
  const [f, setF] = useState({ ...EMPTY })
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  if (!open) return <button onClick={() => setOpen(true)} className="mb-6 border border-border px-4 py-1.5 rounded-full text-sm">Add a competition</button>

  return (
    <form className="rounded-2xl border border-border/50 bg-card-bg/20 p-6 mb-8 space-y-3"
      onSubmit={(e) => {
        e.preventDefault(); setErr(null)
        if (!f.name || !f.homepageUrl || !f.registrationDeadline || !f.shippingDeadline || !f.shippingAddress || Number(f.bottlesRequired) < 1) {
          setErr('Name, homepage, both deadlines, bottles (≥1), and a shipping address are required.'); return
        }
        start(async () => {
          const r = await addCompetitionAction({
            name: f.name, homepageUrl: f.homepageUrl,
            registrationDeadline: new Date(f.registrationDeadline), shippingDeadline: new Date(f.shippingDeadline),
            bottlesRequired: Number(f.bottlesRequired), shippingAddress: f.shippingAddress,
            dropoffAddress: f.dropoffAddress || null,
          })
          if (!r.ok) setErr('Could not add — check the fields.')
          else { setF({ ...EMPTY }); setOpen(false) }
        })
      }}>
      <input required placeholder="Competition name" value={f.name} onChange={set('name')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
      <input required placeholder="Homepage URL" value={f.homepageUrl} onChange={set('homepageUrl')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
      <label className="block text-xs text-foreground/50">Registration deadline
        <input required type="date" value={f.registrationDeadline} onChange={set('registrationDeadline')} className="mt-1 w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" /></label>
      <label className="block text-xs text-foreground/50">Shipping deadline
        <input required type="date" value={f.shippingDeadline} onChange={set('shippingDeadline')} className="mt-1 w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" /></label>
      <input required type="number" min={1} placeholder="Bottles required" value={f.bottlesRequired} onChange={set('bottlesRequired')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
      <input required placeholder="Shipping address" value={f.shippingAddress} onChange={set('shippingAddress')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
      <input placeholder="Drop-off address (optional)" value={f.dropoffAddress} onChange={set('dropoffAddress')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
      {err && <p className="text-sm text-red-400">{err}</p>}
      <div className="flex gap-2">
        <button disabled={pending} type="submit" className="bg-accent hover:bg-accent-hover text-background px-4 py-1.5 rounded-full text-sm disabled:opacity-50">Add</button>
        <button type="button" onClick={() => { setOpen(false); setErr(null) }} className="border border-border px-4 py-1.5 rounded-full text-sm">Cancel</button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Write `CompetitionCard.tsx`** (comp details + Maps links + the member's own entries with add/edit/delete + adder/board edit + board delete)

```tsx
'use client'
import { useState, useTransition } from 'react'
import type { MemberCompView, EntryChannel } from '@/lib/competitions'
import { mapsUrl } from '@/lib/competitions'
import { addEntryAction, editEntryAction, deleteEntryAction, deleteCompetitionAction } from '@/app/members/_actions/competition-actions'

const CHANNELS: { v: EntryChannel; label: string }[] = [
  { v: 'club_ship', label: 'Club ships it' }, { v: 'self_ship', label: 'I ship it myself' }, { v: 'dropoff', label: 'I drop it off' },
]
const iso = (d: Date) => new Date(d).toISOString().slice(0, 10)

export function CompetitionCard({ comp, viewerIsBoard, viewerId }: { comp: MemberCompView; viewerIsBoard: boolean; viewerId: string }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ beerName: '', style: '', channel: 'club_ship' as EntryChannel, registered: false })
  const canEditComp = viewerIsBoard || comp.addedById === viewerId
  const hasClubShip = comp.myEntries.some((e) => e.channel === 'club_ship')

  function run(fn: () => Promise<{ ok: boolean }>) { setErr(null); start(async () => { const r = await fn(); if (!r.ok) setErr('Action failed — refresh.') }) }

  return (
    <div className="rounded-2xl border border-border/50 bg-card-bg/30 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <a href={comp.homepageUrl} target="_blank" rel="noreferrer" className="font-semibold hover:text-accent">{comp.name}</a>
          <p className="text-foreground/50 text-sm mt-1">Register by {iso(comp.registrationDeadline)} · Ships by {iso(comp.shippingDeadline)} · {comp.bottlesRequired} bottles/entry</p>
          <p className="text-sm mt-1">
            <a href={mapsUrl(comp.shippingAddress)} target="_blank" rel="noreferrer" className="text-accent/80 hover:text-accent">Ship-to map</a>
            {comp.dropoffAddress && <> · <a href={mapsUrl(comp.dropoffAddress)} target="_blank" rel="noreferrer" className="text-accent/80 hover:text-accent">Drop-off map</a></>}
          </p>
          {hasClubShip && <p className="text-foreground/60 text-sm mt-1">Club-ship: commit by {iso(comp.commitByDate)}, deliver to shipper by {iso(comp.deliverByDate)}</p>}
        </div>
        {canEditComp && viewerIsBoard && (
          <button disabled={pending} onClick={() => { if (confirm(`Delete "${comp.name}" and all its entries?`)) run(() => deleteCompetitionAction(comp.id)) }}
            className="border border-red-500/40 text-red-400 px-3 py-1 rounded-full text-xs">Delete comp</button>
        )}
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium mb-2">Your entries</p>
        <ul className="space-y-2">
          {comp.myEntries.map((e) => (
            <li key={e.id} className="rounded-lg border border-border/40 bg-background/40 px-4 py-2 text-sm flex items-center justify-between gap-3 flex-wrap">
              <span>{e.beerName} · {e.style} · {CHANNELS.find((c) => c.v === e.channel)?.label} · {e.registered ? 'registered' : 'not registered'}</span>
              <span className="flex gap-2">
                <button disabled={pending} onClick={() => run(() => editEntryAction(e.id, { registered: !e.registered }))} className="border border-border px-2 py-0.5 rounded-full text-xs">{e.registered ? 'Mark unregistered' : 'Mark registered'}</button>
                <button disabled={pending} onClick={() => run(() => deleteEntryAction(e.id))} className="border border-red-500/40 text-red-400 px-2 py-0.5 rounded-full text-xs">Remove</button>
              </span>
            </li>
          ))}
        </ul>
        {adding ? (
          <div className="mt-2 space-y-2">
            <input placeholder="Beer name" value={draft.beerName} onChange={(e) => setDraft({ ...draft, beerName: e.target.value })} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
            <input placeholder="Style" value={draft.style} onChange={(e) => setDraft({ ...draft, style: e.target.value })} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
            <select value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value as EntryChannel })} className="rounded-lg border border-border bg-background/60 px-2 py-1 text-sm">
              {CHANNELS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.registered} onChange={(e) => setDraft({ ...draft, registered: e.target.checked })} /> Already registered</label>
            <div className="flex gap-2">
              <button disabled={pending || !draft.beerName || !draft.style} onClick={() => run(async () => { const r = await addEntryAction(comp.id, draft); if (r.ok) { setDraft({ beerName: '', style: '', channel: 'club_ship', registered: false }); setAdding(false) } return r })} className="bg-accent hover:bg-accent-hover text-background px-3 py-1 rounded-full text-sm disabled:opacity-50">Add entry</button>
              <button onClick={() => setAdding(false)} className="border border-border px-3 py-1 rounded-full text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <button disabled={pending} onClick={() => setAdding(true)} className="mt-2 border border-border px-3 py-1 rounded-full text-xs">Add entry</button>
        )}
      </div>
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/members/AddCompetitionForm.tsx src/components/members/CompetitionCard.tsx
git commit -m "feat(competitions): AddCompetitionForm + CompetitionCard client components"
```

---

### Task 5: `/members/competitions` page (member dashboard)

**Files:**
- Create: `src/app/members/competitions/page.tsx`

- [ ] **Step 1: Write the page** (auth-gated to logged-in member; renders member comps + add form + past toggle; officer section is Task 7 — leave a placeholder import commented out or render nothing for board yet)

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listMemberComps, listPastComps } from '@/lib/competitions'
import { AddCompetitionForm } from '@/components/members/AddCompetitionForm'
import { CompetitionCard } from '@/components/members/CompetitionCard'

export default async function CompetitionsPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  const memberId = session.user.memberId
  const isBoard = !!session.user.isBoard

  const comps = await listMemberComps(memberId)
  const past = await listPastComps()

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl font-bold">Competitions</h1>
      <p className="text-foreground/50 text-sm mt-1">Track the comps you&apos;ve entered and your beers. Officers coordinate club shipping.</p>

      <div className="mt-6"><AddCompetitionForm /></div>

      {comps.length === 0 ? (
        <p className="text-foreground/60">No active competitions. Add one above.</p>
      ) : (
        <div className="space-y-4">
          {comps.map((c) => <CompetitionCard key={c.id} comp={c} viewerIsBoard={isBoard} viewerId={memberId} />)}
        </div>
      )}

      {past.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-foreground/50 text-sm">Past competitions ({past.length})</summary>
          <ul className="mt-2 space-y-1 text-sm text-foreground/60">
            {past.map((p) => <li key={p.id}><a href={p.homepageUrl} target="_blank" rel="noreferrer" className="hover:text-accent">{p.name}</a> · shipped by {p.shippingDeadline.toISOString().slice(0, 10)}</li>)}
          </ul>
        </details>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build + route**

Run: `npm run build`
Expected: compiles; `/members/competitions` is a dynamic `ƒ` route.

- [ ] **Step 3: Commit**

```bash
git add src/app/members/competitions/page.tsx
git commit -m "feat(competitions): /members/competitions member dashboard page"
```

---

### Task 6: Nav links (SiteHeader + FeatureNav)

**Files:**
- Modify: `src/components/SiteHeader.tsx`
- Modify: `src/components/members/FeatureNav.tsx`
- Modify: `src/app/members/page.tsx` (FeatureNav already receives `isBoard` from the holdings work; just confirm — the Competitions card is NOT board-gated so no new prop needed)

- [ ] **Step 1: SiteHeader — add Competitions link** (all logged-in members; after Equipment, before the board-only Holdings link if present)

In `src/components/SiteHeader.tsx`, after the Equipment `<Link>`:
```tsx
              <Link href="/members/competitions" className="text-foreground/70 hover:text-foreground transition-colors">
                Competitions
              </Link>
```

- [ ] **Step 2: FeatureNav — add Competitions card** (visible to all; add to the `LIVE` array so it renders like Library/Equipment)

In `src/components/members/FeatureNav.tsx`, add to the `LIVE` array:
```tsx
  { name: 'Competitions', desc: 'Track comps you entered and coordinate shipping.', href: '/members/competitions' },
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; `/members` compiles.

- [ ] **Step 4: Commit**

```bash
git add src/components/SiteHeader.tsx src/components/members/FeatureNav.tsx
git commit -m "feat(competitions): Competitions nav link + hub card"
```

---

## PHASE 3 — Officer section

### Task 7: `OfficerCompetitions` component + wire into the page

**Files:**
- Create: `src/components/members/OfficerCompetitions.tsx`
- Modify: `src/app/members/competitions/page.tsx` (render the officer section when `isBoard`)

**Interfaces:**
- Consumes: `type OfficerCompView` + `listOfficerComps` from `@/lib/competitions`.
- Produces: `export function OfficerCompetitions({ comps }: { comps: OfficerCompView[] })`.

- [ ] **Step 1: Write `OfficerCompetitions.tsx`** (server component is fine — pure presentational, no interactivity)

```tsx
import type { OfficerCompView } from '@/lib/competitions'

const iso = (d: Date) => new Date(d).toISOString().slice(0, 10)

export function OfficerCompetitions({ comps }: { comps: OfficerCompView[] }) {
  if (comps.length === 0) return null
  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold">Club shipping (officers)</h2>
      <p className="text-foreground/50 text-sm mt-1">All entries across the club. Pod total = club-ship entries × bottles required.</p>
      <div className="mt-4 space-y-4">
        {comps.map((c) => (
          <div key={c.id} className="rounded-2xl border border-border/50 bg-card-bg/30 p-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="font-semibold">{c.name}</p>
              <span className="text-sm">Ships by {iso(c.shippingDeadline)} · <span className="text-accent">~{c.podTotal} bottles to pack</span></span>
            </div>
            <div className="mt-3">
              <p className="text-sm font-medium">Per member</p>
              <ul className="mt-1 text-sm text-foreground/70 space-y-0.5">
                {c.perMember.map((p) => (
                  <li key={p.memberId}>{p.memberName ?? 'Unknown member'} — {p.entryCount} entr{p.entryCount === 1 ? 'y' : 'ies'} ({p.clubShipCount} club-ship, {p.registeredCount} registered)</li>
                ))}
              </ul>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-foreground/50 text-sm">All entries ({c.entries.length})</summary>
              <ul className="mt-1 text-sm text-foreground/60 space-y-0.5">
                {c.entries.map((e) => (
                  <li key={e.id}>{e.memberName ?? 'Unknown'} — {e.beerName} ({e.style}) · {e.channel} · {e.registered ? 'registered' : 'not registered'}</li>
                ))}
              </ul>
            </details>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Wire into the page** — in `src/app/members/competitions/page.tsx`, add the import and render when board:

Add import:
```tsx
import { listOfficerComps } from '@/lib/competitions'
import { OfficerCompetitions } from '@/components/members/OfficerCompetitions'
```
After the past-comps `</details>` block, before the closing `</div>`:
```tsx
      {isBoard && <OfficerCompetitions comps={await listOfficerComps()} />}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: `/members/competitions` compiles as `ƒ`.

- [ ] **Step 4: Commit**

```bash
git add src/components/members/OfficerCompetitions.tsx src/app/members/competitions/page.tsx
git commit -m "feat(competitions): officer club-wide shipping section"
```

---

## PHASE 4 — Hub banner

### Task 8: `CompBanner` component

**Files:**
- Create: `src/components/members/CompBanner.tsx`

**Interfaces:**
- Consumes: `type BannerItem` from `@/lib/competitions`.
- Produces: `export function CompBanner({ items }: { items: BannerItem[] })`.

- [ ] **Step 1: Write it** (pure presentational; renders nothing when empty)

```tsx
import type { BannerItem } from '@/lib/competitions'

export function CompBanner({ items }: { items: BannerItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4 mb-8">
      <p className="text-sm font-medium text-accent mb-1">Competition deadlines</p>
      <ul className="text-sm text-foreground/80 space-y-0.5">
        {items.map((b, i) => (
          <li key={`${b.competitionId}-${b.kind}-${i}`}>
            <span className="font-medium">{b.competitionName}</span>: {b.detail} — {b.daysAway === 0 ? 'today' : `${b.daysAway} day${b.daysAway === 1 ? '' : 's'}`} ({b.date.toISOString().slice(0, 10)})
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/members/CompBanner.tsx
git commit -m "feat(competitions): CompBanner presentational component"
```

---

### Task 9: Wire the banner into the hub (`/members`)

**Files:**
- Modify: `src/app/members/page.tsx`

- [ ] **Step 1: Compute + render the banner** — in `src/app/members/page.tsx`, add imports:

```tsx
import { listOfficerComps, computeBannerItems } from '@/lib/competitions'
import { CompBanner } from '@/components/members/CompBanner'
```

The page already has `const session = await auth()` and `session.user.memberId`/`session.user.isBoard`. After computing `rec`/`cards`, compute the banner items (uses `listOfficerComps` for the full entry data; the compute function scopes what a non-board member sees to their own items):

```tsx
  const bannerItems = session.user.memberId
    ? computeBannerItems(await listOfficerComps(), session.user.memberId, !!session.user.isBoard, new Date())
    : []
```

Then render `<CompBanner items={bannerItems} />` inside the `<main>`, right after the welcome `<p>{email}</p>` block and before the membership card / FeatureNav.

Note: `listOfficerComps` returns full entry data including other members' beers, but `computeBannerItems` only emits a MEMBER's own items unless `isBoard` — a non-board member's banner never leaks another member's entries (the club-wide `ship` items are gated by `if (isBoard)`). Do NOT pass the officer data to the client; only the computed `BannerItem[]` (already scoped) is handed to `CompBanner`. Verify this in review.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: `/members` compiles as `ƒ`.

- [ ] **Step 3: Commit**

```bash
git add src/app/members/page.tsx
git commit -m "feat(competitions): live competition deadline banner on the hub"
```

---

## Final verification (after all tasks)

- `npx tsc --noEmit` clean
- `npx vitest run` green (existing 80 + competitions-logic + action-gate tests)
- `npm run build` compiles; `/members/competitions` is a dynamic `ƒ` route; `/members` still `ƒ`
- `npx eslint` on the new files — no new errors (pre-existing `any`/purity warnings allowed)
- **Deploy:** `prisma db push` (adds the two new additive models — non-destructive); redeploy. No new env var. Post-deploy smoke: add a comp; add entries with each channel; confirm a non-board member sees only their own entries + their own banner items; as board, confirm the officer section shows pod totals + per-member breakdown and the banner shows club-wide flags; confirm a member cannot edit another member's entry (server rejects); confirm past comps archive.

## Self-Review notes (privacy — the load-bearing concern)

The banner is computed server-side from `listOfficerComps` (which contains all entries), but ONLY the scoped `BannerItem[]` is passed to the client `CompBanner`. `computeBannerItems` emits a member's own entry items always, and club-wide `ship` items ONLY when `isBoard`. Task 9's review must confirm no raw officer data crosses to the client for non-board users. The officer section (Task 7) is board-gated at the page level (`{isBoard && ...}`) AND its data (`listOfficerComps`) is only fetched inside that gate — a non-board user's page never calls it (except the banner's scoped use). This is the privacy boundary to verify.
