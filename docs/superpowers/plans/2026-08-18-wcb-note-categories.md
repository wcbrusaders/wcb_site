# WCB Note Categories + Audience Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Classify each published note into one of six categories chosen by the reviewer at publish; derive audience (all-members vs officers-only) from the category; gate the `/notes` page so members never see officer-only notes; and let viewers filter by category.

**Architecture:** Add a `category` classification (the six values) alongside the existing pipeline discriminator (rename current `category:'meeting-notes'` usage to a `kind` field to avoid overloading). Audience is DERIVED from category via a pure map — never stored, so it can't drift. Review queue gains a required category dropdown; publish is blocked until chosen. The `/notes` page filters by the viewer's allowed categories and offers category-filter chips.

**Tech Stack:** Next.js 16, Prisma 6/Postgres, existing auth (`isBoard`), Vitest.

## Global Constraints

- **Six categories** (single source of truth in `src/lib/knowledge/categories.ts`):
  - All-members: `meeting` ("Meeting"), `event` ("Event"), `workshop` ("Workshop")
  - Officers-only: `board` ("Board Meeting"), `annual` ("Annual Meeting"), `financial` ("Financial")
- **Audience is derived, never stored:** `audienceForCategory(cat): 'members' | 'officers'`. Officer categories = board, annual, financial.
- **SECURITY (critical):** a regular member must NEVER receive an officers-only note — not on the `/notes` index, not on `/notes/[slug]`, not via the Resources count. Gating is enforced server-side in every query/page (filter by allowed categories for non-board), not just hidden in the UI.
- **Reviewer sets category at publish; it is REQUIRED.** Publish action rejects if no valid category is supplied. The AI may suggest, but the human sets it.
- **Do not overload the pipeline discriminator.** Introduce `kind` (default `'meeting-notes'`) for "this is a knowledge note from the notes pipeline"; `category` becomes the six-value classification. Keep queries that currently use `category:'meeting-notes'` working by switching them to `kind:'meeting-notes'`.
- Keep the existing per-page login guards; add board checks where officer categories are involved.

## Task 1: categories module (pure) + tests

**Files:** Create `src/lib/knowledge/categories.ts` + `categories.test.ts`.

- [ ] Define `NOTE_CATEGORIES` (ordered array of `{ value, label, audience }`), a `NoteCategory` union type, `CATEGORY_LABELS`, `audienceForCategory(value): 'members'|'officers'`, `isValidCategory(v): boolean`, `categoriesForViewer(isBoard): NoteCategory[]` (members → the 3 public; board → all 6), and `memberVisibleCategories` constant.
- [ ] TDD: audienceForCategory maps board/annual/financial→officers and meeting/event/workshop→members; categoriesForViewer(false) excludes officer cats; isValidCategory rejects junk. Fail→pass.
- [ ] `npx tsc --noEmit && npx vitest run src/lib/knowledge/categories.test.ts`. Commit.

## Task 2: schema — add `kind` + repurpose `category`

**Files:** `prisma/schema.prisma`; `npx prisma generate`.

- [ ] On `Article` and `DraftArticle`: add `kind String @default("meeting-notes")` (pipeline discriminator) and keep `category String?` but now meaning the six-value classification (nullable until a reviewer sets it; draft starts null). Add `@@index([kind])` and `@@index([category])` if not present.
- [ ] `npx prisma generate`; `npx tsc --noEmit`. Do NOT db push here (Task 7 live). Commit schema.

## Task 3: publish action requires a category

**Files:** `src/app/members/admin/knowledge/_actions.ts`; `src/lib/knowledge/publish.ts` (+ test).

- [ ] `publishDraftAction(draftId, editedHtml?, editedTitle?, category?)` — after requireBoard: validate `category` via `isValidCategory`; if missing/invalid return `{ ok:false, reason:'Pick a category.' }`. Pass category into `draftToArticle`.
- [ ] `draftToArticle(...)` gains `category` and sets `kind:'meeting-notes'`, `category` on the Article. Keep slug/sanitize/collision logic. Update its unit tests.
- [ ] `npx tsc --noEmit && npx vitest run`. Commit.

## Task 4: review queue — required category dropdown + derived-audience hint

**Files:** `src/components/members/KnowledgeQueue.tsx`; `src/app/members/admin/knowledge/page.tsx` (pass any AI-suggested category through).

- [ ] Each ReviewRow: a `<select>` of the six categories (labels from categories.ts), default empty ("— pick category —"), plus a live hint: "→ All members" or "→ Officers only" from `audienceForCategory`. Publish button disabled until a category is selected; pass it to `publishDraftAction`.
- [ ] `npx tsc --noEmit && npx next build`. Commit.

## Task 5: `/notes` page — gate by audience + category filter

**Files:** `src/app/members/resources/notes/page.tsx`; `src/app/members/resources/notes/[slug]/page.tsx`; `src/app/members/resources/page.tsx` (Resources count).

- [ ] Index page: read session `isBoard`; query `where: { kind:'meeting-notes', category: { in: categoriesForViewer(isBoard) } }`, order by meetingDate desc. Render a category-filter (chips or `<select>`, client-side is fine, options = categoriesForViewer). Officer-only notes show an "Officers only" badge. Show category label per note.
- [ ] `[slug]` page: after loading the article, if `audienceForCategory(article.category)==='officers'` and viewer is not board → `notFound()` (server-side gate — a member with a direct link cannot view an officer note).
- [ ] Resources landing count: count only `categoriesForViewer(isBoard)` so the badge number matches what the viewer can see.
- [ ] `npx tsc --noEmit && npx next build && npx vitest run`. Commit.

## Task 6: migrate existing notes

**Files:** none (operational, done in Task 7 live step) — but include a pure `guessCategoryFromTitle(title): NoteCategory` helper in categories.ts (Task 1) used to seed the migration (e.g. "Workshop"→workshop, "Board"→board, "Annual"→annual, "Financial"→financial, else meeting; "brew day"/"festival"/"mead day"→event). Reviewer can still change before publish; for already-published rows this sets a sane category.

- [ ] Add `guessCategoryFromTitle` + tests in Task 1's module (fold in).

## Task 7: live — db push + migrate + verify gating

**Files:** none (operational; PAUSE for user before running).

- [ ] `prisma db push` (tunnel) for `kind` + `category`.
- [ ] Backfill existing Articles: set `kind='meeting-notes'` and `category = guessCategoryFromTitle(title)`; log each.
- [ ] Verify: a non-board query returns only member categories; an officer query returns all; direct-link to an officer note as a member → notFound.
- [ ] Verdict in ledger.

## Self-Review
- Coverage: categories+audience (T1), schema (T2), required-category publish (T3), review dropdown (T4), gated+filterable notes (T5), migration (T6/T7). ✅
- Security: audience derived (can't drift); server-side gate on index AND [slug] AND count; publish requires valid category. Members can't reach officer notes by any path.
- No overloaded field: `kind` = pipeline discriminator, `category` = classification.
