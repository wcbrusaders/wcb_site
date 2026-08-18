# WCB Drive Artifacts (Presentations, Guides, Recipes) — Design

**Status:** Approved design · pending implementation plan
**Date:** 2026-08-18

## Purpose

The club has a large body of **binary knowledge artifacts** on Google Drive — presentations, workshop guides, technique-nugget handouts, recipes — in **PDF, image, and docx/pptx** formats. Unlike meeting-notes (text transcripts the AI extracts), these are **files members view and download**, not text to summarize. This feature makes them a first-class, browsable, gated part of the members Resources area.

It runs **parallel** to the meeting-notes pipeline: same backbone (Drive sync → draft → officer review → publish), a **separate taxonomy and data model**, and a **file-viewer** render instead of an article body.

## Content model

### Separate taxonomy (distinct from note categories)
Artifact categories: **Presentation · Technique Nugget · Workshop Guide · Recipe**. (Extensible — a single source of truth module like the notes `categories.ts`.) These are deliberately separate from note categories (meeting/event/board/…) — an artifact is a different kind of thing than a meeting note.

### Audience is per-artifact and independent of category
"Some presentations are officer-only, but not all." So **category and audience are two independent choices** made by the officer at approval:
- **Category:** one of the four (required).
- **Audience:** `all-members` or `officers-only` (required — **no default**; publish is blocked until BOTH are chosen, so nothing is exposed by an unchanged default).

This differs from notes (where audience derives from category) — artifacts need per-file audience control.

## Storage & source of truth

- **Drive stays the authoring source.** A scheduled sync **copies** each artifact file into **Vercel Blob** (the store already used for equipment photos). The site serves its own copy — fast, embeddable, resilient to Drive changes.
- **Member-audience files:** stored in the existing **public** Blob store; served via their direct public Blob URL (fine — public content).
- **Officer-audience files:** served through a **gated app route** `GET /api/artifacts/[id]` that checks `session.user.isBoard` and streams the bytes. The raw Blob URL for an officer file is **never exposed** in markup. (Even though the underlying store is public, the officer file's URL is not discoverable through the site, and the route enforces board-only access to the streamed bytes.) *Implementation note: to be robust, officer files should ideally live behind a non-guessable path or a private store; at minimum the gated route is the access point and no officer Blob URL is rendered client-side. Revisit a private store if stronger guarantees are wanted.*

## Pipeline (parallel to notes)

```
Drive artifact folders
   │  cron sync (reuses Drive OAuth from notes pipeline)
   │  detects new/changed files, copies each into Vercel Blob,
   │  generates a thumbnail where possible (below)
   ▼
ArtifactDraft (status: needs_review)   — title (from filename), blobUrl, mimeType, thumbnailUrl?, sourceDriveId
   │  officer review queue (shared with notes — see below)
   │  officer sets CATEGORY + AUDIENCE (both required), edits title/description
   ▼  Publish (board action, no auto-publish)
Artifact (published) → per-type browse page
```

Idempotent sync: skip a `sourceDriveId` that already exists in any status (don't re-copy/re-review published/rejected files); re-copy only when the Drive file changes (by modifiedTime), landing as a new draft or flagged update (decide in plan).

## Thumbnails
- **Images:** the image itself is the thumbnail.
- **PDF:** generate a first-page thumbnail image on sync, store in Blob.
- **docx/pptx and anything else:** a generic file-type icon (PDF/DOC/PPT/IMG) — no generation.

## Rendering (member view of one artifact)
- **Images:** shown inline.
- **PDF:** embedded in-browser viewer (iframe / pdf.js).
- **docx/pptx:** title + thumbnail/icon + **Download** button (browsers can't render Office natively).
- **All artifacts:** a Download/Open action.
- Officer-only artifacts render via the gated `/api/artifacts/[id]` route, not a raw Blob URL.

## Browse surfaces (per-type pages)
Each artifact type gets its own filterable card-grid page, all under Resources:
- `/members/resources/presentations`
- `/members/resources/technique-nuggets`
- `/members/resources/workshop-guides`
- `/members/resources/recipes`

Each: server-side gated so a non-board member's query returns only `all-members` artifacts of that type; officer viewers additionally see officers-only ones (badged). Each page is **linked from the Resources landing** (a "Library" grouping of the four) — no orphan pages. Cards show thumbnail + title + audience badge (if officer-only) + open/download.

**Direct-link safety:** the single-artifact view and the gated file route both re-check audience server-side — a member with a direct link/URL to an officers-only artifact gets `notFound()` / 403, never the bytes.

## Officer review queue (shared)
Extend the existing `/members/admin/knowledge` page into **two sections**: "Meeting notes awaiting review" and "Artifacts awaiting review." Artifact rows show a preview (thumbnail), the filename/title, editable title + description, a **required category** dropdown, a **required audience** toggle, and Publish / Reject. One place officers check for anything pending.

## Data model (new, separate from Article/DraftArticle)
```
Artifact {
  id, title, description?, category (4-value), audience ('members'|'officers'),
  blobUrl, mimeType, thumbnailUrl?, sourceDriveId, sizeBytes?,
  publishedAt, publishedBy, createdAt, updatedAt
  @@index([category]) @@index([audience])
}
ArtifactDraft {
  id, sourceDriveId (unique), sourceName, blobUrl, mimeType, thumbnailUrl?,
  status ('needs_review'|'published'|'rejected'|'error'),
  suggestedTitle?, errorText?, createdAt, updatedAt
  @@index([status])
}
```
(Category/audience live on the published `Artifact`, chosen at review — the draft doesn't carry them, mirroring how note drafts carry null category until publish.)

## Reuse from the notes build
- Drive OAuth client + folder-walk (from `notes-sync.ts`).
- The cron/`CRON_SECRET` pattern; add the artifact sync to the same or a sibling cron route.
- The audience-gating *pattern* (server-side category/audience filter + `notFound` on direct links) — but artifact audience is a stored field, not derived.
- `requireBoard()` for all publish/reject/mutations.
- Vercel Blob client (`@vercel/blob`) already installed.

## Security requirements (critical)
- Members must never see or fetch an officers-only artifact — not on any per-type page, not the single view, not the file bytes. Enforced server-side at: the list query (audience filter by viewer), the single-artifact page (`notFound` if officers-only + not board), and the file route (`isBoard` check before streaming).
- Publish requires BOTH category and audience (no default) — no accidental exposure.
- All publish/reject/sync-trigger paths board-gated.

## Non-goals / later
- Office→PDF conversion for uniform embedding (deferred; docx/pptx = download for now).
- Full-text search inside artifacts (deferred).
- Versioning of re-synced files (decide minimal behavior in plan: update-in-place vs new draft).

## Open items for the plan
- Exact sync change-detection (modifiedTime) + whether a changed published file re-enters review.
- PDF first-page thumbnail generation approach (library/runtime; spike if risky).
- Whether the four per-type pages share one component parameterized by type (recommended) vs four near-duplicates.
