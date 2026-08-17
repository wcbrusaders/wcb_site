# WCB Member Contributions + Club Store — Design

**Status:** Approved design · Not yet planned/built
**Date:** 2026-08-16
**Repo/branch:** `wcb_site`, feature branches off `main`

## Goal

Let members contribute their own gear to the club, routed by nature: **lend it** (the existing equipment/book library — borrow & return) or **sell it for club funds** (a new store). Every store item is a donation-for-resale with **100% of proceeds to the club** — the club is the only seller. Fixes the reported gap that regular members can't add equipment (it was board-only by design) and builds the donated→discounted→sold→proceeds economy.

## Unifying idea

A member contributing answers one question: **"Lend it, or sell it for club funds?"**
- **Lend → Library** (existing `LoanableItem`/`Copy`/`Loan`).
- **Sell → Store** (new `StoreItem`; club sells, all money to club).

Both are "donate to the club" — one to lend, one to sell. A single **Contribute** entry point asks lend-or-sell and routes to the right add form.

## Philosophy (decided)

**Open + member-routed, trust-based.** Any current member can add directly — no board approval bottleneck — because the library's purpose is a low-friction communal pool (grab-on-the-fly; new brewers testing the hobby). The board retains edit/archive/remove as a curation backstop. The *item's nature* (reusable vs consumable/for-sale), not an officer, decides where it lands.

## Scope: two phases (one spec)

### Phase 1 — Open library contributions (small; ships first, unblocks the member)
- Remove the board-only gate on adding **library** items.
  - `src/app/members/equipment/page.tsx` (and the books page if it mirrors it): render `AddTitleForm` for any current member, not just `isBoard`.
  - `src/app/members/_actions/lending-actions.ts`: `addTitleAction` uses `requireMember()` instead of `requireBoard()`. `addCopies`/`editTitle`/`archiveCopy` stay board-only (curation) — only *adding a new item* opens up.
- Provenance already captured via `addedById` — keep it.
- Board keeps edit/archive/remove (existing) as the cleanup backstop.
- **Bar:** existing lending tests still pass; add a test that a non-board member can `addTitle` but still cannot `addCopies`/`editTitle`/`archiveCopy`.

### Phase 2 — The Club Store (the bigger build)

**Data model — new `StoreItem` (NOT a LoanableItem; different lifecycle):**
```
model StoreItem {
  id           String    @id @default(cuid())
  title        String
  description  String?
  photoUrl     String?
  priceCents   Int                        // integer cents, avoid float money
  category     String                     // 'consumable' | 'equipment' | 'other'
  status       String    @default("available") // available | reserved | sold
  addedById    String                     // member who donated/listed it
  reservedById String?                    // member who claimed it
  reservedAt   DateTime?
  soldAt       DateTime?
  soldToId     String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}
```
No copies, no loans — a store item is sold once and gone.

**Member flow (`/members/store`):**
1. Browse available items (title, price, photo, category).
2. **Claim** an available item → status → `reserved`, `reservedById`/`reservedAt` set (nobody else can claim it).
3. Member is sent to the **club PayPal** (existing dues/join PayPal account) to pay — payment is **off-site** (no in-site checkout).
4. An **officer confirms payment landed + arranges pickup**, then marks the item **`sold`** (`soldAt`/`soldToId`).

**Contribution flow:** any member adds a store item directly ("sell this for club funds"), sets a price. Open, like the library.

**Reservation auto-expiry:** a `reserved` item not marked sold within **N days (default 3)** auto-releases back to `available` (so a flake doesn't lock inventory). Implemented as a read-time check (like the enforcement cooldown): a reserved item whose `reservedAt + N days < now` is treated as available and its reservation cleared on next write/view. (A pure `isReservationExpired(reservedAt, now)` helper, unit-tested.)

**Officer store admin:** a panel (reuse the `/members/admin` shell / board-gate) listing `reserved` items → **Confirm sold** (mark sold + who) or **Release** (back to available). Board can also remove/edit any store item (curation backstop).

**Money:** off-site via the existing **club PayPal** — the site is a catalog + claim broker + state tracker; humans handle cash + handoff. 100% to the club by definition (the club is the seller; no per-member payout logic exists).

**Server-side rules (all actions):**
- Add store item / claim: `requireMember()` (any current member).
- Confirm-sold / release / edit / remove: `requireBoard()`.
- Claim rejects if the item isn't `available` (prevents double-claim) — enforced server-side, not just UI.
- Every officer action (confirm-sold, release, remove) writes an `AuditLog` entry (reuse `recordAudit`), consistent with the admin portal.

**Contribute entry point:** a single **"Contribute an item"** action (on the members hub / equipment area) asks **"Lend it (library) or sell it for club funds (store)?"** → routes to the library add form or the store add form.

## Architecture notes
- Store is a new module `src/lib/store.ts` (pure helpers: reservation-expiry, price formatting, status transitions) + `src/app/members/store/` (page + `_actions/store-actions.ts`) — mirrors the lending module's shape. Pure logic separated + unit-tested; server actions thin + board/member-gated.
- `/members/store` is `force-dynamic` (live inventory).
- Reuses: `auth()`/session, `requireMember`/`requireBoard` patterns, `recordAudit`, blob photo upload (same as equipment photos), the members nav.

## Explicitly OUT
- In-site payment/checkout (Stripe/PayPal API, cart, refunds, tax) — off-site PayPal only.
- Per-member payouts / proceeds splitting — every sale is 100% club (one seller).
- Shipping/logistics — pickup is arranged out-of-band by the officer.
- Buyer-to-buyer messaging/offers/haggling — fixed price, claim-or-not.

## Dependencies / deploy
- Phase 2 adds the `StoreItem` Prisma model → `prisma db push` before use (same pattern as prior schema adds).
- No new external services (reuses club PayPal + existing blob store).
