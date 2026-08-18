# Shipment Delivery Auto-Detect (17track) + Reminder Suppression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Auto-detect competition club-shipment delivery via the 17track API (daily cron) so the card shows "Delivered {date}", and stop the "deliver your bottles" / "ship" reminders once a shipment is shipped.

**Architecture:** A pure status mapper + a thin fail-closed 17track client (`src/lib/shipping/seventeentrack.ts`); a DI poll orchestrator (`poll-shipments.ts`); a cron route copying the existing `sync-artifacts` pattern; register-on-set wired into `setShipmentTracking`; banner suppression + new fields in `competitions.ts`; and a card display update. Design doc: `docs/superpowers/specs/2026-08-18-ups-delivery-tracking-design.md`.

**Tech Stack:** Next.js 16, Prisma 6, Vitest, native `fetch`. No new deps.

## Global Constraints

- **Fail-closed:** any 17track auth/network/parse failure, or a `rejected` number, → `getTracking` returns `null` → caller leaves status unchanged (only `lastTrackedAt` advances). The cron never throws on one bad shipment; it returns 200 with counts.
- **Never false-positive "delivered":** unknown/unmapped `package_status` maps to `in_transit`. Only an explicit `Delivered` sets `deliveryStatus='delivered'`.
- **Quota-safe:** 17track's free 200 is consumed only by `POST /register` (one per NEW tracking number). Polling (`/gettrackinfo`) is quota-free. Register only when the UPS tracking number is newly set/changed; never on unchanged saves.
- **17track API (confirmed):** base `https://api.17track.net/track/v2.4`; header `17token: <SEVENTEENTRACK_API_KEY>`; `POST /register` and `POST /gettrackinfo` with body `[{ "number": "<t>", "carrier": 100002 }]`; envelope `{ code, data: { accepted:[...], rejected:[...] } }`; status field `package_status` ∈ `NotFound|InfoReceived|InTransit|Expired|AvailableForPickup|OutForDelivery|DeliveryFailure|Delivered|Exception`. UPS carrier code `100002`.
- **No migrations:** schema changes via `prisma db push` + `prisma generate` (house convention). DB push happens only in the final live task.
- **Board-gating / audience / existing shipment fields unchanged.** This feature only adds delivery read-state + suppression.
- Env key already in `.env` (`SEVENTEENTRACK_API_KEY`, gitignored). Vercel env is the user's manual step (final task).

---

## Task 1: Verify the 17track payload shape + pure status mapper

**Files:** Create `src/lib/shipping/seventeentrack.ts`; Test `src/lib/shipping/seventeentrack.test.ts`.

**Interfaces:**
- Produces: `type DeliveryStatus = 'in_transit' | 'delivered' | 'exception'`; `const UPS_CARRIER = 100002`; `function mapPackageStatus(raw: string): DeliveryStatus`.

- [ ] **Step 0 (verification, no code):** Confirm the real `/gettrackinfo` response shape before writing the parser. If a real tracking number + the key are available, note the exact JSON path to `package_status` and to the delivered timestamp inside `data.accepted[0].track_info` (17track v2.4 nests the latest status under `track_info.latest_status.status` and time under `track_info.latest_event.time_iso` or similar — VERIFY and record the exact paths as a comment in the module). If a live call isn't possible in this task, proceed with the documented shape and leave a `// VERIFY:` comment at each nested access; Task 2's tests use captured/representative envelopes.

- [ ] **Step 1: Write the failing test** (`seventeentrack.test.ts`):

```ts
import { describe, it, expect } from 'vitest'
import { mapPackageStatus, UPS_CARRIER } from './seventeentrack'

describe('mapPackageStatus', () => {
  it('maps Delivered to delivered', () => {
    expect(mapPackageStatus('Delivered')).toBe('delivered')
  })
  it('maps failure/exception/expired to exception', () => {
    expect(mapPackageStatus('Exception')).toBe('exception')
    expect(mapPackageStatus('DeliveryFailure')).toBe('exception')
    expect(mapPackageStatus('Expired')).toBe('exception')
  })
  it('maps all in-transit-ish statuses to in_transit', () => {
    for (const s of ['NotFound', 'InfoReceived', 'InTransit', 'AvailableForPickup', 'OutForDelivery']) {
      expect(mapPackageStatus(s)).toBe('in_transit')
    }
  })
  it('fails safe: unknown/empty never maps to delivered', () => {
    expect(mapPackageStatus('SomethingNew')).toBe('in_transit')
    expect(mapPackageStatus('')).toBe('in_transit')
  })
  it('exposes the UPS carrier code', () => {
    expect(UPS_CARRIER).toBe(100002)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run src/lib/shipping/seventeentrack.test.ts`
Expected: FAIL — module/exports missing.

- [ ] **Step 3: Write minimal implementation** (`seventeentrack.ts`): the `DeliveryStatus` type, `UPS_CARRIER = 100002`, and `mapPackageStatus` with the mapping from Global Constraints (switch/lookup; default → `in_transit`).

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run src/lib/shipping/seventeentrack.test.ts` → PASS. Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit** (`feat: 17track status mapper + carrier constant`).

## Task 2: 17track network client (register + get), fail-closed

**Files:** Modify `src/lib/shipping/seventeentrack.ts`; Test `src/lib/shipping/seventeentrack.test.ts`.

**Interfaces:**
- Consumes: `mapPackageStatus`, `UPS_CARRIER` (Task 1).
- Produces:
  - `type TrackDeps = { fetch?: typeof fetch; apiKey?: string; base?: string }`
  - `registerTracking(number: string, carrier: number, deps?: TrackDeps): Promise<void>`
  - `getTracking(number: string, carrier: number, deps?: TrackDeps): Promise<{ status: DeliveryStatus; deliveredAt: Date | null } | null>`
- Defaults: `apiKey = process.env.SEVENTEENTRACK_API_KEY`, `base = process.env.SEVENTEENTRACK_API_BASE ?? 'https://api.17track.net/track/v2.4'`, `fetch = globalThis.fetch`.

- [ ] **Step 1: Write failing tests** — use a fake `fetch` (no network). Cover:
  - `getTracking` with an envelope `{ data: { accepted: [{ number, track_info: { latest_status: { status: 'Delivered' }, latest_event: { time_iso: '2026-08-18T15:00:00Z' } } }], rejected: [] } }` → `{ status: 'delivered', deliveredAt: Date(2026-08-18T15:00:00Z) }`. (Adjust the nested path to the one verified in Task 1 Step 0 — keep the test payload and the parser in agreement.)
  - `getTracking` with `latest_status.status: 'InTransit'` → `{ status: 'in_transit', deliveredAt: null }`.
  - `getTracking` with `latest_status.status: 'Exception'` → `{ status: 'exception', deliveredAt: null }`.
  - `getTracking` where the number is in `rejected` → `null`.
  - `getTracking` on HTTP 401/500 (fake `Response` with `ok:false`) → `null`.
  - `getTracking` on malformed JSON / thrown fetch → `null` (never throws).
  - `registerTracking` asserts: POST to `${base}/register`, header `17token` = apiKey, `content-type: application/json`, body `[{ number, carrier }]`. A success envelope resolves; an "already registered" code (e.g. `data.rejected[0].error.code === -18019955` or a `code` indicating duplicate) resolves (treated as success); an HTTP error → resolves without throwing (fail-soft, logged) OR throws only if you decide register should surface — per spec register-on-set is fail-soft, so **resolve without throwing** and let the caller ignore.

Write these as concrete tests with the fake fetch returning the envelopes above and asserting the parsed result / that no throw occurs.

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/lib/shipping/seventeentrack.test.ts` → FAIL (functions missing).

- [ ] **Step 3: Implement** `registerTracking` + `getTracking`:
  - Build request: `fetch(`${base}/${path}`, { method:'POST', headers:{ '17token': apiKey, 'content-type':'application/json' }, body: JSON.stringify([{ number, carrier }]) })`.
  - `getTracking`: wrap in try/catch; if `!res.ok` → return null; parse JSON; find the entry in `data.accepted` matching `number`; if absent (rejected/empty) → null; read `package_status` via the verified path; `mapPackageStatus(raw)`; `deliveredAt` = parsed delivery time when status is `delivered`, else null; return `{status, deliveredAt}`. Any throw → null.
  - `registerTracking`: try/catch; POST; treat any response (success or already-registered) as resolve; swallow errors (optionally `console.warn`). Never throw on network/HTTP error.

- [ ] **Step 4: Run tests** → PASS. `npx tsc --noEmit`.

- [ ] **Step 5: Commit** (`feat: 17track register + getTracking client (fail-closed)`).

## Task 3: Poll orchestrator

**Files:** Create `src/lib/shipping/poll-shipments.ts`; Test `src/lib/shipping/poll-shipments.test.ts`.

**Interfaces:**
- Consumes: `getTracking`, `UPS_CARRIER`, `DeliveryStatus` (Tasks 1-2); `prisma` (`@/lib/db`).
- Produces: `pollShipments(deps?: { db?; now?: Date; getTracking?: typeof getTracking }): Promise<{ checked: number; updated: number; delivered: number }>`.

- [ ] **Step 1: Write failing tests** with a fake `db` (object exposing `competition.findMany` + `competition.update`) and a fake `getTracking`:
  - Query filter is honored: only competitions with `shipmentTracking` set, `deliveryStatus` != 'delivered', UPS carrier are considered (assert the `findMany` `where` shape, or seed a mix and assert only the right ones are checked).
  - A shipment `getTracking` returns `delivered` → `competition.update` called with `deliveryStatus:'delivered'`, `deliveredAt`, `lastTrackedAt`; counts `delivered:1, updated:1, checked:1`.
  - A shipment returns `in_transit` → update with `deliveryStatus:'in_transit'`, `lastTrackedAt` (no `deliveredAt`); `updated:1, delivered:0`.
  - `getTracking` returns `null` → update with `lastTrackedAt` only; `updated:0` (status untouched), still `checked:1`.
  - Empty shipment list → `{checked:0,updated:0,delivered:0}`, no updates.

- [ ] **Step 2: Run to verify fail** → FAIL.

- [ ] **Step 3: Implement** `pollShipments`: `findMany` with the filter (use the `includes('ups') && !includes('usps')` guard on `shipmentCarrier` — or filter in-memory after a broader query if Prisma can't express it cleanly; keep it correct); loop, call `getTracking(number, UPS_CARRIER, ...)`; branch on result as above; accumulate counts; return.

- [ ] **Step 4: Run tests** → PASS. `npx tsc --noEmit`.

- [ ] **Step 5: Commit** (`feat: pollShipments orchestrator`).

## Task 4: Cron route

**Files:** Create `src/app/api/cron/track-shipments/route.ts`; Modify `vercel.json`.

**Interfaces:** Consumes `pollShipments` (Task 3).

- [ ] **Step 1:** Implement the route as an exact structural copy of `src/app/api/cron/sync-artifacts/route.ts`: `export const dynamic='force-dynamic'`, `export const maxDuration=60`, `GET(req)` checks `Bearer ${process.env.CRON_SECRET}` (skip check only if `CRON_SECRET` unset, matching the sibling), calls `await pollShipments()`, returns `NextResponse.json({ ok:true, ...r })`, catches → 500 `{ ok:false, error }`.

- [ ] **Step 2:** Add to `vercel.json` `crons`: `{ "path": "/api/cron/track-shipments", "schedule": "0 7 * * *" }`.

- [ ] **Step 3:** `npx tsc --noEmit`. (No unit test — route is a thin wrapper; logic is tested in Task 3. Optionally a smoke test asserting 401 without the bearer.)

- [ ] **Step 4: Commit** (`feat: track-shipments cron route + schedule`).

## Task 5: New fields on CompetitionView + register-on-set + banner suppression

**Files:** Modify `src/lib/competitions.ts`; Modify `src/lib/competitions.test.ts`.

**Interfaces:**
- Consumes: `registerTracking`, `UPS_CARRIER` (Tasks 1-2).
- Produces (extends): `CompetitionView` gains `deliveryStatus: 'in_transit'|'delivered'|'exception'|null` and `deliveredAt: Date | null`. `toCompView` maps them. `computeBannerItems` suppresses on `shippedAt`.

- [ ] **Step 1: Write failing tests** in `competitions.test.ts`:
  - `computeBannerItems`: a comp with a member's club-ship entry + an approaching `deliverByDate` (within window) + `shippedAt = <a date>` → **no** `deliver` item and (for a board viewer with podTotal>0 + approaching shippingDeadline) **no** `ship` item.
  - Same comp with `shippedAt = null` → the `deliver` (and `ship`) items DO appear. (Regression guard — proves suppression is what removes them, not the window.)
  - (Construct these via the `OfficerCompView[]` input `computeBannerItems` takes; include `shippedAt`, `deliveryStatus`, `deliveredAt` on the view objects.)

- [ ] **Step 2: Run to verify fail** → FAIL (fields/suppression missing).

- [ ] **Step 3: Implement:**
  - Add `deliveryStatus`/`deliveredAt` to the `CompetitionView` type and to `toCompView` (reading `c.deliveryStatus ?? null`, `c.deliveredAt ?? null`).
  - In `computeBannerItems`, guard the member `deliver` push and the officer `ship` push with `if (!c.shippedAt) { ... }` (i.e. only emit when NOT yet shipped). Keep `register` (unaffected — registration on the comp site is separate from club shipment).
  - In `setShipmentTracking`: after a successful update where a NEW/changed UPS tracking number was set (carrier matches the UPS guard AND `tt` differs from the prior `c.shipmentTracking`), call `registerTracking(tt, UPS_CARRIER).catch(() => {})` (fail-soft). Do not register on clear or unchanged number.

- [ ] **Step 4: Run tests** → PASS (plus the full suite for regressions): `npx vitest run src/lib/competitions.test.ts && npx tsc --noEmit`.

- [ ] **Step 5: Commit** (`feat: delivery fields + banner suppression on shipped + register-on-set`).

## Task 6: Card display (Delivered/Shipped/Exception) + member view carries fields

**Files:** Modify `src/components/members/CompetitionCard.tsx`; Modify `src/lib/competitions.ts` (`listMemberComps` mapping + `MemberCompView` inherits new fields via `CompetitionView`).

- [ ] **Step 1:** Ensure `listMemberComps` maps `deliveryStatus`/`deliveredAt` through (they flow via `toCompView`, so confirm `listMemberComps` uses `toCompView` — it does — no extra work beyond Task 5; verify `MemberCompView` type includes them via extension).

- [ ] **Step 2:** In `CompetitionCard.tsx`, in the "Club shipment" block where it currently renders `Shipped {iso(comp.shippedAt)}`:
  - if `comp.deliveryStatus === 'delivered'` and `comp.deliveredAt` → render `Delivered {iso(comp.deliveredAt)}` in green (e.g. `text-[#4ade80]`), instead of the "Shipped …" prefix.
  - else if shipped (`comp.shippedAt`) → keep `Shipped {iso(shippedAt)}` (optionally append `· In transit` when `deliveryStatus==='in_transit'`).
  - if `comp.deliveryStatus === 'exception'` → append a subtle `· Delivery exception — check tracking` note (amber/red-muted).
  - Keep carrier + tracking link exactly as-is. Display-only; no logic/gating change.

- [ ] **Step 3:** `npx tsc --noEmit && npx next build && npx vitest run` (full suite green).

- [ ] **Step 4: Commit** (`feat: CompetitionCard shows Delivered/In transit/Exception`).

## Task 7: Live — db push + Vercel env + smoke (PAUSE for user)

- [ ] `prisma db push` (via the Fly tunnel, per house convention) for `deliveryStatus`/`deliveredAt`/`lastTrackedAt`. `prisma generate`.
- [ ] Confirm with the user that `SEVENTEENTRACK_API_KEY` is set in **Vercel** (prod + preview) — the key is in local `.env` already; Vercel is the user's manual step. `vercel env ls` to check the name exists (value stays hidden).
- [ ] Deploy. Trigger the cron route once manually (`curl` with the `Bearer $CRON_SECRET` — do not print the secret; run it server-side or via a masked shell) and confirm it returns `{ ok:true, checked, updated, delivered }`.
- [ ] For a real in-flight club shipment (if one exists): confirm register-on-set registered it (17track dashboard shows the number) and the next poll updates `deliveryStatus`. Otherwise note "no live shipment to verify against; logic verified by unit tests + a manual cron 200."
- [ ] Verify in-browser: a delivered shipment's card reads "Delivered {date}" (green); reminders for a shipped comp are gone.
- [ ] Verdict in ledger.

## Self-Review

- **Coverage:** mapper (T1), client (T2), poll (T3), cron (T4), fields+suppression+register-on-set (T5), card (T6), live (T7). Maps 1:1 to the six spec units + live. ✅
- **Fail-closed** enforced in T2 (null on any error) and honored in T3 (null → lastTrackedAt only); **never-false-delivered** in T1 (unknown→in_transit). **Quota-safe** in T5 (register only on new/changed UPS number).
- **Type consistency:** `DeliveryStatus`, `UPS_CARRIER`, `getTracking`/`registerTracking` signatures defined in T1-2 and consumed unchanged in T3/T5. `deliveryStatus`/`deliveredAt` added to `CompetitionView` in T5 and read in T6.
- **Open (build-time):** exact nested JSON path for `package_status` + delivered timestamp in the 17track v2.4 payload — pinned in T1 Step 0 against a real response; T2 test payload must match whatever path is chosen.
