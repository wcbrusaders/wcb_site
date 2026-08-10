# WCB Lending System — Design

**Date:** 2026-08-10
**Status:** Approved (brainstorming) → ready for implementation plan
**Scope:** `wcb_site` — the members-area lending system: a shared book + equipment library with self-service checkout, returns, renewals, and board admin.

## Problem

The WCB members hub is live (`wcb-site.vercel.app/members` — auth + dashboard; see the auth-module and members-dashboard specs). The dashboard's feature-nav shows "Coming soon" cards for **Book Library** and **Equipment**. This spec builds those: members browse the club's books and shared brewing equipment, check items out themselves, and return/renew them; board members manage the catalog.

**Goal:** a single generic lending system covering both books and equipment — browse, self-service checkout/return/renew, full loan history, equipment condition tracking, and an officer notification on checkout so pickup/dropoff can be arranged. It drops into the existing hub behind the existing auth.

This is the second members-area subsystem (after the dashboard). Sequence decided during roadmap decomposition: dashboard → **lending** → admin-CRUD → shop.

## Key decisions (locked in brainstorming)

- **One generic `LoanableItem` model**, `category` = `"book" | "equipment"`. Shared core fields + a few nullable per-category fields. NOT two separate tables (rejected: ~2× code), NOT a JSON attributes blob (rejected: untyped/overkill for two known categories).
- **Self-service checkout.** A logged-in member clicks "Check out" and the item is immediately theirs with a due date. No officer in the loop to gate it (trust-based, fits a small club). Officers can override (return anyone's loan).
- **Officer notification on checkout (side-effect, not a gate).** When a loan is created, the server posts to an officers Discord channel via an Incoming Webhook so an officer can arrange the physical handoff. Fire-and-forget + fail-soft: a Discord outage or unset webhook never blocks the checkout. Checkout-only (not return/renew).
- **Due dates + renewals; holds DEFERRED but designed-for.** Each loan has a due date (book 30d / equipment 14d defaults). A member can renew (extend) up to a 2-renewal cap, gated by a `canRenew(item)` seam that today returns true for the holder — a future hold queue makes it return false when someone's waiting. No `Hold` model now.
- **Cover images = ISBN-derived, zero storage.** Books show a cover from the Open Library URL (`covers.openlibrary.org/b/isbn/{isbn}-L.jpg`) derived from the item's ISBN; placeholder on miss. No upload flow, no storage dep, no cost. **Books-only imagery** — equipment shows no photo in v1.
- **Returns: member returns own, officer returns any.** A member can mark their own active loan returned; a board member can return anyone's. A member cannot touch others' loans.
- **Full persistent loan history.** Every loan is a row that persists after return (never hard-deleted). Enables "who had this last," per-item history, and per-member borrow history.
- **Equipment condition logged at BOTH checkout and return.** A rating (`New | Good | Fair | Poor | Damaged`) + optional free-text note, captured on the loan at checkout (`conditionOut`/`noteOut`) and at return (`conditionIn`/`noteIn`). Return updates the item's derived `currentCondition`. **Equipment only** — books skip the condition step (fields stay null).
- **Board admin inline, soft-delete only.** Add/edit/archive controls live on the browse pages, visible only to `isBoard`. Items are archived (soft-delete), never hard-deleted (history must survive). An item currently `out` cannot be archived until returned.

## Out of scope (follow-on specs / explicitly deferred)

- **Hold / reservation queue** — designed-for via the `canRenew` seam + a clear available/out state, but no `Hold` model, queue logic, or return-notification emails in v1. A follow-on spec if real contention appears. ("Notify me when available" and a full ordered queue both remain clean later additions.)
- **Donate-equipment** — a member proposing an item that an officer approves into the catalog. Its own later spec (a member *write* + approval state).
- **Members' shop** — the transactional store. Its own later spec.
- **Member management** — that's the roster sheet's job.
- **Equipment photos** — books-only imagery in v1.

## Data model (Prisma — 2 new models)

**`LoanableItem`** — one table, both categories:
- Shared: `id`, `category` (`"book" | "equipment"`), `title`, `description?`, `status` (`"available" | "out" | "archived"`), `addedById` (Member.id as a plain string — no enforced relation/back-relation needed; keeps `Member` untouched), `createdAt`, `updatedAt`.
- Book-only (nullable): `author?`, `isbn?` (drives the cover URL; not a stored image).
- Equipment-only (nullable): `currentCondition?` (derived from the last return's `conditionIn`), `notes?`.

**`Loan`** — full history; rows persist, never deleted:
- `id`, `itemId` (real FK relation → `LoanableItem`, since both are new models), `memberId` (Member.id as a plain string, the borrower — no back-relation on `Member`, same as `addedById`; leaves the auth-module's `Member` model untouched).
- `checkedOutAt`, `dueAt`, `returnedAt?` (null = active loan), `renewedCount` (int, default 0).
- Equipment condition (nullable, null for books): `conditionOut?`, `noteOut?`, `conditionIn?`, `noteIn?`. Condition values: `New | Good | Fair | Poor | Damaged`.

**Derived facts / invariants:**
- An item is out iff it has a `Loan` with `returnedAt = null`. `LoanableItem.status` is the denormalized fast-path (kept in sync on checkout/return) so browse needs no per-item join.
- Current holder = the item's active loan's member. Item history = all its loans. Member borrow history = all loans for that `memberId`.
- **Holds seam:** the renew decision routes through `canRenew(item)` (today true for the holder); a future hold queue overrides it — no inline hardcoding.

## Architecture

Follows the established patterns: framework-free logic seam + thin server components + server actions; house hand-rolled Tailwind v4.

- **`src/lib/lending.ts`** (framework-free — no next/next-auth/react; DI'd fakes for tests): `listItems`, `checkoutItem`, `returnItem`, `renewLoan`, `canRenew`, `addItem`, `editItem`, `archiveItem`, `coverUrl(isbn)`.
- **`src/lib/notify.ts`** (framework-free): `notifyOfficersCheckout(loan, item, member)` → fire-and-forget POST to `DISCORD_OFFICER_WEBHOOK_URL`, try/catch swallowed; no-op when env unset.
- **Server actions / route handlers** (the only files importing both next-auth and `lending.ts`): `auth()` → `memberId`/`isBoard` → call `lending.ts`; on checkout also call `notify.ts`. Board actions re-assert `isBoard` server-side (never trust the client).
- **Pages:** `src/app/members/library/page.tsx`, `src/app/members/equipment/page.tsx` (server components, gated by existing middleware). New `src/components/members/ItemCard.tsx` (status badge, cover/description, action buttons; board controls by prop). `FeatureNav`'s two cards become real `<Link>`s.
- **DB:** the 2 new models; `prisma db push`. The committed `prisma generate` on build+postinstall covers client regen.

## Member-facing flows

- **Browse** — `/members/library` (books), `/members/equipment`. Lists that category's non-archived items with **Available** / **Out** (+ "due {date}", holder) / **Overdue** badges. Books show ISBN cover + author; equipment shows description + current condition. Filter: all / available-only. Member's own active loans surface at top.
- **Checkout** (self-service) — on an Available item, "Check out". Equipment first prompts condition rating + optional note (`conditionOut`); books skip. Creates `Loan` (member = session `memberId`, `dueAt` = now + category default: book 30d / equipment 14d), flips item `status → out`, then fires the officer Discord notification. If already out (race), typed failure → "Just taken — refresh."
- **Return** — on an item the member holds (or any, if `isBoard`), "Return". Equipment prompts condition rating + optional note (`conditionIn`) → updates item `currentCondition`. Sets `returnedAt = now`, flips `status → available`. Non-holder non-board → typed failure.
- **Renew** — on the member's own active loan, extends `dueAt` by the category default + bumps `renewedCount`, only if `canRenew(item)` passes and under the 2-renewal cap.
- **Overdue** — `dueAt < now` and not returned → surfaced as a label on the item + the member's list. Not enforced (no lockout).

## Admin / board flows (gated on `isBoard`, re-checked server-side)

- **Add item** — inline "Add" affordance on the browse pages, board-only. Book: title, author, ISBN (optional → cover auto-shows), description. Equipment: name (title), description, initial condition (rating+note → seeds `currentCondition`), notes. Saves as `status: "available"`, `addedById: me`.
- **Edit / archive** — board edits item fields; archive = soft-delete (`status: "archived"`), preserving loan history. An item currently `out` cannot be archived until returned.
- **Officer override** — board can return any active loan (also in member flows). No separate loan editor in v1 beyond return.
- Admin here = add/edit/archive items + return-any. NOT donate-approval, shop, or member management.

## Officer notification

On checkout, after the loan commits, the server posts to `DISCORD_OFFICER_WEBHOOK_URL` (a Discord Incoming Webhook for the officers channel, created at deploy — new env var). Message e.g. *"📦 {member} checked out **{title}** ({category}) · due {date} · arrange handoff."* Fire-and-forget, fail-soft (outage/unset → caught, logged, checkout still succeeds), checkout-only.

## Error handling & edge cases

- **Checkout race:** the availability check must be atomic, not read-then-write. Mechanism: a Prisma `updateMany({ where: { id, status: 'available' }, data: { status: 'out' } })` — its returned `count` is 1 only for the winner; the loser's `count` is 0 → `{ ok:false, reason:'unavailable' }`, and the `Loan` is created only when `count === 1` (ideally in a `$transaction` with the status flip). No double-loan.
- **Return by non-holder non-board:** permission check → typed failure, no state change.
- **Renew blocked:** over cap or `canRenew` false → typed failure with reason.
- **Archive while out:** guarded → typed failure ("return it first").
- **Missing/invalid ISBN:** `coverUrl` → null → placeholder, never a broken image.
- **Discord notify fails / webhook unset:** caught + logged in `notify.ts`; checkout succeeds.
- **Board action from non-board session:** server-side `isBoard` re-check → no-op/403 regardless of hidden UI.
- **Archived item referenced by old loans:** soft-delete preserves history; browse filters archived; history resolves the item.

## Testing (TDD)

Framework-free unit tests for `lending.ts` + `notify.ts` with DI'd fakes (matching `roster.test.ts`/`dashboard.test.ts` — no mocking of code we don't own; assert real behavior; mutation-resistant):

- **`checkoutItem`:** available → loan created + status flipped + correct `dueAt` (book 30d / equipment 14d); **already-out → typed failure, no loan** (fake reflects the guard); equipment records `conditionOut`, book leaves condition null.
- **`returnItem`:** holder returns (status flips, `returnedAt` set, equipment `currentCondition` updated from `conditionIn`); **non-holder non-board → failure**; board returns anyone's.
- **`renewLoan`:** extends `dueAt` + bumps count; **at 2-renewal cap → failure**; `canRenew` false → failure.
- **`archiveItem`:** available → archived; **out → blocked**.
- **`coverUrl`:** valid ISBN → Open Library URL; null/blank → null.
- **`canRenew`:** documents current behavior (true for holder) — the holds seam.
- **`notify.ts`:** builds the right message; **unset webhook → no-op, no throw**; POST failure → swallowed.
- **Verification bar:** `tsc --noEmit` clean, `vitest run` green, `npm run build` compiles. Manual post-deploy smoke: add item → checkout (see Discord post) → return → renew → archive.

## Success criteria

- A member can browse books and equipment, check out an available item (self-service), and see it as theirs with a due date.
- Equipment checkout/return capture a condition rating + note; the item's current condition reflects the last return.
- A member can return their own loan and renew it (up to the cap); a board member can return anyone's and add/edit/archive items inline.
- Every checkout posts an officer notification to Discord (fail-soft — a Discord outage never blocks a checkout).
- Full loan history persists; archived items keep their history; browse hides archived.
- Book covers render from ISBN with a graceful placeholder; no image storage in the stack.
- `lending.ts` and `notify.ts` are framework-free and unit-tested; the hold queue slots in later via `canRenew` without a rewrite.
