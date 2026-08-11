# WCB Equipment Photos — Design

**Date:** 2026-08-11
**Status:** Approved (brainstorming) → ready for implementation plan
**Scope:** `wcb_site` — let members add a photo to an equipment item so the catalog shows real pictures. Additive to the live lending feature; equipment-only.

## Problem

The lending system is live; equipment items have no images (books show ISBN-derived covers, equipment shows nothing). A member asked to be able to snap/upload a photo of a piece of equipment so others recognize it. The lending design deliberately used ZERO image storage, so this introduces the first file-storage + upload path — and the first member *write* into the shared catalog (today only board edits item data; members only check out/return).

## Key decisions (locked in brainstorming)

- **Storage:** Vercel Blob (`@vercel/blob`) — native to the platform; public blobs; the item stores only the resulting URL string. New env `BLOB_READ_WRITE_TOKEN` (auto-provided when Blob is enabled on the Vercel project).
- **Model:** add `photoUrl String?` to `LoanableItem` (additive, nullable, equipment-only in practice; books keep `coverUrl(isbn)`).
- **One photo per item** (single `photoUrl`; a gallery is a clean later addition, out of scope now).
- **Permission — members ADD-ONLY (when no photo exists); board changes/removes.** A logged-in member may add a photo ONLY to an item whose `photoUrl` is null (first photo wins); members may NOT replace/overwrite an existing photo. Board members may replace (overwrite) or remove any photo — the moderation + fix lever. Enforced server-side, never trusting the client. This is the first member write into the catalog; keeping it add-only avoids overwrite-wars and photo-swapping.
- **Client preview + confirm (uploader self-approves).** After picking/snapping, the member sees a downscaled preview with "Use this photo" / "Retake". NOTHING uploads until they confirm; Retake discards the candidate in-browser. No pending/approval queue, no officer in the loop (consistent with the trust-based self-checkout model). Blob only ever receives a confirmed photo (no orphan blobs from abandoned attempts).
- **Capture:** a file input with `accept="image/*"` + the `capture` hint → on phones offers Take Photo OR Photo Library; on desktop a file picker. (The `capture` hint is a request, not a guarantee; the file-pick fallback works everywhere, so no one is ever blocked.)
- **Client downscale before upload:** resize to ~1600px long-edge, re-encode JPEG (~0.85) via canvas — a 24MP/~10MB phone shot → ~200–400KB. This also converts iPhone HEIC→JPEG so it renders. (24MP JPEGs are commonly 5–12MB, so downscaling — not a raw size cap — is the right fix.) Safety cap ~20MB on the *pre-downscale* input; the Blob token's `maximumSizeInBytes` can be modest (~5MB) since uploads arrive already-small.

## Out of scope

- Multiple photos / gallery (one photo per item for now).
- A pending/approval moderation queue (client preview + board-remove is the model instead).
- Photos for books (they keep ISBN covers).
- Per-photo uploader attribution (`uploadedBy`) — YAGNI; add if abuse appears.

## Data model (Prisma — additive)

Add one nullable column to `LoanableItem`:
- `photoUrl String?` — the Vercel Blob public URL of the equipment photo, or null.

Additive, backward-compatible. Doesn't touch `Copy`/`Loan`/the gate/anything shipped. `prisma db push` applies it.

## Architecture

**Upload flow — Vercel Blob client-upload with a server-authorized token** (the documented @vercel/blob pattern; the file bytes never pass through our serverless function, avoiding body-size/timeout limits; auth is enforced at token-issue AND at the DB write):

1. Member taps "Add photo" on an equipment card → picks/snaps an image.
2. Browser runs `downscaleImage(file)` (canvas resize→JPEG) and shows a **preview** with "Use this photo" / "Retake". Retake discards the candidate (a local object-URL; nothing uploaded).
3. On "Use this photo": the browser calls `@vercel/blob/client` `upload()`, which hits our route `POST /api/members/equipment/photo`. That route's `handleUpload` authenticates the session (must be a logged-in member with a `memberId`) and returns a signed token restricted to image content-types + ~5MB. A non-member cannot obtain a token. **Note:** the token route enforces only "is a logged-in member" — it deliberately does NOT enforce the per-item add-only rule (it has no item context, and a stored blob with no attached item is harmless/collectable). The per-item permission (member-only-if-empty, equipment-only) is enforced authoritatively in `setItemPhotoAction` (step 5). Obtaining a token ≠ being allowed to set the photo.
4. Blob stores the (already-downscaled) file and returns a public URL.
5. Browser calls server action `setItemPhotoAction(itemId, url)` → **the real permission gate**: allow if `isBoard`, OR if the actor is a member AND the item currently has no `photoUrl`; reject otherwise; also assert the item is `category === 'equipment'`. On a board *replace*, delete the old blob (`del(oldUrl)`). Sets `photoUrl`, revalidates the equipment page.
6. Board **remove:** `removeItemPhotoAction(itemId)` → `requireBoard()`, `del(photoUrl)`, null the field.

**Files:**
- `prisma/schema.prisma` — `+photoUrl String?` on `LoanableItem`.
- `src/lib/lending.ts` (framework-free) — `photoUrl` on `TitleView` + returned by `listTitles`; pure guard `canSetPhoto({ isBoard, hasPhoto }): boolean` (board → true; member → true only when `!hasPhoto`). Unit-tested.
- `src/lib/image.ts` (new, client util) — `downscaleImage(file: File): Promise<Blob>` (canvas resize to ~1600px long-edge → JPEG ~0.85; rejects non-decodable input). Browser Canvas API.
- `src/app/api/members/equipment/photo/route.ts` — `handleUpload` token issuer, gated on a logged-in member session + image types + size.
- `src/app/members/_actions/lending-actions.ts` — `setItemPhotoAction(itemId, url)` (uses `canSetPhoto` + equipment-only + board-replace-deletes-old), `removeItemPhotoAction(itemId)` (`requireBoard` + `del` + null). Both re-check the session server-side.
- `src/components/members/TitleCard.tsx` — thumbnail/placeholder for equipment; the candidate→preview→confirm interaction; "Add photo" (member, only when no photo), "Replace"/"Remove" (board).

## UI / display

- Equipment card shows `photoUrl` as a thumbnail (`object-cover rounded bg-card-bg`, landscape-ish, e.g. `w-28 h-20`); a subtle placeholder tile when null (graceful-blank, never a broken `<img>`). Plain `<img>` with the existing `eslint-disable no-img-element` note (external Blob URL; next/image not worth it), consistent with book covers.
- **Add photo** button: shown to any logged-in member **only when the card has no photo**. Tapping opens the file input; after select, a **preview + "Use this photo"/"Retake"**; on confirm, upload→action. In-progress ("Uploading…") + inline error states reuse the card's `useTransition`/`err` pattern; controls disabled during upload.
- **Replace / Remove** buttons: shown only to board (`isBoard`), on cards that have a photo.
- Equipment cards only; book library untouched; grouped equipment page + jump-nav unaffected (this only adds to what a `TitleCard` renders).

## Error handling & edge cases

- **Non-member obtaining an upload token** → route rejects at `handleUpload` (no `memberId` → no token).
- **Member trying to overwrite an existing photo** → `setItemPhotoAction` rejects (`canSetPhoto` false when member + hasPhoto); the UI also hides the control once a photo exists. Belt + suspenders.
- **Photo attached to a book** → `setItemPhotoAction` asserts `category === 'equipment'` → reject. (UI never shows the control on book cards, which live on the untouched library page anyway.)
- **Un-decodable / non-image file** → `downscaleImage` rejects → "couldn't process that image," no upload.
- **Oversize pre-downscale input** (>~20MB) → rejected client-side with a clear message before processing.
- **Abandoned attempt** (Retake / navigate away before confirm) → nothing uploaded (preview is a local object-URL); no orphan blob.
- **Board replace** → old blob deleted (`del`) so blobs don't accumulate; member path never replaces so never orphans.
- **HEIC** (iPhone) → the canvas downscale re-encodes to JPEG so it displays.
- **Blob/network failure on upload** → inline "upload failed — try again," `photoUrl` unchanged.

## Testing (TDD)

- **`canSetPhoto`** (framework-free, pure): board+hasPhoto → true; board+no-photo → true; member+no-photo → true; **member+hasPhoto → false** (the load-bearing overwrite-block). Mutation-resistant.
- **`setItemPhotoAction` guard** (DI'd-fake pattern like the other actions where feasible): member rejected when a photo already exists; member allowed when none; board allowed regardless; a book item rejected (equipment-only); board-replace triggers old-blob delete.
- **`listTitles`** returns `photoUrl` (extend existing test).
- **`downscaleImage`**: canvas is awkward headless — test the wiring + guard branches (rejects a non-image; resolves a Blob for a valid image via a jsdom/canvas stub); pixel-output not asserted (noted).
- **Verification bar:** `tsc --noEmit` clean, `vitest run` green, `npm run build` compiles. Blob-dependent paths (real token/upload) need the env token → verified at deploy.
- **Post-deploy smoke:** as a member, add a photo to a photo-less equipment item (snap on phone + upload from library both) → shows; confirm a member canNOT change an item that already has a photo (no control / server rejects); as board, replace + remove a photo.

## Success criteria

- A logged-in member can add a photo (snap on mobile or pick a file) to an equipment item that has none; a preview lets them Retake before it commits; on confirm it uploads and appears on the card.
- A member cannot overwrite or remove an existing photo; board can replace or remove any (server-enforced, not just UI).
- Photos downscale in-browser (any 24MP phone shot works; HEIC displays); Blob stores small files; no orphan blobs.
- Equipment-only; books/library, checkout/return/renew, grouping, and jump-nav all unchanged.
- `canSetPhoto` (+ the action guard) are unit-tested; the overwrite-block and equipment-only guard are the load-bearing tested cases.
