# WCB Equipment Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Categorize lending equipment into fixed groups and render `/members/equipment` as grouped sections (instead of one flat list), with a board-editable subcategory dropdown and a one-time backfill of the 53 existing items.

**Architecture:** Add a nullable `subcategory` column to `LoanableItem`; a code-defined `EQUIPMENT_SUBCATEGORIES` const + a pure `groupBySubcategory` helper in the framework-free `lending.ts` drive both the board dropdown and the grouped browse order. The equipment page groups; the library page stays flat. Additive to the live lending feature — no change to checkout/return/renew/board-mutation logic.

**Tech Stack:** Next.js 16 (App Router, server components + actions) + React 19 + TypeScript, Prisma 6 + Postgres (Fly), Tailwind v4 (hand-rolled tokens), Vitest.

## Global Constraints

- **Branch:** `feat/equipment-grouping` (already created off `feat/lending-system`).
- **Additive only:** new nullable column + additive fields/exports. Do NOT change checkout/return/renew logic, the atomic claim, board-auth (`requireBoard`), or the books/library page.
- **Framework-free core:** `EQUIPMENT_SUBCATEGORIES` + `groupBySubcategory` live in `src/lib/lending.ts` — no next/next-auth/react imports there.
- **The 8 categories, in display order (Other LAST):** `Kegging & Serving`, `Fermentation`, `Measurement`, `Transfer & Hoses`, `Kettle & Hot-side`, `Bottling`, `Cleaning`, `Other`. `EQUIPMENT_SUBCATEGORIES` is the single source of truth for the dropdown AND the section order.
- **Grouping rules:** sections render in `EQUIPMENT_SUBCATEGORIES` order (not alpha, not input order); equipment with null or an unrecognized subcategory → "Other"; categories with 0 items → section omitted. `groupBySubcategory` is called ONLY by the equipment page (books stay flat).
- **Equipment only:** `subcategory` is nullable, ignored for books.
- **No Prisma enums:** `subcategory` is a plain `String?` (repo uses 0 enum blocks; the allowed values are the TS `EQUIPMENT_SUBCATEGORIES` array, not a DB enum).
- **Backfill:** a committed one-time script sets `subcategory` on the 53 existing titles by exact-title match (the approved mapping in the spec). Must NOT touch the 2 archived consumables (bottle caps, bungs) — leave them archived/untouched. Run post-deploy after `prisma db push`.
- **Styling:** house Tailwind idiom (`text-accent`, `bg-card-bg`, `border-border`, inputs `rounded-lg/xl border border-border bg-background/60`). No new deps.
- **Verification bar per task:** `npx tsc --noEmit` clean, `npx vitest run` green; the UI task also `npm run build`. Framework-free tests, DI'd fakes, mutation-resistant. Implementers run `npx prisma generate` after schema edits but SKIP `prisma db push` (no dev DB — controller/deploy applies it). Note the skip in the report.

---

### Task 1: Schema — `subcategory` column

**Files:** Modify `prisma/schema.prisma` (the `LoanableItem` model). No test (schema; verified by `prisma generate` + tsc).

**Interfaces produced:** `LoanableItem.subcategory String?`.

- [ ] **Step 1: Add the field** — in `prisma/schema.prisma`, inside `model LoanableItem`, after the `notes String?` line:

```prisma
  subcategory String?  // equipment group (one of EQUIPMENT_SUBCATEGORIES) or null
```

- [ ] **Step 2: Regenerate** — `npx prisma generate` (succeeds; `subcategory` on the client).
- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean.
- [ ] **Step 4:** SKIP `npx prisma db push` (no dev DB) — note in report.
- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(lending): subcategory column on LoanableItem"
```

---

### Task 2: `EQUIPMENT_SUBCATEGORIES` + thread `subcategory` through the lib

**Files:** Modify `src/lib/lending.ts`; Test `src/lib/lending.test.ts`.

**Interfaces produced:**
- `export const EQUIPMENT_SUBCATEGORIES = ['Kegging & Serving','Fermentation','Measurement','Transfer & Hoses','Kettle & Hot-side','Bottling','Cleaning','Other'] as const`
- `TitleView` gains `subcategory: string | null`; `listTitles` selects + returns it.
- `NewTitleInput` gains `subcategory?: string`; `addTitle` persists it; `editTitle`'s patch type already allows it (it's `Partial<Omit<NewTitleInput,'category'|'copies'|'initialCondition'>>`, so adding `subcategory` to `NewTitleInput` auto-includes it).

- [ ] **Step 1: Write the failing test** — append to `src/lib/lending.test.ts`:

```typescript
import { EQUIPMENT_SUBCATEGORIES } from './lending'

test('EQUIPMENT_SUBCATEGORIES: 8 categories, Other is last', () => {
  expect(EQUIPMENT_SUBCATEGORIES.length).toBe(8)
  expect(EQUIPMENT_SUBCATEGORIES[EQUIPMENT_SUBCATEGORIES.length - 1]).toBe('Other')
  expect(EQUIPMENT_SUBCATEGORIES[0]).toBe('Kegging & Serving')
})

test('listTitles: returns subcategory on each title', async () => {
  const rows = [{ id:'i1', category:'equipment', title:'CO2 regulator', description:null, author:null, isbn:null, notes:null, subcategory:'Kegging & Serving',
    copies:[{ id:'c1', status:'available', loans:[] }] }]
  const db = { loanableItem: { findMany: async () => rows } } as any
  const out = await listTitles('equipment', 'me', {}, { db })
  expect(out[0].subcategory).toBe('Kegging & Serving')
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/lending.test.ts` → FAIL (`EQUIPMENT_SUBCATEGORIES` missing; `subcategory` not on TitleView).

- [ ] **Step 3a: Add the const** near the top of `src/lib/lending.ts` (after the type aliases):

```typescript
export const EQUIPMENT_SUBCATEGORIES = [
  'Kegging & Serving', 'Fermentation', 'Measurement', 'Transfer & Hoses',
  'Kettle & Hot-side', 'Bottling', 'Cleaning', 'Other',
] as const
```

- [ ] **Step 3b: Extend `TitleView`** — add to the type:

```typescript
  subcategory: string | null
```

- [ ] **Step 3c: `listTitles` — return it.** The query uses `include` (whole row is fetched), so no `select` change needed; add `subcategory` to the pushed view object:

```typescript
      author: r.author, isbn: r.isbn, notes: r.notes, subcategory: r.subcategory ?? null,
```

- [ ] **Step 3d: `NewTitleInput` — add the field:**

```typescript
  subcategory?: string
```

- [ ] **Step 3e: `addTitle` — persist it** in the `loanableItem.create` `data`:

```typescript
      author: input.author ?? null, isbn: input.isbn ?? null, notes: input.notes ?? null, subcategory: input.subcategory ?? null, addedById,
```

(`editTitle` needs no change: its patch is `Partial<Omit<NewTitleInput,'category'|'copies'|'initialCondition'>>`, which now includes `subcategory`, and it spreads `patch` into the update.)

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/lending.test.ts` → new + all prior pass. `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lending.ts src/lib/lending.test.ts
git commit -m "feat(lending): EQUIPMENT_SUBCATEGORIES + thread subcategory through lib"
```

---

### Task 3: `groupBySubcategory` pure helper

**Files:** Modify `src/lib/lending.ts`; Test `src/lib/lending.test.ts`.

**Interfaces produced:** `export function groupBySubcategory(titles: TitleView[]): { subcategory: string; items: TitleView[] }[]`.

- [ ] **Step 1: Write the failing test** — append:

```typescript
import { groupBySubcategory } from './lending'

const T = (id: string, subcategory: string | null): any => ({ id, category:'equipment', title:id, description:null, author:null, isbn:null, notes:null, subcategory, availableCount:1, totalCount:1, myLoan:null, archivableCopyId:'c'+id })

test('groupBySubcategory: canonical order, empties dropped, null/unknown -> Other last', () => {
  const titles = [ T('a','Measurement'), T('b','Kegging & Serving'), T('c',null), T('d','ZzzUnknown'), T('e','Kegging & Serving') ]
  const groups = groupBySubcategory(titles)
  // order follows EQUIPMENT_SUBCATEGORIES, not input order; empty cats absent
  expect(groups.map(g => g.subcategory)).toEqual(['Kegging & Serving','Measurement','Other'])
  expect(groups[0].items.map(i => i.id)).toEqual(['b','e']) // both Kegging items
  // null AND unrecognized both land in Other
  expect(groups[2].items.map(i => i.id).sort()).toEqual(['c','d'])
})

test('groupBySubcategory: empty input -> empty array', () => {
  expect(groupBySubcategory([])).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails** — FAIL (`groupBySubcategory` missing).

- [ ] **Step 3: Implement** — append to `src/lib/lending.ts`:

```typescript
export function groupBySubcategory(
  titles: TitleView[],
): { subcategory: string; items: TitleView[] }[] {
  const known = new Set<string>(EQUIPMENT_SUBCATEGORIES)
  const buckets = new Map<string, TitleView[]>()
  for (const t of titles) {
    const key = t.subcategory && known.has(t.subcategory) ? t.subcategory : 'Other'
    const arr = buckets.get(key) ?? []
    arr.push(t)
    buckets.set(key, arr)
  }
  return EQUIPMENT_SUBCATEGORIES
    .map((cat) => ({ subcategory: cat, items: buckets.get(cat) ?? [] }))
    .filter((g) => g.items.length > 0)
}
```

- [ ] **Step 4: Run test to verify it passes** — PASS (both + prior). `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lending.ts src/lib/lending.test.ts
git commit -m "feat(lending): groupBySubcategory pure helper (canonical order, Other last)"
```

---

### Task 4: Grouped equipment page + subcategory dropdown (Add + Edit)

**Files:**
- Modify: `src/app/members/equipment/page.tsx` (group the render)
- Modify: `src/components/members/AddTitleForm.tsx` (subcategory select for equipment)
- Modify: `src/components/members/TitleCard.tsx` (subcategory select in the inline Edit block)
- (No unit test — presentational; logic is Task 2/3, verified by tsc + build.)

**Interfaces consumed:** `listTitles`, `groupBySubcategory`, `EQUIPMENT_SUBCATEGORIES`, `TitleView` from `@/lib/lending`; `addTitleAction`/`editTitleAction` (their payloads already accept `subcategory` via `NewTitleInput` from Task 2 — no action-file change needed).

- [ ] **Step 1: Group the equipment page.** In `src/app/members/equipment/page.tsx`, replace the flat `items.map(...)` grid with grouped sections. Current shape: `const items = await listTitles('equipment', session.user.memberId)` then a single `<div className="grid ...">{items.map(...)}</div>`. Change to:

```tsx
import { listTitles, groupBySubcategory } from '@/lib/lending'
// ...
  const items = await listTitles('equipment', session.user.memberId)
  const groups = groupBySubcategory(items)
// ...in the JSX where the grid was:
        {isBoard && <AddTitleForm category="equipment" />}
        {items.length === 0 ? (
          <p className="text-foreground/50">No equipment yet.</p>
        ) : (
          <div className="space-y-10">
            {groups.map((g) => (
              <section key={g.subcategory}>
                <p className="text-accent font-medium tracking-wide uppercase text-sm mb-4">{g.subcategory}</p>
                <div className="grid gap-4 md:grid-cols-2">
                  {g.items.map((i) => <TitleCard key={i.id} item={i} isBoard={isBoard} />)}
                </div>
              </section>
            ))}
          </div>
        )}
```

- [ ] **Step 2: AddTitleForm — subcategory select for equipment.** In `src/components/members/AddTitleForm.tsx`:
  - Import: `import { addTitleAction } from '@/app/members/_actions/lending-actions'` already there; add `import { EQUIPMENT_SUBCATEGORIES } from '@/lib/lending'`.
  - Extend `FormState` + `INITIAL` with `subcategory: string` defaulting to `'Other'`.
  - In the `addTitleAction({...})` payload, add: `subcategory: category === 'equipment' ? f.subcategory : undefined,`
  - Render (only for equipment, near the condition select):

```tsx
{category === 'equipment' && (
  <select value={f.subcategory} onChange={set('subcategory')} className="rounded-lg border border-border bg-background/60 px-2 py-1 text-sm">
    {EQUIPMENT_SUBCATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
  </select>
)}
```

- [ ] **Step 3: TitleCard Edit — subcategory select for equipment.** In `src/components/members/TitleCard.tsx`:
  - Add `import { EQUIPMENT_SUBCATEGORIES } from '@/lib/lending'` (alongside the existing lending imports).
  - The edit state `edit` (used in the `{isBoard && editing && (...)}` block) — add `subcategory: item.subcategory ?? 'Other'` to its initial value.
  - In `saveEdit`'s `editTitleAction(item.id, {...})` payload, include (equipment only): `...(isEquip ? { subcategory: edit.subcategory } : {}),`
  - Render inside the edit block, for equipment only:

```tsx
{isEquip && (
  <select value={edit.subcategory} onChange={e => setEdit({ ...edit, subcategory: e.target.value })} className="rounded-lg border border-border bg-background/60 px-2 py-1 text-sm">
    {EQUIPMENT_SUBCATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
  </select>
)}
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean; `npm run build` succeeds (`/members/equipment` still dynamic `ƒ`); `npx vitest run` all prior green; `npx eslint` on the 3 touched files clean (no new `any` — the edit-state additions are typed strings).

- [ ] **Step 5: Commit**

```bash
git add src/app/members/equipment/page.tsx src/components/members/AddTitleForm.tsx src/components/members/TitleCard.tsx
git commit -m "feat(lending): grouped equipment browse + subcategory dropdown (add/edit)"
```

---

### Task 5: One-time backfill script (53-item mapping)

**Files:**
- Create: `scripts/backfill-equipment-subcategory.mjs`
- Test: `scripts/backfill-equipment-subcategory.test.ts` (a coverage test on the mapping — NOT a live-DB test)

**Interfaces produced:** a runnable script + an exported `MAPPING` object it uses, so the test can assert coverage without a DB.

- [ ] **Step 1: Write the failing test** — `scripts/backfill-equipment-subcategory.test.ts`. It imports the mapping and asserts it covers exactly the 53 titles, every value is a valid category, no title is in two categories:

```typescript
import { test, expect } from 'vitest'
import { MAPPING } from './backfill-equipment-subcategory.mjs'
import { EQUIPMENT_SUBCATEGORIES } from '../src/lib/lending'

test('backfill MAPPING: 53 titles, all values valid categories, no dupes', () => {
  const entries = Object.entries(MAPPING)
  expect(entries.length).toBe(53)
  const known = new Set<string>(EQUIPMENT_SUBCATEGORIES)
  for (const [title, cat] of entries) {
    expect(known.has(cat as string)).toBe(true) // every category is valid
    expect(typeof title).toBe('string')
  }
  // no title appears twice (object keys already dedupe, but assert count of unique keys)
  expect(new Set(Object.keys(MAPPING)).size).toBe(53)
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run scripts/backfill-equipment-subcategory.test.ts` → FAIL (module missing). (Ensure vitest config includes `scripts/**/*.test.ts`; if the existing `vitest.config.ts` only globs `src/**`, add `scripts/**/*.test.ts` to `include`.)

- [ ] **Step 3: Write the script + mapping** — `scripts/backfill-equipment-subcategory.mjs`. Export `MAPPING` (title → category, the approved 53 from the spec) and a `main()` that, for each mapped title, sets `subcategory` via exact-title match on category=equipment. Idempotent; touches only mapped titles (never the archived consumables, which aren't in MAPPING):

```javascript
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

export const MAPPING = {
  // Kegging & Serving
  'Ball-lock gas & beer connector (set)':'Kegging & Serving','2-way CO2 manifold':'Kegging & Serving','4-way CO2 manifold':'Kegging & Serving','CO2 regulator':'Kegging & Serving','CO2 regulator for sixtel':'Kegging & Serving','Kegco tap':'Kegging & Serving','Perlick tap':'Kegging & Serving','Sixtel tap':'Kegging & Serving','Tap (unknown brand)':'Kegging & Serving','Pin-lock beer keg connector':'Kegging & Serving','Pin-lock gas keg connector':'Kegging & Serving','3" shank':'Kegging & Serving','8" shank':'Kegging & Serving',"Bev-lex serving line 18' (3/16 ID x 7/16 OD)":'Kegging & Serving',"Bev-lex serving line 25' (3/16 ID x 7/16 OD)":'Kegging & Serving',
  // Fermentation
  'Airlock':'Fermentation','6.5 gal bucket':'Fermentation','Glass carboy neck transport handle':'Fermentation','Carboy carrier':'Fermentation','1/2" plug-in heat belt':'Fermentation','Johnson Controls temp chamber controller':'Fermentation','BIAB bag':'Fermentation',
  // Measurement
  'Thin glass thermometer':'Measurement','12" clip-on thermometer':'Measurement','12" thermometer':'Measurement','9" thermometer w/ clip':'Measurement','Hydrometer':'Measurement','Refractometer':'Measurement','Digital scale (0.5g / 0.01oz)':'Measurement','1000mL flask':'Measurement',
  // Transfer & Hoses
  "Bev-lex PVC tubing 9' (5/16 ID x 9/16 OD, red)":'Transfer & Hoses',"Braided PVC hose 3' (1/2\" ID, garden hose conn)":'Transfer & Hoses',"Braided PVC hose 7' (1/2\" ID, garden hose conn)":'Transfer & Hoses',"Braided PVC hose 8' (1/2\" ID, cam locks)":'Transfer & Hoses','Brass garden hose fitting w/ quick conn':'Transfer & Hoses','Syphon':'Transfer & Hoses','Glass wine thief':'Transfer & Hoses','17" turkey baster (wine thief)':'Transfer & Hoses','Small 4" funnel':'Transfer & Hoses','1/2" ball valve':'Transfer & Hoses','1/2" 3-piece ball valve':'Transfer & Hoses','1/2" steel ball-lock valve':'Transfer & Hoses','3/8" brass ball-lock valve':'Transfer & Hoses',
  // Kettle & Hot-side
  '36" wooden mash paddle':'Kettle & Hot-side','24" plastic mash paddle':'Kettle & Hot-side','21" metal spoon':'Kettle & Hot-side','Hop spider holder for kettle':'Kettle & Hot-side','Plastic grain scoop':'Kettle & Hot-side',
  // Bottling
  'Bottle capper':'Bottling','Spring-loaded bottle filler':'Bottling','Counter-pressure bottle filler':'Bottling',
  // Cleaning
  'Carboy brush':'Cleaning',
  // Other
  '120mm PC fan':'Other',
}

async function main() {
  let set = 0, missing = []
  for (const [title, subcategory] of Object.entries(MAPPING)) {
    const item = await prisma.loanableItem.findFirst({ where: { category: 'equipment', title } })
    if (!item) { missing.push(title); continue }
    await prisma.loanableItem.update({ where: { id: item.id }, data: { subcategory } })
    set++
  }
  console.log(`backfilled ${set}/${Object.keys(MAPPING).length}; missing: ${missing.length ? missing.join(', ') : 'none'}`)
  await prisma.$disconnect()
}

// run only when invoked directly, not when imported by the test
if (import.meta.url === `file://${process.argv[1]}`) main()
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run scripts/backfill-equipment-subcategory.test.ts` → PASS (53, all valid, no dupes). `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit** (do NOT run the script here — it needs the prod DB; it runs at deploy)

```bash
git add scripts/backfill-equipment-subcategory.mjs scripts/backfill-equipment-subcategory.test.ts vitest.config.ts
git commit -m "feat(lending): equipment subcategory backfill script + coverage test"
```

---

## Post-plan notes

- **Deploy sequence (controller/operator, after merge):** `prisma db push` (adds the `subcategory` column) → deploy the branch → run `node scripts/backfill-equipment-subcategory.mjs` against prod (with `DATABASE_URL` pointed at the public Fly host) → eyeball `/members/equipment` shows the 8 sections in order with the right items. The committed `prisma generate` on build covers the client.
- **No new env vars, no new deps.** Reuses everything.
- **The 2 archived consumables** (bottle caps, bungs) are intentionally absent from MAPPING — the backfill never touches them; they stay archived for the future store.
- **Books/library untouched** — `groupBySubcategory` is called only by the equipment page.
