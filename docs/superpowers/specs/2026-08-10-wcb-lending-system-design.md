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
- **Due dates + renewals; holds DEFERRED but designed-for.** Each loan has a due date (book 30d / equipment 14d defaults). A member can renew (extend) up to a 2-renewal cap, gated by a `canRenew(copy)` seam that today returns true for the holder — a future hold queue makes it return false when someone's waiting. No `Hold` model now.
- **Cover images = ISBN-derived, zero storage.** Books show a cover from the Open Library URL (`covers.openlibrary.org/b/isbn/{isbn}-L.jpg`) derived from the item's ISBN; placeholder on miss. No upload flow, no storage dep, no cost. **Books-only imagery** — equipment shows no photo in v1.
- **Returns: member returns own, officer returns any.** A member can mark their own active loan returned; a board member can return anyone's. A member cannot touch others' loans.
- **Full persistent loan history.** Every loan is a row that persists after return (never hard-deleted). Enables "who had this last," per-item history, and per-member borrow history.
- **Equipment condition logged at BOTH checkout and return.** A rating (`New | Good | Fair | Poor | Damaged`) + optional free-text note, captured on the loan at checkout (`conditionOut`/`noteOut`) and at return (`conditionIn`/`noteIn`). Return updates the **copy's** derived `currentCondition`. **Equipment only** — books skip the condition step (fields stay null).
- **Board admin inline, soft-delete only.** Add/edit/archive controls live on the browse pages, visible only to `isBoard`. Items are archived (soft-delete), never hard-deleted (history must survive). An item currently `out` cannot be archived until returned.

## Out of scope (follow-on specs / explicitly deferred)

- **Hold / reservation queue** — designed-for via the `canRenew` seam + a clear available/out state, but no `Hold` model, queue logic, or return-notification emails in v1. A follow-on spec if real contention appears. ("Notify me when available" and a full ordered queue both remain clean later additions.)
- **Donate-equipment** — a member proposing an item that an officer approves into the catalog. Its own later spec (a member *write* + approval state).
- **Members' shop** — the transactional store. Its own later spec.
- **Member management** — that's the roster sheet's job.
- **Equipment photos** — books-only imagery in v1.

## Data model (Prisma — 3 new models)

The club owns **multiple physical copies** of some titles (not 1:1). So a **title** and a **physical copy** are distinct: `LoanableItem` = the title (metadata), `Copy` = each physical unit (status + condition), `Loan` = a checkout of a specific copy.

**`LoanableItem`** — the **title** (one row per distinct title/piece of gear), both categories:
- Shared: `id`, `category` (`"book" | "equipment"`), `title`, `description?`, `addedById` (Member.id as a plain string — no relation/back-relation; keeps `Member` untouched), `createdAt`, `updatedAt`.
- Book-only (nullable): `author?`, `isbn?` (drives the cover URL; not a stored image).
- Equipment-only (nullable): `notes?`.
- Has many `copies`. NO `status`/`currentCondition` here — those live on the copy.

**`Copy`** — a physical unit of a title (a title with 3 books has 3 `Copy` rows):
- `id`, `itemId` (real FK → `LoanableItem`), `status` (`"available" | "out" | "archived"`), `label?` (optional human tag, e.g. "copy 2" / a serial), `currentCondition?` (equipment — derived from the copy's last return's `conditionIn`), `createdAt`, `updatedAt`.
- Has many `loans`.

**`Loan`** — full history; rows persist, never deleted:
- `id`, `copyId` (real FK → `Copy`), `memberId` (Member.id as a plain string, the borrower — no back-relation on `Member`).
- `checkedOutAt`, `dueAt`, `returnedAt?` (null = active loan), `renewedCount` (int, default 0).
- Equipment condition (nullable, null for books): `conditionOut?`, `noteOut?`, `conditionIn?`, `noteIn?`. Condition values: `New | Good | Fair | Poor | Damaged`.

**Derived facts / invariants:**
- A **copy** is out iff it has a `Loan` with `returnedAt = null`. `Copy.status` is the denormalized fast-path (kept in sync on checkout/return).
- A **title's availability** = count of its copies with `status = 'available'` — browse shows "N of M available" per title. A title is checkout-able iff ≥1 copy is available; checkout claims one available copy atomically.
- Current holder(s) of a title = the members holding its out copies. Title history = all loans across its copies. Member borrow history = all loans for that `memberId`.
- **Holds seam:** the renew decision routes through `canRenew(copy)` (today true for the holder); a future hold queue overrides it — no inline hardcoding.

## Architecture

Follows the established patterns: framework-free logic seam + thin server components + server actions; house hand-rolled Tailwind v4.

- **`src/lib/lending.ts`** (framework-free — no next/next-auth/react; DI'd fakes for tests): `listTitles` (per-title view with available/total copy counts + the viewer's active loan if any), `checkoutTitle(itemId, memberId, …)` (claims one available copy atomically), `returnLoan`, `renewLoan`, `canRenew(copy)`, `addTitle` (creates title + N copies), `addCopies`, `editTitle`, `archiveCopy`, `coverUrl(isbn)`.
- **`src/lib/notify.ts`** (framework-free): `notifyOfficersCheckout(loan, item, member)` → fire-and-forget POST to `DISCORD_OFFICER_WEBHOOK_URL`, try/catch swallowed; no-op when env unset.
- **Server actions / route handlers** (the only files importing both next-auth and `lending.ts`): `auth()` → `memberId`/`isBoard` → call `lending.ts`; on checkout also call `notify.ts`. Board actions re-assert `isBoard` server-side (never trust the client).
- **Pages:** `src/app/members/library/page.tsx`, `src/app/members/equipment/page.tsx` (server components, gated by existing middleware). New `src/components/members/ItemCard.tsx` (status badge, cover/description, action buttons; board controls by prop). `FeatureNav`'s two cards become real `<Link>`s.
- **DB:** the 3 new models (`LoanableItem`, `Copy`, `Loan`); `prisma db push`. The committed `prisma generate` on build+postinstall covers client regen.

## Member-facing flows

- **Browse** — `/members/library` (books), `/members/equipment`. One card **per title** (not per copy), showing **"N of M available"** (count of available copies). Books show ISBN cover + author; equipment shows description. Filter: all / available-only (available = ≥1 copy available). A title the member currently holds a copy of shows their loan (due date, Return/Renew). Member's own active loans surface at top.
- **Checkout** (self-service) — on a title with ≥1 available copy, "Check out" claims **one available copy** atomically. Equipment first prompts condition rating + optional note (`conditionOut`); books skip. Creates `Loan` (copy = the claimed copy, member = session `memberId`, `dueAt` = now + category default: book 30d / equipment 14d), flips that copy `status → out`, then fires the officer Discord notification. If no copy is available by the time the claim runs (race), typed failure → "Just taken — refresh."
- **Return** — on a copy the member holds (or any, if `isBoard`), "Return". Equipment prompts condition rating + optional note (`conditionIn`) → updates that copy's `currentCondition`. Sets `returnedAt = now`, flips copy `status → available`. Non-holder non-board → typed failure.
- **Renew** — on the member's own active loan, extends `dueAt` by the category default + bumps `renewedCount`, only if `canRenew(copy)` passes and under the 2-renewal cap.
- **Overdue** — `dueAt < now` and not returned → surfaced as a label on the member's loan + list. Not enforced (no lockout).

## Admin / board flows (gated on `isBoard`, re-checked server-side)

- **Add title (with copies)** — inline "Add" affordance on the browse pages, board-only. Book: title, author, ISBN (optional → cover auto-shows), description, **# of copies** (default 1). Equipment: name (title), description, notes, **# of copies** (default 1) + initial condition (seeds each copy's `currentCondition`). Creates the `LoanableItem` + N `Copy` rows (`status: "available"`), `addedById: me`.
- **Add copies to an existing title** — board can add more copies to a title later (e.g. a donated duplicate) → N new `Copy` rows.
- **Edit / archive** — board edits title fields; archive is **per-copy** = soft-delete (`Copy.status: "archived"`), preserving loan history. A copy currently `out` cannot be archived until returned. Archiving all copies effectively retires the title (it drops from browse when 0 non-archived copies remain).
- **Officer override** — board can return any active loan (also in member flows). No separate loan editor in v1 beyond return.
- Admin here = add titles/copies + edit + per-copy archive + return-any. NOT donate-approval, shop, or member management.

## Officer notification

On checkout, after the loan commits, the server posts to `DISCORD_OFFICER_WEBHOOK_URL` (a Discord Incoming Webhook for the officers channel, created at deploy — new env var). Message e.g. *"📦 {member} checked out **{title}** ({category}) · due {date} · arrange handoff."* Fire-and-forget, fail-soft (outage/unset → caught, logged, checkout still succeeds), checkout-only.

## Error handling & edge cases

- **Checkout race:** claiming a copy must be atomic, not read-then-write. Mechanism: pick one candidate available copy of the title, then `Copy.updateMany({ where: { id: copyId, status: 'available' }, data: { status: 'out' } })` — `count === 1` means this caller claimed it; `count === 0` means someone else took that copy first → retry another available copy, or return `{ ok:false, reason:'unavailable' }` when none remain. The `Loan` is created only on a successful claim, in a `$transaction` with the flip. No double-loan on a copy even if two members check out the same title simultaneously (they get different copies).
- **Return by non-holder non-board:** permission check → typed failure, no state change.
- **Renew blocked:** over cap or `canRenew` false → typed failure with reason.
- **Archive while out:** guarded → typed failure ("return it first").
- **Missing/invalid ISBN:** `coverUrl` → null → placeholder, never a broken image.
- **Discord notify fails / webhook unset:** caught + logged in `notify.ts`; checkout succeeds.
- **Board action from non-board session:** server-side `isBoard` re-check → no-op/403 regardless of hidden UI.
- **Archived item referenced by old loans:** soft-delete preserves history; browse filters archived; history resolves the item.

## Testing (TDD)

Framework-free unit tests for `lending.ts` + `notify.ts` with DI'd fakes (matching `roster.test.ts`/`dashboard.test.ts` — no mocking of code we don't own; assert real behavior; mutation-resistant):

- **`listTitles`:** excludes titles with 0 non-archived copies; per title reports `availableCount`/`totalCount` (e.g. 3 copies, 1 out → 2 of 3); maps the viewer's active loan on this title if any; `availableOnly` filters to titles with ≥1 available copy.
- **`checkoutTitle`:** title with an available copy → one copy claimed (its `status` flips to out) + loan created + correct `dueAt` (book 30d / equipment 14d); **all copies out → typed failure, no loan** (fake reflects the atomic-claim `count`); a claim losing the race on one copy retries another available copy; equipment records `conditionOut`, book leaves condition null.
- **`returnLoan`:** holder returns (copy `status` flips, `returnedAt` set, equipment copy `currentCondition` updated from `conditionIn`); **non-holder non-board → failure**; board returns anyone's.
- **`renewLoan`:** extends `dueAt` + bumps count; **at 2-renewal cap → failure**; `canRenew` false → failure.
- **`addTitle`:** creates the title + the requested N `Copy` rows (all available); `addCopies` adds N more to an existing title.
- **`archiveCopy`:** available copy → archived; **out copy → blocked**; a title with all copies archived drops from `listTitles`.
- **`coverUrl`:** valid ISBN → Open Library URL; null/blank → null.
- **`canRenew`:** documents current behavior (true for holder) — the holds seam.
- **`notify.ts`:** builds the right message; **unset webhook → no-op, no throw**; POST failure → swallowed.
- **Verification bar:** `tsc --noEmit` clean, `vitest run` green, `npm run build` compiles. Manual post-deploy smoke: add item → checkout (see Discord post) → return → renew → archive.

## Success criteria

- A member can browse books and equipment (one card per title, "N of M available"), check out an available copy (self-service), and see it as theirs with a due date. A title with multiple copies lends multiple simultaneously.
- Equipment checkout/return capture a condition rating + note; the copy's current condition reflects its last return.
- A member can return their own loan and renew it (up to the cap); a board member can return anyone's and add titles/copies + edit + per-copy archive inline.
- Every checkout posts an officer notification to Discord (fail-soft — a Discord outage never blocks a checkout).
- Full loan history persists; archived copies keep their history; browse hides titles with no non-archived copies.
- Book covers render from ISBN with a graceful placeholder; no image storage in the stack.
- `lending.ts` and `notify.ts` are framework-free and unit-tested; the hold queue slots in later via `canRenew` without a rewrite.
