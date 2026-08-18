# Shipment Delivery Auto-Detect + Reminder Suppression — Design

**Date:** 2026-08-18
**Status:** Approved (design), pending spec review → plan → build

## Problem

Two related shipment-lifecycle gaps in the competitions feature:

1. **No delivery state.** The `Competition` model records only `shipmentCarrier`, `shipmentTracking`, `shippedAt`. Once tracking is added the card reads "Shipped {date}" forever — it can never show "Delivered", because nothing learns the package arrived. (User: "the Shipped status has not changed for a competition shipment despite it being delivered today.")

2. **Reminders never stop.** `computeBannerItems` shows the member "Deliver your N club-ship entries to the shipper" banner and the officer "ship" banner purely off the calendar date. Even after the club has shipped, members keep getting nagged to bring bottles to the shipper. (User: "if people did get their stuff shipped, then they shouldn't get reminders to ship anymore.")

## Decisions (settled with user)

- **Delivery data source:** **17track** API. The official UPS Track API needs a **business account** (unavailable); scraping ups.com is fragile (status arrives via authenticated XHR; headless Chromium doesn't run on Vercel serverless); TrackingMore turned out to be paid. 17track gives a **one-time 200 free tracking registrations**, no business account, no monthly fee.
- **Quota model (why 200 is effectively "forever"):** the 200 counts only on **register** (one per competition shipment). Reading status (`gettrackinfo`) does NOT consume quota, so daily polling of an in-transit package is free. 200 free ≈ 200 club shipments (many years at the club's volume). One-time, not renewing; if ever exhausted, top up cheaply or fall back to a manual toggle.
- **Carrier now:** UPS — 17track carrier code **`100002`** (FedEx `100003`, not wired now). Client takes a carrier code so other carriers need no new code.
- **Refresh mechanism:** Daily Vercel Cron (matches the 3 existing crons). No on-view polling, no manual refresh button.
- **On delivery:** card shows "Delivered {date}" (green). Reminders suppress as soon as the club shipment is **shipped** (`shippedAt` set) — not gated on delivery — because once bottles are with the carrier there is nothing left for a member to do.

## 17track API (confirmed from docs)

- **Base:** `https://api.17track.net/track/v2.4` (configurable via `SEVENTEENTRACK_API_BASE`).
- **Auth header:** `17token: <security key>` (`SEVENTEENTRACK_API_KEY`).
- **Register:** `POST /register` — body `[{ "number": "<tracking>", "carrier": 100002 }]`. Consumes one quota per new number. Re-registering an existing number returns a "already registered" code — treat as success.
- **Read:** `POST /gettrackinfo` — body `[{ "number": "<tracking>", "carrier": 100002 }]`. No quota cost.
- **Status field:** `package_status`, values: `NotFound | InfoReceived | InTransit | Expired | AvailableForPickup | OutForDelivery | DeliveryFailure | Delivered | Exception`.
- Both endpoints return a `{ code, data: { accepted: [...], rejected: [...] } }` envelope — parser reads `data.accepted[0]` and its `track_info`/latest event for `package_status` + delivery time. **Exact nested field path (delivered timestamp location) confirmed against a real payload at build time (Task 1).**

## Architecture

Six units, each testable in isolation. The only real business logic (the status mapper) is pure and fully TDD'd; everything network-facing is thin, dependency-injected, and **fails closed**.

### 1. Schema (delivery fields)
Add to `Competition`:
- `deliveryStatus String?` — normalized: `'in_transit' | 'delivered' | 'exception' | null`. `null` = not yet polled / no tracking.
- `deliveredAt DateTime?` — set when the carrier reports delivered.
- `lastTrackedAt DateTime?` — last successful poll (observability + lets the poll skip finished shipments).

`prisma db push` (no migrations — house convention) + `prisma generate`.

### 2. 17track client (`src/lib/shipping/seventeentrack.ts`)
Small, dependency-injected module — **no Next/prisma imports**, unit-testable with a fake fetch.

- `type DeliveryStatus = 'in_transit' | 'delivered' | 'exception'`
- `mapPackageStatus(raw: string): DeliveryStatus` — **pure, TDD.** Maps `package_status`:
  - `Delivered` → `delivered`
  - `Exception | DeliveryFailure | Expired` → `exception`
  - everything else (`NotFound | InfoReceived | InTransit | AvailableForPickup | OutForDelivery`, unknown) → `in_transit`
  - **Fail-safe: unknown never maps to `delivered`.**
- `UPS_CARRIER = 100002` constant.
- `registerTracking(number, carrier, deps): Promise<void>` — `POST /register`; treat "already registered" as success; `deps.fetch` injectable.
- `getTracking(number, carrier, deps): Promise<{ status: DeliveryStatus; deliveredAt: Date | null } | null>` — `POST /gettrackinfo`, parse `data.accepted[0]` → `package_status` + delivery timestamp → normalized. Returns **null** on any HTTP/parse/network failure or if the number is in `rejected` (caller = "couldn't determine, leave unchanged").
- Config: `SEVENTEENTRACK_API_KEY` (header `17token`), `SEVENTEENTRACK_API_BASE` (default above).

### 3. Poll orchestrator (`src/lib/shipping/poll-shipments.ts`)
- `pollShipments(deps): Promise<{ checked: number; updated: number; delivered: number }>`
  - Query competitions where `shipmentTracking` set AND `deliveryStatus` != `'delivered'` (skip finished) AND `shipmentCarrier` is UPS (reuse `includes('ups') && !includes('usps')` guard from `trackingUrl`; map to `100002`).
  - Each: `getTracking(...)`. Non-null → update `deliveryStatus`, `lastTrackedAt = now`, `deliveredAt` when newly delivered. Null → `lastTrackedAt` only.
  - Fully DI (`deps.db`, `deps.now`, `deps.getTracking`) → testable with fakes, no network. Return counts.

### 4. Cron route (`src/app/api/cron/track-shipments/route.ts`)
Copy `sync-artifacts/route.ts` exactly: `Bearer ${CRON_SECRET}` auth, `dynamic='force-dynamic'`, `maxDuration=60`, call `pollShipments()`, JSON counts, 500 on throw. Add to `vercel.json`: `{ "path": "/api/cron/track-shipments", "schedule": "0 7 * * *" }` (07:00 UTC).

### 5. Reminder suppression (`src/lib/competitions.ts`)
- Extend `CompetitionView`/`toCompView` with `deliveryStatus` + `deliveredAt` (`shippedAt` already present).
- `computeBannerItems`: a competition whose club shipment is shipped (`shippedAt != null`) suppresses BOTH the member `deliver` banner and the officer `ship` banner. **TDD both ways**: shipped → none; not shipped → present (regression guard).

### 6. Register-on-set + card display
- **Register on set** (`setShipmentTracking` + its action, `competitions.ts`): when a board member saves a UPS tracking number, fire `registerTracking(number, 100002)` so 17track starts following it (fail-soft — a registration error is logged, never blocks saving; the daily poll self-heals by returning null until it's registered). Only register when carrier is UPS and tracking is newly set/changed (avoid re-spending quota on every save — compare to the previous number).
- **Card** (`CompetitionCard.tsx`): `deliveryStatus === 'delivered'` → green "**Delivered {deliveredAt}**"; shipped-not-delivered → "Shipped {shippedAt}" (opt. "· In transit"); `exception` → subtle "Delivery exception — check tracking". Display-only. `MemberCompView` carries new fields (extend `listMemberComps` mapping).

## Data flow

```
Board sets UPS tracking
  → setShipmentTracking(): saves fields + shippedAt
    → registerTracking(number, 100002)   [fail-soft; one quota; only if number changed]

Vercel Cron (daily 07:00 UTC)
  → GET /api/cron/track-shipments  (Bearer CRON_SECRET)
    → pollShipments()
      → each undelivered UPS shipment: getTracking → mapPackageStatus [pure]
        update deliveryStatus / deliveredAt / lastTrackedAt
    → { checked, updated, delivered }

Page render
  computeBannerItems / listMemberComps read new fields
  → banners suppressed once shippedAt set
  → CompetitionCard shows Delivered/Shipped from deliveryStatus
```

## Error handling

- **Fail-closed:** any 17track auth/network/parse failure or a `rejected` number → `getTracking` null → status unchanged, only `lastTrackedAt` advances. Cron never throws on one bad shipment; returns 200 with counts.
- **Never false-positive "delivered":** unknown/unmapped `package_status` → `in_transit`. Only explicit `Delivered` flips state.
- **Missing key:** client throws a clear error; `pollShipments` surfaces it, cron returns 500 (Vercel logs). `registerTracking` on set is fail-soft so a missing key never blocks saving tracking.
- **Quota-safe:** register only on a new/changed number; polling is quota-free; poll excludes already-`delivered`.

## Testing

- `mapPackageStatus` — table of all 9 `package_status` values + unknown → normalized, unknown → in_transit (TDD, pure).
- `getTracking` — fake fetch with sample 17track envelopes (accepted+Delivered / accepted+InTransit / accepted+Exception / rejected / HTTP 4xx / malformed) → correct result / null. No network.
- `registerTracking` — fake fetch asserts `17token` header + `[{number,carrier}]` body; "already registered" code → success; error path.
- `pollShipments` — fake db + fake getTracking: skips delivered, updates transit, sets deliveredAt on newly delivered, advances lastTrackedAt on null, correct counts.
- `computeBannerItems` — suppression cases (shipped → none; not shipped → present).
- Existing 294 tests green; `tsc` + `next build` clean.

## Out of scope (YAGNI)

- FedEx/other carriers (client takes a carrier code; not wired).
- Per-entry delivery (one club package per comp).
- Push/email on delivery (card + banner suppression only).
- On-view polling, manual refresh button.
- Historical event timeline (current status only).
- Official UPS API / scraping / paid aggregators (ruled out above).

## Manual setup the user must do (documented, not code)

1. Create a free **17track** account → API section → copy the **security key** (`17token`).
2. Add `SEVENTEENTRACK_API_KEY` to Vercel env (prod + preview) and local `.env`.
3. `CRON_SECRET` already set (3 existing crons) — nothing to do.
4. (Build-time, me:) confirm the exact nested field path for the delivered timestamp against a real `/gettrackinfo` payload (Task 1) and lock the parser to it.
