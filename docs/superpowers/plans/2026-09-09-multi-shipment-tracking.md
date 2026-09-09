# Multiple Tracking Numbers Per Competition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a competition's club shipment span multiple packages, each with its own carrier + tracking number + delivery status, instead of a single (carrier, tracking) pair inlined on the Competition row.

**Architecture:** Replace the four inline shipment columns on `Competition` with a related `Shipment` model (one row per package). The member/officer competition view keeps its existing `shippedAt` / `deliveryStatus` / `deliveredAt` fields — now DERIVED (rolled up) from the packages — plus a new `shipments[]` array so the UI can list each package. The daily 17track poller iterates `Shipment` rows instead of Competitions. All per-package building blocks (`trackingUrl`, `seventeentrack.ts` register/getTracking, the UPS guard, the cron route wrapper) are already carrier-parameterized and need no change.

**Tech Stack:** Next.js App Router, TypeScript, Prisma (`db push`, NOT migrate), Vitest, 17track, Vercel + Fly Postgres.

**Spec:** In-chat bounded/architectural design approved 2026-09-09. Rollup rule: comp is `delivered` only when ALL packages delivered; `exception` if any in exception; else `in_transit` if any moving; else null. `shippedAt` = earliest package shippedAt. `deliveredAt` = latest package deliveredAt (once all delivered). Per-package carrier (packages may use different carriers).

## Global Constraints

- Prisma `db push`, never `migrate`. Prod push coordinated separately (Fly tunnel) — implementers do LOCAL `db push` only against the dev DB, never prod.
- TDD: failing test first, watch it fail, minimal code to green. Vitest. Full suite must stay green (baseline 564).
- `npx tsc --noEmit` must be 0 errors; `npx next build` must compile.
- Delivery status normalized strings: `'in_transit' | 'delivered' | 'exception' | null`. Never write a false `'delivered'`.
- Poller stays fail-closed: `getTracking` returns null on any error → advance only `lastTrackedAt`, leave `deliveryStatus` untouched.
- 17track registration is fail-soft (never blocks a save) and quota-safe (register only a NEW/CHANGED UPS number, never on clear/unchanged/non-UPS).
- USPS is intentionally excluded from `trackingUrl` (mailing alcohol via USPS is illegal). Do not add it.
- Commit only files each task touches via explicit `git add` (never `-A`).
- The cron route `src/app/api/cron/track-shipments/route.ts` calls `pollShipments()` and returns its `{ checked, updated, delivered }` shape — that return shape MUST be preserved so the route needs no change.

---

### Task 1: Schema — add `Shipment` model, backfill, drop inline columns

**Files:**
- Modify: `prisma/schema.prisma` (Competition model ~160-183)
- Create: `scripts/backfill-shipments.ts` (one-time backfill run BEFORE the columns drop)

**Interfaces:**
- Produces: Prisma `Shipment` model with fields `{ id, competitionId, carrier: String, tracking: String, shippedAt: DateTime @default(now()), deliveryStatus: String?, deliveredAt: DateTime?, lastTrackedAt: DateTime?, createdAt: DateTime @default(now()) }`, relation `competition Competition @relation(fields:[competitionId], references:[id], onDelete: Cascade)`, `@@index([competitionId])`. `Competition` gains `shipments Shipment[]` and LOSES `shipmentCarrier`, `shipmentTracking`, `shippedAt`, `deliveryStatus`, `deliveredAt`, `lastTrackedAt`.

- [ ] **Step 1: Add the `Shipment` model + relation, keep the old columns FOR NOW**

Add to `prisma/schema.prisma`:

```prisma
model Shipment {
  id             String      @id @default(cuid())
  competitionId  String
  competition    Competition @relation(fields: [competitionId], references: [id], onDelete: Cascade)
  carrier        String
  tracking       String
  shippedAt      DateTime    @default(now())
  deliveryStatus String?     // 'in_transit' | 'delivered' | 'exception' | null
  deliveredAt    DateTime?
  lastTrackedAt  DateTime?
  createdAt      DateTime    @default(now())
  @@index([competitionId])
}
```

Add `shipments Shipment[]` to the `Competition` model (leave the six inline shipment columns in place for this step so the backfill can read them).

- [ ] **Step 2: (deferred) DB push happens later, not in this task**

DO NOT run `prisma db push`. There is no local dev DB in this environment; the
only `DATABASE_URL` points at prod, and the controller will run the additive
push + backfill + column-drop push against prod as ONE coordinated supervised
step AFTER the whole branch is built and reviewed. Your job in this task is the
schema edit + backfill SCRIPT + `prisma generate` (which reads the schema file
only and needs no DB). Note this deferral in your report and move on.

- [ ] **Step 3: Write the backfill script**

Create `scripts/backfill-shipments.ts`. For every Competition with a non-null `shipmentTracking`, create ONE `Shipment` row copying `carrier ← shipmentCarrier ?? 'UPS'`, `tracking ← shipmentTracking`, `shippedAt ← shippedAt ?? createdAt`, `deliveryStatus ← deliveryStatus`, `deliveredAt ← deliveredAt`, `lastTrackedAt ← lastTrackedAt`. Idempotent: skip a competition that already has any `shipments`. Log a count.

```ts
import { prisma } from '@/lib/db'

async function main() {
  const comps = (await prisma.competition.findMany({
    include: { shipments: true },
  })) as any[]
  let created = 0
  for (const c of comps) {
    if (c.shipments.length > 0) continue
    if (!c.shipmentTracking) continue
    await prisma.shipment.create({
      data: {
        competitionId: c.id,
        carrier: c.shipmentCarrier ?? 'UPS',
        tracking: c.shipmentTracking,
        shippedAt: c.shippedAt ?? c.createdAt,
        deliveryStatus: c.deliveryStatus ?? null,
        deliveredAt: c.deliveredAt ?? null,
        lastTrackedAt: c.lastTrackedAt ?? null,
      },
    })
    created++
  }
  console.log(`Backfilled ${created} shipment(s) from ${comps.length} competition(s).`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 4: (deferred) Backfill EXECUTION happens later, not in this task**

DO NOT run the backfill script. Its execution is part of the controller's
coordinated prod step. Just make sure the script is syntactically valid and
type-correct (it will be typechecked with the rest of the tree). Move on.

- [ ] **Step 5: Remove the six inline shipment columns from `Competition`**

Delete `shipmentCarrier`, `shipmentTracking`, `shippedAt`, `deliveryStatus`, `deliveredAt`, `lastTrackedAt` from the `Competition` model. Keep the `// Club shipment tracking` comment block updated to point at the `Shipment` model.

- [ ] **Step 6: (deferred) Column-drop push happens later, not in this task**

DO NOT run `prisma db push`. The column drop against prod is the final,
supervised part of the controller's coordinated step, run only AFTER the
backfill has copied the data into `Shipment`. Leave the schema edited (columns
removed from `schema.prisma`) so the generated client + tsc reflect the target
shape; just don't push it.

- [ ] **Step 7: Regenerate the client + verify tsc sees the new shape**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: `tsc` will now FAIL in `competitions.ts` / `poll-shipments.ts` (they still read the dropped columns). That is EXPECTED at this task boundary — those are fixed in Tasks 2-4. Record the failing files in the report; do NOT fix them here. (This task's deliverable is the schema + backfill only.)

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma scripts/backfill-shipments.ts
git commit -m "feat(comps): add Shipment model + backfill; drop inline shipment columns"
```

---

### Task 2: Poller — iterate `Shipment` rows per package

**Files:**
- Modify: `src/lib/shipping/poll-shipments.ts`
- Test: `src/lib/shipping/poll-shipments.test.ts`

**Interfaces:**
- Consumes: Prisma `Shipment` model (Task 1). `getTracking(tracking, UPS_CARRIER, undefined)` and `UPS_CARRIER` from `./seventeentrack` (unchanged).
- Produces: `pollShipments(deps)` — SAME return shape `{ checked: number; updated: number; delivered: number }`. Now queries `db.shipment.findMany` and calls `db.shipment.update`.

- [ ] **Step 1: Rewrite the tests to use `shipment` rows**

Update `poll-shipments.test.ts`: the `fakeDb` now exposes `shipment: { findMany, update }` (not `competition`). Fixtures are shipment rows `{ id, carrier, tracking, deliveryStatus }`. Assertions: `where.tracking === { not: null }` is dropped in favor of `where` selecting not-delivered shipments (`OR: [{ deliveryStatus: null }, { deliveryStatus: { not: 'delivered' } }]`); the UPS in-memory guard now reads `carrier`; delivered/in-transit/null/empty/non-UPS cases all assert against `db.shipment.update`. Keep the NOW constant and the exact same `{ checked, updated, delivered }` count assertions. Preserve the never-polled-NULL-inclusive-OR test (it's a correctness invariant).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/shipping/poll-shipments.test.ts`
Expected: FAIL (poller still queries `competition`).

- [ ] **Step 3: Rewrite `pollShipments` to iterate shipments**

Query `db.shipment.findMany({ where: { OR: [{ deliveryStatus: null }, { deliveryStatus: { not: 'delivered' } }] }, select: { id: true, carrier: true, tracking: true, deliveryStatus: true } })`. For each: skip if `!isUps(s.carrier) || !s.tracking`; else `checked++`, call `getTracking(s.tracking, UPS_CARRIER, undefined)`, and `db.shipment.update({ where: { id: s.id }, data })` exactly as before (null → only `lastTrackedAt`; delivered → `deliveryStatus + deliveredAt + lastTrackedAt`, `delivered++`; else `deliveryStatus + lastTrackedAt`, `updated++`). Keep the `isUps` helper and fail-closed comment. Return shape unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/shipping/poll-shipments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shipping/poll-shipments.ts src/lib/shipping/poll-shipments.test.ts
git commit -m "feat(comps): poll delivery per Shipment row"
```

---

### Task 3: View rollup + shipment CRUD in `competitions.ts`

**Files:**
- Modify: `src/lib/competitions.ts` (`CompetitionView` type ~10-17, `toCompView` ~41-50, the three `competition.findMany`/`findUnique` fetches at ~75/94/101, `setShipmentTracking` ~187-211)
- Test: `src/lib/competitions.test.ts`

**Interfaces:**
- Consumes: `Shipment` model (Task 1). `registerTracking`, `UPS_CARRIER` from seventeentrack (unchanged). `isUpsCarrier` helper already in this file.
- Produces:
  - `type ShipmentView = { id: string; carrier: string; tracking: string; shippedAt: Date; deliveryStatus: DeliveryStatus | null; deliveredAt: Date | null; trackingUrl: string | null }`.
  - `CompetitionView` KEEPS `shippedAt: Date | null`, `deliveryStatus: DeliveryStatus | null`, `deliveredAt: Date | null` (now DERIVED) and GAINS `shipments: ShipmentView[]`. REMOVES `shipmentCarrier` / `shipmentTracking` (single fields) from the view.
  - `rollupShipments(shipments): { shippedAt, deliveryStatus, deliveredAt }` — pure exported helper.
  - Shipment mutators: `addShipment(compId, carrier, tracking, deps)`, `editShipment(shipmentId, carrier, tracking, deps)`, `deleteShipment(shipmentId, deps)` returning `MutResult`. `setShipmentTracking` is REMOVED (replaced by these). Each add/edit registers a new/changed UPS number with 17track (fail-soft, quota-safe).

- [ ] **Step 1: Write failing tests for `rollupShipments`**

In `competitions.test.ts`, add a `describe('rollupShipments')`:
- empty `[]` → `{ shippedAt: null, deliveryStatus: null, deliveredAt: null }`.
- all delivered → `deliveryStatus: 'delivered'`, `deliveredAt` = the LATEST package `deliveredAt`, `shippedAt` = earliest.
- one delivered + one in_transit → `deliveryStatus: 'in_transit'`, `deliveredAt: null`.
- any exception (e.g. one exception + one delivered) → `deliveryStatus: 'exception'`.
- one in_transit + one null-status → `deliveryStatus: 'in_transit'`.
- all null-status → `deliveryStatus: null`; `shippedAt` = earliest package shippedAt.

Precedence to encode: **exception > (not-all-delivered) > all-delivered**. Concretely: if ANY status is `'exception'` → `'exception'`; else if EVERY package status is `'delivered'` → `'delivered'` (with `deliveredAt` = max); else if ANY status is `'in_transit'` OR `'delivered'` → `'in_transit'`; else `null`. `shippedAt` = min of package `shippedAt` (null if empty).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/competitions.test.ts -t rollupShipments`
Expected: FAIL (function not defined).

- [ ] **Step 3: Implement `rollupShipments` + wire into `toCompView`**

Add the exported `rollupShipments` per the precedence above. In `toCompView`, map `c.shipments ?? []` into `ShipmentView[]` (compute each `trackingUrl` via the existing `trackingUrl(carrier, tracking)`), sort by `shippedAt` ascending for stable display, then set the view's derived `shippedAt`/`deliveryStatus`/`deliveredAt` from `rollupShipments(shipments)`. Remove `shipmentCarrier`/`shipmentTracking` from the returned view object.

- [ ] **Step 4: Add `include: { shipments: true }` to the fetches**

The three fetches that build views (upcoming member ~75, past ~94, officer ~101) must `include: { entries: true, shipments: true }` (past-comps fetch currently has no include — add `include: { shipments: true }`). Verify past comps still show shipment status.

- [ ] **Step 5: Write failing tests for the shipment mutators**

Add tests for `addShipment` / `editShipment` / `deleteShipment` using a fake db exposing `competition.findUnique` (for compId existence on add) and `shipment.{create,findUnique,update,delete}`. Assert: add creates a `Shipment` row (carrier+tracking trimmed, empty → validation/no-op), and registers a UPS number via an injected `registerTracking` spy (called once for UPS, NOT for FedEx); edit updates and re-registers only when the tracking string CHANGED and is UPS; delete removes the row. Not-found → `{ ok: false, reason: 'not_found' }`.

- [ ] **Step 6: Run to verify they fail**

Run: `npx vitest run src/lib/competitions.test.ts -t Shipment`
Expected: FAIL.

- [ ] **Step 7: Implement the mutators, remove `setShipmentTracking`**

Implement `addShipment`, `editShipment`, `deleteShipment` with the DI `{ db?, now?, registerTracking? }` shape `setShipmentTracking` used. Preserve fail-soft `.catch(() => {})` on register and the quota-safe changed+UPS gate. Delete the old `setShipmentTracking` export.

- [ ] **Step 8: Run the file's tests + full suite**

Run: `npx vitest run src/lib/competitions.test.ts` then `npx vitest run`
Expected: PASS; full suite green (minus the action/UI callers fixed in Task 4 — if the suite has no failing refs yet, all green).

- [ ] **Step 9: Commit**

```bash
git add src/lib/competitions.ts src/lib/competitions.test.ts
git commit -m "feat(comps): derive shipment rollup + per-package add/edit/delete"
```

---

### Task 4: Server actions + CompetitionCard UI

**Files:**
- Modify: `src/app/members/_actions/competition-actions.ts` (`setShipmentTrackingAction` ~42-47)
- Modify: `src/components/members/CompetitionCard.tsx` (import ~4-6, ship draft state ~38, shipment status block ~136-181)

**Interfaces:**
- Consumes: `addShipment`, `editShipment`, `deleteShipment`, `ShipmentView`, `trackingUrl` from `competitions.ts` (Task 3). `MemberCompView.shipments: ShipmentView[]`.
- Produces: `addShipmentAction(compId, carrier, tracking)`, `editShipmentAction(shipmentId, carrier, tracking)`, `deleteShipmentAction(shipmentId)` — each `requireBoard()` + `revalidateComps()` on ok. `setShipmentTrackingAction` removed.

- [ ] **Step 1: Replace the action**

Remove `setShipmentTrackingAction`; add the three board-gated actions above (mirror the existing pattern: `await requireBoard(); const r = await addShipment(...); if (r.ok) revalidateComps(); return r`). Update the import from `competitions.ts` accordingly.

- [ ] **Step 2: Rewrite the CompetitionCard shipment block**

Replace the single carrier+tracking line/form with a per-package list. For each `comp.shipments`: show `carrier · <tracking link via s.trackingUrl or mono text> · <its status>` reusing the existing delivered/in-transit/exception rendering per package. The comp-level derived `deliveryStatus`/`deliveredAt`/`shippedAt` still drives the top-line summary (e.g. "Delivered <date>" once all delivered, "Shipped <date>" once any shipped) — keep that summary, then list packages beneath. Board controls: an "Add package" form (carrier + tracking inputs → `addShipmentAction`), and per-package "Edit"/"Remove" (→ `editShipmentAction` / `deleteShipmentAction`). Keep `useTransition`/`run` wiring and System-B styling. When `comp.shipments` is empty and viewer is board, show the "Add package" affordance; when empty and not board, render nothing (unchanged behavior).

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: 0 tsc errors; `/members/*` competition pages compile.

- [ ] **Step 4: Full suite**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/app/members/_actions/competition-actions.ts src/components/members/CompetitionCard.tsx
git commit -m "feat(comps): multi-package shipment UI + actions"
```

---

## Post-implementation (controller-run, NOT a task)

- Whole-branch review on the most capable model.
- Prod DB step (supervised, WITH Jordan — no local dev DB exists, prod is the only target). Run against prod via the Fly tunnel with `.env` moved aside (wcb-shipment-delivery-tracking pattern), IN THIS ORDER so no data is lost:
  1. Temporarily re-add the six inline columns to `schema.prisma` alongside the `Shipment` model → `prisma db push` (additive: creates `Shipment`, keeps inline cols) → so the backfill can read the old cols on prod.
  2. Run `scripts/backfill-shipments.ts` against prod → copies each comp's inline tracking into a `Shipment` row.
  3. Restore the final `schema.prisma` (inline cols removed) → `prisma db push` (drops the six columns).
  Alternatively, if prod currently has ≤1 tracked comp, a simpler one-shot is acceptable — decide with Jordan at the time based on prod's actual data. Then merge + deploy.
- Backlog (Jordan, 2026-09-09): add a per-comp opt-in PayPal contribution ($10–20) when a member joins a competition. Separate feature, deferred. Record in docs/MEMBERSHIP_BACKLOG.md.
