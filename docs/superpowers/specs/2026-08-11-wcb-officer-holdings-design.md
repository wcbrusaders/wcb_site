# WCB Officer Holdings View — Design

**Date:** 2026-08-11
**Status:** Approved (brainstorming) → ready for implementation plan
**Scope:** `wcb_site` — a board-only, mostly-read view of who currently holds which club items (books + equipment), with per-member loan history and a board "mark returned on their behalf" action. Additive to the live lending feature; no schema change.

## Problem

The lending system is live: members self-check-out and return books/equipment. Board members have no single place to see **who is holding what across the whole club** — needed for accountability (chasing overdue items), coordination (locating a specific tool), and handling in-person returns where the holder forgot to return it in the app. Today a board member would have to infer holdings from the per-item availability counts. This view surfaces the active-loan data the system already stores.

## Key decisions (locked in brainstorming)

- **Board-only.** Gated with the existing pattern: `auth()` → if `!session.user.isBoard`, `redirect('/members')`. The nav link shows only for board.
- **Primary organization: by member** ("who has what"). Members with overdue items sort first, then alphabetical by name.
- **Scope = current holdings + overdue highlighting + per-member history + board force-return.** No per-item view, no cross-member history browser, no reminder/nudge automation (the email link is the manual nudge).
- **Contact: name + email**, email as a `mailto:` link so a board member can nudge a holder in one click. (Name/email already on `Member`.)
- **History is expandable per member** — the default view shows only *current* holdings; a "Show past loans" toggle per member reveals that member's returned-loan history on demand. Keeps the default clean.
- **Board force-return reuses the existing `returnLoan` logic** — it is a normal return performed by the board: sets `returnedAt`, frees the copy (`status` → `available`), and for **equipment** prompts for condition-in exactly like the member return flow. Behind a **confirm dialog** ("Return *{item}* held by *{member}*?"). Unlike the member return action (which asserts the loan is the actor's own), the board action allows returning **any** loan — gated solely by `requireBoard()`. That is the point of the feature.
- **No schema change, no new dependency.** Everything reads existing `Loan`/`Copy`/`LoanableItem`/`Member` rows.

## Out of scope

- Per-item holdings/history view (this is member-grouped only).
- A separate browsable all-history list (history is per-member, on demand).
- Automated overdue reminders / notifications (manual email nudge instead).
- Editing loans other than returning them (no changing due dates, reassigning, etc.).
- Board force-**checkout** on someone's behalf (only force-return).

## Data model

No changes. Reads:
- **`Loan`** — active loan = `returnedAt IS NULL`. Carries `copyId`, `memberId` (plain String, no FK relation), `checkedOutAt`, `dueAt`, `renewedCount`, `conditionOut/In`.
- **`Copy` → `LoanableItem`** — for item `title`, `category`, copy `label`.
- **`Member`** — `id`, `name`, `emailAddress` — looked up by `memberId`. Because `memberId` has no Prisma relation, member details are fetched with a batched `findMany({ where: { id: { in: memberIds } } })` and keyed into a `Map<id, {name,email}>`. A loan whose `memberId` no longer matches a `Member` row (deactivated/removed) still shows, labeled with the raw id / "Unknown member" — it must not be dropped or crash the view.

## Architecture

**Query layer (framework-free, in `src/lib/lending.ts`, mirroring `listTitles`):**

- `listActiveHoldings(deps?)` → returns members with ≥1 active loan, each as:
  ```
  MemberHoldings = {
    memberId: string
    name: string | null
    email: string | null
    loans: HoldingLoan[]      // current (returnedAt null) loans, sorted due-date asc
    overdueCount: number
  }
  HoldingLoan = {
    loanId: string
    itemTitle: string
    category: 'book' | 'equipment'
    copyLabel: string | null
    checkedOutAt: Date
    dueAt: Date
    overdue: boolean          // dueAt < now
  }
  ```
  Sorted: members with `overdueCount > 0` first, then by `name` (nulls last). Grouping and overdue computation happen here (testable), not in the component.

- `listMemberHistory(memberId, deps?)` → that member's **returned** loans (`returnedAt` not null), newest first:
  ```
  HistoryLoan = {
    loanId, itemTitle, category, copyLabel,
    checkedOutAt: Date, returnedAt: Date,
    conditionIn: string | null   // equipment wear trail
  }
  ```

**Server action (in `src/app/members/_actions/lending-actions.ts`):**

- `boardReturnLoanAction(loanId: string, opts?: { conditionIn?: Condition })` →
  1. `requireBoard()` (throws/redirects non-board).
  2. Calls the existing `returnLoan(loanId, ...)` core (the same logic members use) — sets `returnedAt`, frees the copy, stamps `conditionIn`/`currentCondition` for equipment.
  3. `revalidatePath('/members/holdings')` + the library/equipment pages (availability changed).
  Returns the existing `ReturnResult` shape (`{ok:true} | {ok:false, reason}`). **Does NOT assert loan ownership** — that is what distinguishes it from the member `returnAction`; board may return any loan.

  **No seam needed — `returnLoan` already supports this.** Its current signature is `returnLoan(loanId, actingMemberId, isBoard, cond?, deps?)`, and the ownership check is already `if (!isBoard && loan.memberId !== actingMemberId) return forbidden`. So when `isBoard` is `true`, ownership is skipped and any loan can be returned. The board action simply calls `returnLoan(loanId, <board member's own id>, true, { conditionIn })`. The member `returnAction` continues to pass `isBoard` from its own session and its behavior is untouched — no change to `returnLoan` at all.

**Pages / components:**

- `src/app/members/holdings/page.tsx` (new, server component) — board-gate, calls `listActiveHoldings()`, renders the member-grouped list; empty state "No items are currently checked out."
- `src/components/members/HoldingsMemberCard.tsx` (new, `'use client'`) — one member: name + `mailto:` email + count badge ("3 items · 1 overdue"); their current holdings rows (title · category · out date · **due**, overdue flagged in red matching existing styling); each row a board **"Mark returned"** button → confirm (with condition-in picker for equipment, reusing `CONDITIONS`) → `boardReturnLoanAction`; a **"Show past loans"** expander that lazy-loads/reveals `listMemberHistory`. Uses the card's `useTransition`/error pattern from `TitleCard`.
- `src/components/members/SiteHeader.tsx` (modify) — add a board-only **"Holdings"** nav link (the header already reads `auth()` and shows board-conditional items).

## UI / display

- Page heading "Current holdings" + short subtext ("Everything currently checked out, by member. Board-only.").
- **Overdue-first**: members with overdue items at top; within a member, loans sorted by due date ascending so the most-overdue is first. Overdue loans get the red badge used on the member-facing cards.
- Each member card: `name` (fallback to email or "Unknown member"), `mailto:` email link, badge "N items · M overdue" (omit "· M overdue" when M=0).
- Holding row: item title, a small category tag (book/equipment), copy label if present, "out {date}", "due {date}" (red if overdue), and the board **Mark returned** control.
- **Mark returned** flow: click → confirm dialog naming item + member; equipment shows a condition-in select (default "Good", same list as returns); confirm commits via the action; on success the row disappears (loan now returned) and would appear under that member's history. Inline error on failure ("Couldn't return — refresh").
- **Show past loans**: collapsed by default; expanding lists returned loans (item · out→returned dates · condition-in for equipment). Read-only.
- Follows the hub's visual tokens (`rounded-2xl border border-border/50 bg-card-bg/30`, accent `#ff9500`, overdue red).

## Error handling & edge cases

- **No active loans** → friendly empty state, no member cards.
- **Loan whose member was deactivated/removed** (`memberId` has no `Member` row) → still shown, labeled "Unknown member" (raw id available), never dropped or crashing.
- **Force-return race** (item already returned by the member in another tab) → `returnLoan` returns `already_returned`; surface "Already returned — refresh," leave state consistent.
- **Non-board reaching `/members/holdings` directly** → redirected to `/members` (server-side gate, not just a hidden link).
- **Non-board somehow invoking `boardReturnLoanAction`** → `requireBoard()` rejects. UI hiding is not the enforcement.
- **Equipment condition on force-return** → same handling as the normal return; a book return ignores condition.

## Testing (TDD)

- **`listActiveHoldings`** (DI'd-fake db): only `returnedAt: null` loans included; grouped by `memberId`; `overdueCount` correct (dueAt < now); member sort = overdue-members-first then name; a loan with an unmatched `memberId` still appears labeled unknown.
- **`listMemberHistory`**: returns only that member's returned loans, newest first, with `conditionIn` for equipment.
- **`boardReturnLoanAction` gate** (the load-bearing new behavior): non-board rejected by `requireBoard()`; the action calls `returnLoan(loanId, boardId, true, ...)` so a board member returns a loan that is NOT theirs (verified via `returnLoan`'s existing `isBoard` branch — `returnLoan` already has tests for the ownership check; the new test asserts the ACTION passes `isBoard: true` and reaches the return, and that a non-board caller is rejected before `returnLoan` runs). Book vs equipment condition path handled by `returnLoan` as today. The member `returnAction` path is not modified.
- **Verification bar:** `tsc --noEmit` clean, `vitest run` green, `npm run build` compiles with `/members/holdings` present as a dynamic route. Board-only rendering confirmed by inspection (server gate).

## Success criteria

- A board member opens `/members/holdings` and sees every currently-checked-out item grouped by holder, overdue items surfaced first and flagged.
- They can email a holder in one click (mailto) and mark an item returned on the member's behalf (confirmed; equipment records condition), which reuses the exact return logic and immediately updates availability.
- They can expand any member to see that member's past (returned) loans.
- Non-board users cannot see the nav link or reach the page, and cannot invoke the board return action (server-enforced).
- Everything reads existing data; no schema migration; the member-facing lending flows are unchanged.
