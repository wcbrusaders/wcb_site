# WCB Knowledge Pipeline — Phase A (Meeting Notes vertical slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** End-to-end pipeline for MEETING NOTES only: a scheduled sync pulls new Gemini meeting-notes docs from Drive → an AI pass extracts a "structured brewing recap" per the validated spec → the draft lands in a board-only review queue → an officer edits/approves → published article appears in the members Knowledge lane. Workshops + recipes are a later phase on the same plumbing.

**Architecture:** Reuses proven pieces: Drive OAuth read (from the earlier spike), the sanitize/normalize approach, the `auth()`/`isBoard` gate, Vercel cron (mirrors `sync-roster`). New: `Article` + `DraftArticle` Prisma models, an AI-extract module using `@anthropic-ai/sdk`, a board-gated review queue UI, and the Knowledge lane rendering published articles.

**Tech Stack:** Next.js 16 App Router, Prisma 6 / Postgres, `googleapis` (installed), `@anthropic-ai/sdk` (NEW), `sanitize-html` (installed), Vitest.

## Global Constraints

- **Extraction contract:** the AI meeting-notes extract MUST follow `docs/governance/_knowledge-extraction-spec.md` verbatim — fixed template (Title · Named participants · What we covered [deep] · Homebrew & tasting · Competitions & logistics [brief] · Decisions & action items), teach-the-highlights depth, and the MUST-STRIP exclusions (personal life, off-topic tangents, sensitive club-politics/third-parties, distilling legality). Non-attendee should get the same brewing takeaways.
- **Mandatory officer review — NO auto-publish.** Every draft requires an officer to approve before it becomes a member-visible `Article`. The sync/AI steps only ever produce `DraftArticle` rows with status; publishing is a human board action.
- **Auth/gating:** review queue + all mutations are board-only (`auth()` → memberId→`/login`, `!isBoard`→`/members`), mirroring `src/app/members/admin/_actions/admin-actions.ts` (`requireBoard`). Published Knowledge articles are viewable by any logged-in member; each page carries its own login guard (the members layout does NOT gate — per prior finding).
- **Secrets:** `ANTHROPIC_API_KEY` (in local `.env`; MUST be added to Vercel env before the cron runs in prod), Google OAuth (`GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`), `CRON_SECRET`. Never print secret values.
- **Model:** use `claude-opus-4-8` for the extract (quality matters; volume is tiny — a few docs/month). Adaptive thinking; the call is small.
- **Meeting-notes Drive source:** the "Notes by Gemini" / "Meeting Notes" docs (Community Documents area). Match by name pattern; exclude TEMPLATE/WORKFLOW docs.
- **Do not commit real transcripts or extracted personal content** to git. Test artifacts stay local + git-ignored.
- **No markdown lib for rendering** — store sanitized HTML, render like the existing governance bodies.

## Task 1: Article + DraftArticle Prisma models

**Files:** Modify `prisma/schema.prisma`; run `npx prisma generate`.

- [ ] **Step 1: Add models**
```prisma
model Article {
  id          String   @id @default(cuid())
  slug        String   @unique
  title       String
  bodyHtml    String                 // sanitized, styled-ready HTML (no visible markup)
  excerpt     String?
  category    String                 // 'meeting-notes' | 'workshop' | 'recipe' (Phase A: meeting-notes)
  meetingDate DateTime?              // for notes: the meeting date
  publishedAt DateTime @default(now())
  publishedBy String?               // officer email who approved
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([category])
  @@index([slug])
}

model DraftArticle {
  id            String   @id @default(cuid())
  sourceDriveId String   @unique      // Drive doc id — sync key (idempotent upsert)
  sourceName    String                // Drive doc title
  category      String                // 'meeting-notes' (Phase A)
  status        String   @default("needs_processing") // needs_processing | in_review | published | rejected | error
  rawText       String                // exported transcript text (kept for re-processing/audit; board-only)
  processedHtml String?               // AI-extracted, sanitized HTML
  processedTitle String?
  excerpt       String?
  meetingDate   DateTime?
  errorText     String?               // if AI/processing failed
  processedAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([status])
}
```
- [ ] **Step 2:** `npx prisma generate` (do NOT db push here; live push happens in Task 7). Verify `npx tsc --noEmit`.
- [ ] **Step 3:** Commit `prisma/schema.prisma`: "feat(knowledge): Article + DraftArticle models".

## Task 2: AI extraction module (the validated spec, as code)

**Files:** Create `src/lib/knowledge/extract-notes.ts`; Test `src/lib/knowledge/extract-notes.test.ts`. Add dep `@anthropic-ai/sdk`.

**Interfaces:**
- Produces `buildExtractionPrompt(rawText: string): { system: string; user: string }` — PURE, unit-tested (asserts the prompt embeds the spec's template + must-strip rules).
- Produces `extractMeetingNote(rawText: string, deps?: { client?: Anthropic }): Promise<{ title: string; bodyHtml: string; excerpt: string }>` — calls Claude (`claude-opus-4-8`), returns sanitized HTML. Live call NOT in unit tests (exercised in Task 7).

- [ ] **Step 1:** `npm install @anthropic-ai/sdk`.
- [ ] **Step 2: Write failing tests** for `buildExtractionPrompt` — assert the system prompt contains the fixed template sections, the "teach the highlights / summarize admin" depth rule, and the must-strip categories (personal life, off-topic, sensitive third-party/club-politics, distilling legality), and instructs "invent nothing; if roll-call absent say 'named participants'". (Pure string assertions — no API call.)
- [ ] **Step 3:** Run tests → FAIL.
- [ ] **Step 4: Implement.** `buildExtractionPrompt` embeds the spec verbatim (copy the rules from `docs/governance/_knowledge-extraction-spec.md`). `extractMeetingNote` news up `new Anthropic()` (reads `ANTHROPIC_API_KEY`), calls `messages.create({ model: 'claude-opus-4-8', max_tokens: 4000, thinking: { type: 'adaptive' }, system, messages:[{role:'user',content:user}] })`, extracts the text, runs it through `sanitize-html` (reuse the allowed-tags set from `src/lib/knowledge/normalize.ts` if present, else inline the same list), derives excerpt. Ask Claude to return clean HTML directly (h2/h3/p/ul/li/strong/em) so no markdown lib is needed. Returns `{title, bodyHtml, excerpt}`.
- [ ] **Step 5:** Run tests → PASS. `npx tsc --noEmit`.
- [ ] **Step 6:** Commit: "feat(knowledge): meeting-notes AI extraction (validated spec)".

## Task 3: Drive sync for meeting-notes → DraftArticle

**Files:** Create `src/lib/knowledge/notes-sync.ts`; Test `src/lib/knowledge/notes-sync.test.ts`.

**Interfaces:**
- `isMeetingNotesDoc(name: string): boolean` — PURE (true for "... Notes by Gemini" / "Meeting Notes ..." / "WCB ... Meeting ..."; false for TEMPLATE/WORKFLOW/announcement). Unit-tested.
- `syncMeetingNotes(deps?): Promise<{ scanned: number; new: number }>` — lists matching Google Docs, exports each to text, upserts a `DraftArticle` by `sourceDriveId` with `status:'needs_processing'` if new (does NOT overwrite a doc already processed/published). Live Google calls not unit-tested.

- [ ] **Step 1:** Failing tests for `isMeetingNotesDoc` (positive + negative cases incl. TEMPLATE/WORKFLOW exclusion).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.** Drive OAuth client (same pattern as the spike/`drive-sync`), `files.list` by name patterns, `files.export` mimeType `text/plain`, upsert draft keyed on `sourceDriveId` (skip if an existing row is already `in_review`/`published`/`rejected` — only create for genuinely new docs). Return counts.
- [ ] **Step 4:** PASS. `npx tsc --noEmit`.
- [ ] **Step 5:** Commit: "feat(knowledge): Drive meeting-notes sync → drafts".

## Task 4: Processing step (drafts → AI-extracted, in_review)

**Files:** Create `src/lib/knowledge/process-drafts.ts` (+ test for the pure status-transition helper).

**Interfaces:**
- `processPendingDrafts(deps?): Promise<{ processed: number; errored: number }>` — for each `needs_processing` draft: run `extractMeetingNote(rawText)`, store `processedHtml/processedTitle/excerpt`, set `status:'in_review'`, `processedAt`; on failure set `status:'error'` + `errorText`. Never publishes.

- [ ] **Step 1:** Failing test for a pure helper `draftToReviewFields(extract, now)` mapping extract → update fields (status 'in_review', processedAt set). (The loop itself uses a fake db + a stubbed extract fn.)
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement; dependency-inject the extract fn + db so the loop is testable without a live API call.
- [ ] **Step 4:** PASS. `npx tsc --noEmit`.
- [ ] **Step 5:** Commit: "feat(knowledge): process drafts via AI extract → in_review".

## Task 5: Cron route (sync + process, CRON_SECRET-gated)

**Files:** Create `src/app/api/cron/sync-knowledge-notes/route.ts`.

- [ ] **Step 1:** GET handler mirroring `sync-roster`: check `authorization === 'Bearer ' + CRON_SECRET`; run `await syncMeetingNotes()` then `await processPendingDrafts()`; return `{ ok, scanned, new, processed, errored }`; 500 with message on throw. `export const dynamic='force-dynamic'`, `export const maxDuration = 60` (AI calls take time). Add the schedule to `vercel.json` crons (daily) if that file exists; else note it must be added.
- [ ] **Step 2:** `npx tsc --noEmit && npx next build`.
- [ ] **Step 3:** Commit: "feat(knowledge): sync-knowledge-notes cron (sync + process)".

## Task 6: Officer review queue + publish/reject actions + Knowledge lane

**Files:** Create `src/app/members/admin/knowledge/page.tsx` (board-only queue), `src/app/members/admin/knowledge/_actions.ts` (publish/reject/edit server actions), `src/lib/knowledge/publish.ts` (pure slug + draft→Article mapping + test), and update the Knowledge lane on `src/app/members/resources/page.tsx` to list published meeting-notes articles + create `src/app/members/resources/knowledge/[slug]/page.tsx` to render one.

**Interfaces:**
- `publishDraft(draftId, officerEmail, editedHtml?, editedTitle?, deps?)` — board-only; creates an `Article` from the draft (slug from title+date, unique), sets draft `status:'published'`. `rejectDraft(draftId, deps?)` — sets `rejected`. Both mutate via server actions gated by `requireBoard()`.

- [ ] **Step 1:** Failing test for `slugForNote(title, meetingDate)` + `draftToArticle(draft, officerEmail, now)` (pure).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement `publish.ts` pure helpers; PASS.
- [ ] **Step 4:** Build the board-gated queue page: list `in_review` drafts (title, meeting date, excerpt), each opening a view with the processed HTML in an editable textarea + **Publish** and **Reject** buttons; show `error` drafts too (with a re-process option). Server actions call `requireBoard()` (mirror admin-actions), then publish/reject, then `revalidatePath`.
- [ ] **Step 5:** Knowledge lane: on `/members/resources`, replace the meeting-notes "coming soon / Drive link" with a real list of published articles (query `Article` where category='meeting-notes', newest first) linking to `knowledge/[slug]`. The `[slug]` page (login-guarded) renders `bodyHtml` cleanly (governance-body styling idiom). Keep other Drive-link categories as-is for now.
- [ ] **Step 6:** `npx tsc --noEmit && npx next build && npx vitest run`.
- [ ] **Step 7:** Commit: "feat(knowledge): officer review queue + publish + Knowledge lane".

## Task 7: Live vertical-slice run + verdict

**Files:** none (operational).

- [ ] **Step 1:** Add `ANTHROPIC_API_KEY` to Vercel env (prod + preview) if not present. Confirm `GOOGLE_*` + `CRON_SECRET` present.
- [ ] **Step 2:** Push the `DraftArticle`+`Article` tables to the live DB via the Fly tunnel (`prisma db push --skip-generate`, host rewritten to 127.0.0.1:15432, password not printed).
- [ ] **Step 3:** Run the cron locally against the live DB + real Drive + real key: `curl -H "authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/sync-knowledge-notes`. Expect it to pull the real meeting-notes docs, extract them, and leave them `in_review`.
- [ ] **Step 4:** Open the officer review queue, read an extracted note against the source, confirm it matches the spike quality (personal stuff stripped, brewing taught, template followed). Edit if needed, Publish one. Confirm it renders in the Knowledge lane for a member.
- [ ] **Step 5:** VERDICT in the ledger: pass → Phase A shipped, Phase B (workshops+recipes) greenlit. Issues → tune extract prompt/sync and re-run. Do NOT publish notes whose extract still leaks personal content.

## Self-Review
- Coverage: models (T1), AI extract per spec (T2), Drive sync (T3), processing (T4), cron (T5), review queue + publish + Knowledge lane (T6), live run (T7). Mandatory-review/no-auto-publish enforced (publish is a board action only). ✅
- Placeholders: none; extraction rules come from the committed spec.
- Consistency: `DraftArticle.sourceDriveId` upsert key; status flow needs_processing→in_review→published/rejected/error; board gate mirrors admin-actions; Article render mirrors governance bodies; login guards per-page (layout doesn't gate).
- Secrets: ANTHROPIC_API_KEY/Google/CRON_SECRET never printed; real transcripts not committed.
- Scope: MEETING NOTES only; workshops/recipes explicitly deferred to Phase B.
