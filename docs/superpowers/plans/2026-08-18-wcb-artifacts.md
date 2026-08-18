# WCB Drive Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A parallel-to-notes system for binary Drive artifacts (PDF/image/docx/pptx): scheduled Drive sync copies files into Vercel Blob → officer review queue (pick category + audience, both required) → published Artifact browsable on per-type pages, gated so members never see officers-only files.

**Architecture:** New `Artifact` + `ArtifactDraft` Prisma models (separate from Article). Reuse the Drive OAuth client from `notes-sync.ts` and the `CRON_SECRET` cron pattern. Server-side `put()` from `@vercel/blob` copies Drive files to Blob. Officer-only files served via a board-gated `/api/artifacts/[id]` route (never a raw Blob URL). Four per-type browse pages share one parameterized component. Audience is a stored per-artifact field (NOT derived), set at publish.

**Tech Stack:** Next.js 16, Prisma 6/Postgres, `googleapis` (installed), `@vercel/blob` server `put`/`del` (installed; `BLOB_READ_WRITE_TOKEN` in env), Vitest. PDF thumbnailing dependency TBD in Task 1.

## Global Constraints

- **Artifact categories (separate taxonomy, single source of truth in `src/lib/artifacts/categories.ts`):** `presentation` ("Presentation"), `technique-nugget` ("Technique Nugget"), `workshop-guide` ("Workshop Guide"), `recipe` ("Recipe"). Extensible.
- **Audience is a stored per-artifact field** `'members' | 'officers'` — NOT derived from category. Both category AND audience are REQUIRED at publish (no default); publish rejects if either missing/invalid.
- **SECURITY (critical):** members must never see or fetch an officers-only artifact — enforced server-side at (a) every per-type list query (filter by audience for non-board), (b) the single-artifact page (`notFound()` if officers-only and not board), and (c) the file-serving route (`isBoard` check before streaming). Officer-file Blob URLs are never rendered client-side.
- **Server-side Blob copy:** use `put()` from `@vercel/blob` (NOT the client `handleUpload` used by equipment photos — that's browser-side). Needs `BLOB_READ_WRITE_TOKEN` (in Vercel env).
- **No auto-publish:** publish is a board action (`requireBoard()`), like notes.
- **Drive source folders:** Workshop Guides `1_I7Po8n9d1gBCze9xphoB5cVTZrLtBhf`, Recipe Library `1b-7-hMPgU6gBNqnNmIxSNROgUILW1jwc`. Presentations + technique-nugget folders: confirm/obtain IDs during Task 6 (may be subfolders of Workshop Guides). Sync maps a folder → a default suggested category, but the officer sets the real category at review.
- **Reuse** the Drive OAuth `driveClient()` + `files.list` pattern from `src/lib/knowledge/notes-sync.ts`; the cron/`CRON_SECRET` route pattern from `sync-roster`/`sync-knowledge-notes`.
- Keep per-page login guards (members layout does not gate).

---

## Task 1: Artifact categories module + PDF-thumbnail spike

**Files:** Create `src/lib/artifacts/categories.ts` + `categories.test.ts`; throwaway `scripts/spike-pdf-thumb.mjs`.

**Interfaces:**
- Produces `ARTIFACT_CATEGORIES` ([{value,label}]), `ArtifactCategory` union, `CATEGORY_LABELS`, `isValidArtifactCategory(v): boolean`, `isValidAudience(v): v is 'members'|'officers'`.

- [ ] **Step 1:** TDD categories module — failing tests for `isValidArtifactCategory` (4 true, junk false) and `isValidAudience` ('members'/'officers' true, else false). Fail → implement → pass.
- [ ] **Step 2: PDF thumbnail spike.** Try generating a first-page PNG from a sample PDF in the Node/Vercel serverless runtime. Evaluate options: `pdfjs-dist` + a canvas, or `pdf-to-img`, or skip. Success = a small PNG buffer produced from a real PDF without native/system deps that won't run on Vercel. If NO clean pure-JS path exists in the serverless runtime, RECORD that and fall back to "generic icon for PDFs too" — do not block the feature on thumbnails. Report the decision.
- [ ] **Step 3:** `npx tsc --noEmit && npx vitest run src/lib/artifacts/categories.test.ts`. Commit categories module (+ note the thumbnail decision in the commit body).

## Task 2: Artifact + ArtifactDraft models

**Files:** `prisma/schema.prisma`; `npx prisma generate`.

- [ ] **Step 1:** Add models per the spec:
```prisma
model Artifact {
  id          String   @id @default(cuid())
  title       String
  description String?
  category    String   // presentation | technique-nugget | workshop-guide | recipe
  audience    String   // 'members' | 'officers'
  blobUrl     String
  mimeType    String
  thumbnailUrl String?
  sourceDriveId String @unique
  sizeBytes   Int?
  publishedAt DateTime @default(now())
  publishedBy String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([category])
  @@index([audience])
}
model ArtifactDraft {
  id            String   @id @default(cuid())
  sourceDriveId String   @unique
  sourceName    String
  blobUrl       String
  mimeType      String
  thumbnailUrl  String?
  sizeBytes     Int?
  suggestedCategory String?   // from the source folder mapping; officer confirms
  status        String   @default("needs_review") // needs_review | published | rejected | error
  errorText     String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([status])
}
```
- [ ] **Step 2:** `npx prisma generate`; `npx tsc --noEmit`. Do NOT db push (Task 8 live). Commit schema.

## Task 3: Drive→Blob sync (list, copy, thumbnail, upsert draft)

**Files:** Create `src/lib/artifacts/artifacts-sync.ts` + test.

**Interfaces:**
- `ARTIFACT_MIME_WHITELIST` + `isArtifactFile(mimeType)` (pure): accept pdf, png/jpg/gif/webp, docx, pptx (and Google-native? — for pptx/docx Google files, export to the Office mime; decide + document). Unit-tested.
- `syncArtifacts(deps?): Promise<{ scanned: number; created: number }>` — for each mapped folder: list files, skip any `sourceDriveId` already in ArtifactDraft OR Artifact (idempotent, no re-copy), download bytes, `put()` to Blob (public store), generate thumbnail if Task 1 enabled it, create ArtifactDraft (status needs_review, suggestedCategory from folder map, mimeType, sizeBytes, blobUrl, thumbnailUrl?). Live Drive/Blob calls not unit-tested; the pure helpers (`isArtifactFile`, folder→category map, `blobPathFor(driveId,name)`) are.

- [ ] **Step 1:** Failing tests for `isArtifactFile` (accepts the whitelist, rejects e.g. folders/video/txt) + `folderToCategory(folderId)` + `blobPathFor`. Fail → implement → pass.
- [ ] **Step 2:** Implement `syncArtifacts` reusing `driveClient()`; download via `drive.files.get({alt:'media'})` for binary (or `files.export` for Google-native docs), `put(path, bytes, { access:'public', token: process.env.BLOB_READ_WRITE_TOKEN })`. Skip-existing before any download.
- [ ] **Step 3:** `npx tsc --noEmit && npx vitest run`. Commit.

## Task 4: publish/reject actions (board-gated, category+audience required)

**Files:** Create `src/app/members/admin/knowledge/_artifact-actions.ts`; pure `src/lib/artifacts/publish.ts` + test.

**Interfaces:**
- `draftToArtifact(draft, category, audience, title, description, officerEmail, now)` (pure) → Artifact create fields. Tested.
- `publishArtifactAction(draftId, { title, description, category, audience })` — requireBoard; validate category via isValidArtifactCategory AND audience via isValidAudience (reject BEFORE any write if either invalid/missing); create Artifact, set draft status published; revalidate. `rejectArtifactAction(draftId)`; `reprocessArtifactAction(draftId)`.

- [ ] **Step 1:** Failing tests for `draftToArtifact` mapping + a guard test that missing/invalid category or audience yields no Artifact. Fail → implement → pass.
- [ ] **Step 2:** Implement the server actions mirroring the notes `_actions.ts` requireBoard pattern.
- [ ] **Step 3:** `npx tsc --noEmit && npx vitest run`. Commit.

## Task 5: review queue — Artifacts section

**Files:** Modify `src/app/members/admin/knowledge/page.tsx` (query ArtifactDraft needs_review/error too); create `src/components/members/ArtifactQueue.tsx` (client).

- [ ] **Step 1:** Page: also fetch `artifactDrafts` (needs_review + error), pass to `<ArtifactQueue>` under a new "Artifacts awaiting review" heading below the notes section.
- [ ] **Step 2:** ArtifactQueue row: thumbnail/preview + filename, editable title + description, REQUIRED category `<select>` (ARTIFACT_CATEGORIES) + REQUIRED audience toggle (All members / Officers only), Publish (disabled until both chosen) → `publishArtifactAction`, Reject, and Re-process for error rows.
- [ ] **Step 3:** `npx tsc --noEmit && npx next build`. Commit.

## Task 6: cron sync route + folder mapping

**Files:** Create `src/app/api/cron/sync-artifacts/route.ts`; add to `vercel.json` crons.

- [ ] **Step 1:** GET route mirroring `sync-knowledge-notes`: CRON_SECRET bearer check, `dynamic='force-dynamic'`, `maxDuration=60`, call `syncArtifacts()`, return `{ ok, scanned, created }`, 500 on throw.
- [ ] **Step 2:** Define the folder→suggestedCategory map in `artifacts-sync.ts` (Workshop Guides folder → workshop-guide; Recipe Library → recipe; confirm/obtain presentation + technique-nugget folder IDs — if they're subfolders, the walk should recurse and map by subfolder name). Add the cron entry (e.g. `0 6 * * *`, offset from the others).
- [ ] **Step 3:** `npx tsc --noEmit && npx next build`. Commit.

## Task 7: browse pages (per-type, gated) + file-serving route + Resources link

**Files:** Create `src/app/members/resources/presentations/page.tsx`, `.../recipes/page.tsx`, `.../technique-nuggets/page.tsx`, `.../workshop-guides/page.tsx` (thin wrappers over a shared `src/components/members/ArtifactLibrary.tsx`); `src/app/members/resources/artifacts/[id]/page.tsx` (single view); `src/app/api/artifacts/[id]/route.ts` (gated file stream for officer files); modify `src/app/members/resources/page.tsx` (Library grouping links).

- [ ] **Step 1:** Shared `ArtifactLibrary({ category })` server component: `const isBoard = !!session.user.isBoard`; query `Artifact where { category, ...(isBoard ? {} : { audience: 'members' }) }`; render a card grid (thumbnail via Task-1 logic, title, "Officers only" badge when applicable, link to single view). Login-guard each page.
- [ ] **Step 2:** Single-artifact page `artifacts/[id]`: load artifact; **`notFound()` if `artifact.audience === 'officers' && !isBoard`** (direct-link gate); render per mimeType — image inline, PDF embedded viewer, docx/pptx → thumbnail + Download; the file src for officer artifacts = `/api/artifacts/[id]` (never the raw blobUrl); for member artifacts the direct blobUrl is fine.
- [ ] **Step 3:** File route `GET /api/artifacts/[id]`: load artifact; if `audience==='officers'` require `session.user.isBoard` (else 403/404); stream/redirect to the Blob bytes. (Members hitting an officer id → 404.)
- [ ] **Step 4:** Resources landing: add a "Library" grouping linking the four per-type pages (counts optional, gated to viewer). No orphan pages.
- [ ] **Step 5:** `npx tsc --noEmit && npx next build && npx vitest run`. Commit.

## Task 8: live — db push + first sync + verify gating (PAUSE for user)

- [ ] **Step 1:** `prisma db push` (tunnel) for Artifact + ArtifactDraft.
- [ ] **Step 2:** Run `sync-artifacts` against real Drive folders; confirm files copy to Blob + drafts appear in the queue.
- [ ] **Step 3:** Publish one member artifact + one officer artifact via the queue (pick category+audience). Verify: member-scoped query hides the officer one; a direct link to the officer artifact as a non-board session → notFound; `/api/artifacts/[officer id]` without board → 403/404; member artifact renders/downloads.
- [ ] **Step 4:** Verdict in ledger.

## Self-Review
- Coverage: categories+thumb spike (T1), models (T2), sync+copy (T3), publish req category+audience (T4), review queue section (T5), cron+folders (T6), gated browse+file route (T7), live (T8). ✅
- Security: audience stored + required; server-side gate at list query, single page notFound, and file route isBoard; officer blob URL never rendered. Publish rejects missing category/audience before write.
- No placeholders except the two flagged folder IDs (presentation/technique-nugget) resolved in T6 and the thumbnail approach resolved in T1.
- Reuse: driveClient, cron pattern, requireBoard, @vercel/blob — all existing.
