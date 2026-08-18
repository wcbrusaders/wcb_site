# WCB Artifacts v2 — docx→PDF view-only + AI titles + Presentations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix the "viewing a document opens an editor" bug and improve artifact usability: (1) convert Office files (docx/pptx / Google Docs & Slides) to PDF via Drive export on sync so they render inline READ-ONLY (fallback: forced download, never an editor); (2) AI-generate a real title + description by reading each file's content; (3) wire the Presentations Drive folder into the sync.

**Architecture:** Extends the existing artifact sync (`src/lib/artifacts/artifacts-sync.ts`). Reuses the Drive API (already authenticated with drive.readonly) to export Office/Google files to `application/pdf`. Reuses the Anthropic SDK (already installed, `ANTHROPIC_API_KEY` in Vercel) to title/describe from extracted text. Adds `renderedPdfUrl`/title/description handling to the Artifact model + render. Presentations folder id added to the sync config.

**Tech Stack:** Next.js 16, Prisma 6, googleapis (Drive export), @anthropic-ai/sdk (installed), @vercel/blob, unpdf (already used for thumbnails — also gives us page-1 text for AI titling), Vitest.

## Global Constraints

- **No member-facing editor, ever.** After this change, an Office artifact is served as a PDF (inline read-only) OR as a forced download (`Content-Disposition: attachment`) — never a link that opens Google Docs/Office-online/an editor. Applies to member AND the gated officer file route.
- **Drive-export conversion (no LibreOffice / no paid API):** on sync, for Office/Google-native files, request a PDF export from Drive (`files.export` for Google-native; `files.get` alt=media won't convert — for uploaded .docx use Drive's export capability / copy-to-Google-then-export, see Task 2 for the exact mechanism). Store the resulting PDF in Blob as the artifact's rendered form. If export fails, keep the original + mark it download-only.
- **AI titling reads content** (Opus/Sonnet — pick a cheap-but-good tier; volume is tiny). Reads extracted text (PDF text via unpdf; for converted Office, the exported PDF's text). Produces `{ title, description }`. Officer still confirms/edits at review — AI output is a suggestion stored on the draft.
- **Presentations folder:** `1UC-9_tfmi3RDLUcAHB92w9ZcQJZG95c8` → category `presentation`. Add to `ARTIFACT_FOLDER_IDS` + `FOLDER_TO_CATEGORY`.
- **Idempotent** re-sync preserved (skip existing sourceDriveId). Existing 8 drafts: re-title/convert them via a one-time backfill in the live task (Task 6), or leave for officer to handle — decide in Task 6.
- Board-gating, no-auto-publish, audience model all UNCHANGED.

## Task 1: schema — rendered PDF + AI title/description fields

**Files:** `prisma/schema.prisma`; `npx prisma generate`.

- [ ] Add to `Artifact`: `renderedPdfUrl String?` (the inline-viewable PDF; null → download-only original). Add to `ArtifactDraft`: `renderedPdfUrl String?`, `suggestedTitle String?`, `suggestedDescription String?`, `viewable Boolean @default(false)` (true when a PDF rendition exists / native PDF/image). (title/description on the published Artifact already exist.)
- [ ] `npx prisma generate`; `npx tsc --noEmit`. No db push (Task 6). Commit.

## Task 2: Drive → PDF conversion helper

**Files:** extend `src/lib/artifacts/artifacts-sync.ts` (+ tests for pure parts).

- [ ] Add `needsPdfConversion(mimeType): boolean` (pure, tested): true for docx, pptx, google-doc, google-slides; false for pdf/images.
- [ ] Add `exportToPdf(drive, fileId, sourceMime): Promise<Buffer | null>` — for Google-native docs/slides: `drive.files.export({fileId, mimeType:'application/pdf'})`. For uploaded .docx/.pptx: Drive can't `export` a non-native file directly; use the documented approach — `drive.files.copy` into a Google-native type (or `files.get` with conversion) then export to PDF then delete the temp copy; if any step fails return null. Wrap in try/catch → null on failure. (Research the exact copy+export mechanism; keep it read-only-safe — clean up any temp copy in a finally.)
- [ ] In the sync loop: if `needsPdfConversion`, try `exportToPdf`; on success store the PDF in Blob as `renderedPdfUrl`, set `viewable=true`, and use the PDF bytes for thumbnail + AI text; on failure keep original, `renderedPdfUrl=null`, `viewable=false`. Native PDFs/images: `viewable=true`, renderedPdfUrl = blobUrl (pdf) / null (image, shown inline anyway).
- [ ] `npx tsc --noEmit && npx vitest run`. Commit.

## Task 3: AI title + description from content

**Files:** create `src/lib/artifacts/describe.ts` (+ test for the prompt builder).

- [ ] `buildArtifactDescribePrompt(textExcerpt, filename): {system,user}` (pure, tested) — instruct: given a document's text (+ its filename as a hint), return a concise real TITLE (proper-case, human-readable, e.g. a beer/recipe name or talk title) and a 1-sentence DESCRIPTION. Output as `TITLE: ...\nDESCRIPTION: ...`. Invent nothing beyond what the text supports; if unclear, base title on filename.
- [ ] `describeArtifact(textExcerpt, filename, deps?): Promise<{title, description}>` — Anthropic call (model: claude-sonnet-5 is fine for this — cheap, plenty capable; use streaming if max_tokens is high, but this is small so a normal call is OK; keep it modest max_tokens ~500). Parse TITLE/DESCRIPTION. Fallback to a cleaned filename if the call fails.
- [ ] In sync: extract a text excerpt (unpdf text of the PDF/rendered PDF; for images, skip AI text and title from filename), call describeArtifact, store `suggestedTitle`/`suggestedDescription` on the draft.
- [ ] `npx tsc --noEmit && npx vitest run`. Commit.

## Task 4: review queue + render use the new fields

**Files:** `src/components/members/ArtifactQueue.tsx`; `src/app/members/resources/artifacts/[id]/page.tsx`; `src/app/api/artifacts/[id]/route.ts`; publish action/mapping (`_artifact-actions.ts` / `publish.ts`).

- [ ] Queue: prefill the Title field with `suggestedTitle ?? sourceName` and Description with `suggestedDescription`. Show the thumbnail. Publish carries renderedPdfUrl + viewable through to the Artifact (extend draftToArtifact + publishArtifactAction to persist renderedPdfUrl/viewable/title/description).
- [ ] Single view: choose the source to render — if `renderedPdfUrl` exists → embed it inline (read-only PDF viewer); else if native PDF → embed blobUrl; else if image → inline; else (no rendition) → **download-as-attachment only, no inline editor**. NEVER render a Google Drive/editor URL.
- [ ] File route: when serving a non-viewable original for download, set `Content-Disposition: attachment` so the browser downloads (never hands it to an inline editor). Keep the officer isBoard gate. Serve renderedPdfUrl for viewable officer artifacts.
- [ ] `npx tsc --noEmit && npx next build && npx vitest run`. Commit.

## Task 5: wire the Presentations folder

**Files:** `src/lib/artifacts/artifacts-sync.ts`.

- [ ] Add `1UC-9_tfmi3RDLUcAHB92w9ZcQJZG95c8` to `ARTIFACT_FOLDER_IDS` and map it → `presentation` in `FOLDER_TO_CATEGORY`. (Recurses already.)
- [ ] `npx tsc --noEmit`. Commit.

## Task 6: live — db push + re-sync + backfill existing + verify (PAUSE for user)

- [ ] `prisma db push` (tunnel) for the new fields.
- [ ] Decide existing-8 handling: reset the current `needs_review` drafts so a re-sync re-processes them with conversion + AI titles (they were created before this), OR backfill title/description/renderedPdfUrl in place. Simplest: delete the un-reviewed drafts + let the (idempotent) sync recreate them with the new pipeline. (Published artifacts, if any, handled separately.)
- [ ] Trigger the deployed sync; confirm: docx artifacts now have a renderedPdfUrl + viewable=true (or download-only fallback if export failed), AI titles/descriptions populated, Presentations folder file appears.
- [ ] Verify in-browser: a docx artifact renders as read-only PDF (no editor opens); a non-convertible one downloads (attachment). Officer gating still holds.
- [ ] Verdict in ledger.

## Self-Review
- Coverage: schema (T1), docx→PDF conversion (T2), AI titles (T3), queue+render+route use them + download-as-attachment (T4), presentations folder (T5), live (T6). ✅
- The view-in-editor bug is fixed by: convert to PDF → inline read-only; non-convertible → forced download, never an editor URL. No Drive/editor URL ever rendered to a member.
- Reuse: Drive API, Anthropic SDK, unpdf, blob — all present. Board-gating/audience unchanged.
- Open: exact Drive copy+export mechanism for uploaded .docx (Task 2 research); AI model tier (sonnet-5 default).
