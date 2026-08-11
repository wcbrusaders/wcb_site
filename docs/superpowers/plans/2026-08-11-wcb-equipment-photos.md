# WCB Equipment Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let members add a photo to an equipment item (snap-or-upload, with an in-browser preview+retake before it commits), stored in Vercel Blob; members add-only when no photo exists, board replaces/removes.

**Architecture:** `photoUrl` column on `LoanableItem`; a pure `canSetPhoto` permission guard + a `downscaleImage` client util; Vercel Blob **client-upload** (browser → auth-gated token route → Blob, file bytes never touch our function); two server actions (`setItemPhotoAction` with the real per-item gate + board-replace-deletes-old, `removeItemPhotoAction` board-only); TitleCard gains a thumbnail + a candidate→preview→confirm upload flow. Additive; equipment-only; books/library untouched.

**Tech Stack:** Next.js 16 (App Router, server components + actions + route handler) + React 19 + TypeScript, Prisma 6 + Postgres (Fly), `@vercel/blob` (installed), Tailwind v4, Vitest.

## Global Constraints

- **Branch:** `feat/equipment-photos` (already created off the freshly-merged `main`). `@vercel/blob` is already installed.
- **Additive only:** new nullable column + new files + additions to TitleCard/lending.ts/actions. Do NOT change checkout/return/renew/atomic-claim/grouping/board-auth logic, or the books/library page.
- **Storage:** Vercel Blob. New env `BLOB_READ_WRITE_TOKEN` (auto-set when Blob is enabled on the Vercel project — a deploy step; the token route + `del` read it from env automatically, no code reference needed).
- **Permission (member ADD-ONLY when empty; board changes/removes) — enforced server-side, never client-trusted:**
  - Pure guard `canSetPhoto({ isBoard, hasPhoto })`: board → true; member → true ONLY when `!hasPhoto`.
  - `setItemPhotoAction` is the authoritative per-item gate: `auth()` → allow if `canSetPhoto(...)` AND item is `category === 'equipment'`; else reject. On a board replace (item already had a photo), delete the old blob.
  - `removeItemPhotoAction` → `requireBoard()` + `del` + null the field.
  - The token route enforces ONLY "is a logged-in member" (it has no item context; a stray unattached blob is harmless). Obtaining a token ≠ being allowed to set the photo.
- **Vercel Blob API (verified against the installed package — use exactly these):**
  - `handleUpload` + `upload` are imported from **`@vercel/blob/client`** (NOT the root). `del` is from **`@vercel/blob`** (root).
  - `onBeforeGenerateToken(pathname, clientPayload, multipart)` returns `{ allowedContentTypes, maximumSizeInBytes }` (+ optional `addRandomSuffix`).
  - Client: `upload(pathname, file, { access: 'public', handleUploadUrl })` → returns `{ url }`.
- **Downscale (client):** `downscaleImage(file)` → resize to ~1600px long-edge, JPEG ~0.85, via canvas; rejects non-decodable input. Converts HEIC→JPEG as a side effect. Accept up to ~20MB pre-downscale; token `maximumSizeInBytes` ~5MB (post-downscale is tiny). `allowedContentTypes: ['image/jpeg','image/png','image/webp']`.
- **Preview+confirm:** on file select, downscale → show a local preview (`URL.createObjectURL`) with "Use this photo"/"Retake"; upload ONLY on confirm (no orphan blobs from abandoned attempts).
- **Equipment only:** photo controls render only on equipment cards; book library untouched.
- **Styling:** house Tailwind idiom (thumbnail `object-cover rounded bg-card-bg`; buttons match existing card action buttons). No UI kit.
- **Verification bar per task:** `npx tsc --noEmit` clean, `npx vitest run` green; UI/route tasks also `npm run build`. Framework-free tests with DI'd fakes where possible. `prisma db push` + Blob-token paths are deploy steps — implementers SKIP them (no dev DB / no token), noting the skip.

---

### Task 1: Schema — `photoUrl` column

**Files:** Modify `prisma/schema.prisma` (`LoanableItem`). No test.

- [ ] **Step 1: Add the field** — inside `model LoanableItem`, after `subcategory String?`:

```prisma
  photoUrl    String?  // Vercel Blob URL of the equipment photo, or null
```

- [ ] **Step 2:** `npx prisma generate` (succeeds; `photoUrl` on client).
- [ ] **Step 3:** `npx tsc --noEmit` clean.
- [ ] **Step 4:** SKIP `npx prisma db push` (no dev DB) — note in report.
- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(lending): photoUrl column on LoanableItem"
```

---

### Task 2: `photoUrl` on TitleView + `canSetPhoto` guard

**Files:** Modify `src/lib/lending.ts`; Test `src/lib/lending.test.ts`.

**Interfaces produced:**
- `TitleView` gains `photoUrl: string | null`; `listTitles` returns it.
- `export function canSetPhoto(opts: { isBoard: boolean; hasPhoto: boolean }): boolean`.

- [ ] **Step 1: Write the failing test** — append to `src/lib/lending.test.ts`:

```typescript
import { canSetPhoto } from './lending'

test('canSetPhoto: board can always; member only when no photo', () => {
  expect(canSetPhoto({ isBoard: true, hasPhoto: true })).toBe(true)
  expect(canSetPhoto({ isBoard: true, hasPhoto: false })).toBe(true)
  expect(canSetPhoto({ isBoard: false, hasPhoto: false })).toBe(true)
  expect(canSetPhoto({ isBoard: false, hasPhoto: true })).toBe(false) // member cannot overwrite
})

test('listTitles: returns photoUrl on each title', async () => {
  const rows = [{ id:'i1', category:'equipment', title:'Kettle', description:null, author:null, isbn:null, notes:null, subcategory:'Other', photoUrl:'https://blob/x.jpg',
    copies:[{ id:'c1', status:'available', loans:[] }] }]
  const db = { loanableItem: { findMany: async () => rows } } as any
  const out = await listTitles('equipment', 'me', {}, { db })
  expect(out[0].photoUrl).toBe('https://blob/x.jpg')
})
```

- [ ] **Step 2:** `npx vitest run src/lib/lending.test.ts` → FAIL (missing export / field).

- [ ] **Step 3a: Add `photoUrl` to `TitleView`** (after `subcategory`): `photoUrl: string | null`.

- [ ] **Step 3b: Return it in `listTitles`** — in the pushed view object (alongside `subcategory`): `photoUrl: r.photoUrl ?? null,`.

- [ ] **Step 3c: Add the guard** to `src/lib/lending.ts`:

```typescript
export function canSetPhoto(opts: { isBoard: boolean; hasPhoto: boolean }): boolean {
  return opts.isBoard || !opts.hasPhoto
}
```

- [ ] **Step 4:** `npx vitest run src/lib/lending.test.ts` → PASS (new + prior). `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lending.ts src/lib/lending.test.ts
git commit -m "feat(lending): photoUrl on TitleView + canSetPhoto guard"
```

---

### Task 3: `downscaleImage` client util

**Files:** Create `src/lib/image.ts`; Test `src/lib/image.test.ts`.

**Interfaces produced:** `export async function downscaleImage(file: File, maxEdge?: number, quality?: number): Promise<Blob>` — decode the image, resize so the long edge ≤ `maxEdge` (default 1600), draw to a canvas, export JPEG at `quality` (default 0.85). Rejects (throws) if the input isn't a decodable image.

> Browser Canvas API — this is a CLIENT util (not framework-free like lending.ts, but no React import). Canvas is awkward to unit-test headlessly; the test asserts the guard branches + wiring via stubs, NOT pixel output.

- [ ] **Step 1: Write the failing test** — `src/lib/image.test.ts`. Stub the browser APIs the util uses so it runs under vitest's node env:

```typescript
import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { downscaleImage } from './image'

// Minimal browser-API stubs (jsdom-less): createImageBitmap + a canvas returning a Blob.
beforeEach(() => {
  ;(globalThis as any).createImageBitmap = vi.fn(async (blob: any) => {
    if (blob && blob._bad) throw new Error('decode fail')
    return { width: 3200, height: 2400, close() {} }
  })
  ;(globalThis as any).OffscreenCanvas = class {
    width = 0; height = 0
    getContext() { return { drawImage() {} } }
    async convertToBlob() { return new Blob(['x'], { type: 'image/jpeg' }) }
  }
})
afterEach(() => { vi.restoreAllMocks() })

test('downscaleImage: returns a JPEG Blob for a valid image, long edge capped', async () => {
  const file = new File(['data'], 'photo.heic', { type: 'image/heic' })
  const out = await downscaleImage(file, 1600, 0.85)
  expect(out).toBeInstanceOf(Blob)
  expect(out.type).toBe('image/jpeg')
})

test('downscaleImage: rejects an undecodable file', async () => {
  const bad = Object.assign(new File(['x'], 'x.txt', { type: 'text/plain' }), { _bad: true })
  await expect(downscaleImage(bad as any)).rejects.toThrow()
})
```

- [ ] **Step 2:** `npx vitest run src/lib/image.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `src/lib/image.ts` — use `createImageBitmap` + `OffscreenCanvas` (both are what the test stubs; both exist in modern browsers). Fall back is out of scope — modern member phones have both:

```typescript
export async function downscaleImage(file: File, maxEdge = 1600, quality = 0.85): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('Could not read that image')
  }
  const { width, height } = bitmap
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) { bitmap.close?.(); throw new Error('Canvas unavailable') }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  return canvas.convertToBlob({ type: 'image/jpeg', quality })
}
```

- [ ] **Step 4:** `npx vitest run src/lib/image.test.ts` → PASS (both). `npx tsc --noEmit` clean. (If tsc complains about `OffscreenCanvas`/`createImageBitmap` DOM libs, ensure `tsconfig` `lib` includes `DOM` — it already does for a Next app; do NOT change it otherwise.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/image.ts src/lib/image.test.ts
git commit -m "feat(hub): downscaleImage client util (resize + JPEG re-encode)"
```

---

### Task 4: Blob upload-token route (auth-gated)

**Files:** Create `src/app/api/members/equipment/photo/route.ts`. (No unit test — thin auth wrapper over Blob's `handleUpload`; verified by tsc + build. The permission that matters is the ACTION's, tested in Task 5.)

**Interfaces produced:** `POST /api/members/equipment/photo` — issues a Vercel Blob client-upload token to logged-in members only.

- [ ] **Step 1: Create the route:**

```typescript
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await auth()
        if (!session?.user?.memberId) throw new Error('unauthorized')
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          maximumSizeInBytes: 5 * 1024 * 1024,
          addRandomSuffix: true,
        }
      },
      onUploadCompleted: async () => {
        // no-op: the item is linked via setItemPhotoAction, not here
      },
    })
    return NextResponse.json(json)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }
}
```

- [ ] **Step 2:** `npx tsc --noEmit` clean (confirms the `@vercel/blob/client` types + `auth` session shape line up).
- [ ] **Step 3:** `npm run build` compiles (the route registers). Do NOT hit it (needs `BLOB_READ_WRITE_TOKEN` — deploy).
- [ ] **Step 4: Commit**

```bash
git add src/app/api/members/equipment/photo/route.ts
git commit -m "feat(lending): Blob upload-token route (member-gated)"
```

---

### Task 5: `setItemPhotoAction` + `removeItemPhotoAction`

**Files:** Modify `src/app/members/_actions/lending-actions.ts`. (No unit test on the actions themselves per the existing pattern — the load-bearing logic is `canSetPhoto`, tested in Task 2; verified by tsc + build. Optionally a DI'd-fake test if straightforward.)

**Interfaces produced:**
- `setItemPhotoAction(itemId: string, url: string): Promise<{ ok: true } | { ok: false; reason: 'forbidden' | 'not_found' | 'not_equipment' }>`
- `removeItemPhotoAction(itemId: string): Promise<{ ok: true } | { ok: false; reason: 'not_found' }>`

- [ ] **Step 1: Add both actions** to `src/app/members/_actions/lending-actions.ts`. Consumes: `auth`, `prisma` (import `prisma` from `@/lib/db` if not already), `canSetPhoto` from `@/lib/lending`, `del` from `@vercel/blob`, `revalidateBrowse` (existing helper).

```typescript
import { del } from '@vercel/blob'
import { canSetPhoto } from '@/lib/lending'
import { prisma } from '@/lib/db'

export async function setItemPhotoAction(itemId: string, url: string) {
  const { isBoard } = await requireMember()
  const item = await prisma.loanableItem.findUnique({ where: { id: itemId } })
  if (!item) return { ok: false as const, reason: 'not_found' as const }
  if (item.category !== 'equipment') return { ok: false as const, reason: 'not_equipment' as const }
  if (!canSetPhoto({ isBoard, hasPhoto: !!item.photoUrl })) return { ok: false as const, reason: 'forbidden' as const }
  // board replacing an existing photo → delete the old blob (member path never has an existing photo)
  if (item.photoUrl && item.photoUrl !== url) { try { await del(item.photoUrl) } catch { /* best-effort */ } }
  await prisma.loanableItem.update({ where: { id: itemId }, data: { photoUrl: url } })
  revalidateBrowse()
  return { ok: true as const }
}

export async function removeItemPhotoAction(itemId: string) {
  await requireBoard()
  const item = await prisma.loanableItem.findUnique({ where: { id: itemId } })
  if (!item) return { ok: false as const, reason: 'not_found' as const }
  if (item.photoUrl) { try { await del(item.photoUrl) } catch { /* best-effort */ } }
  await prisma.loanableItem.update({ where: { id: itemId }, data: { photoUrl: null } })
  revalidateBrowse()
  return { ok: true as const }
}
```

> `requireMember()` returns `{ memberId, isBoard, name }` (existing). `requireBoard()` exists. If `prisma` isn't already imported in this file, add it; if it is, don't duplicate.

- [ ] **Step 2:** `npx tsc --noEmit` clean. `npm run build` compiles.
- [ ] **Step 3 (optional but preferred): a DI-light guard test.** If the actions can be exercised with a fake (they call the real `auth`/`prisma`/`del`, so a full unit test is awkward — the existing actions have no unit tests either). If not straightforward, rely on `canSetPhoto`'s Task-2 test + tsc; note this in the report.
- [ ] **Step 4: Commit**

```bash
git add src/app/members/_actions/lending-actions.ts
git commit -m "feat(lending): setItemPhotoAction (member add-only/board replace) + removeItemPhotoAction"
```

---

### Task 6: TitleCard — thumbnail + preview/confirm upload UI

**Files:** Modify `src/components/members/TitleCard.tsx`. (No unit test — presentational; verified tsc + build + lint.)

**Interfaces consumed:** `downscaleImage` from `@/lib/image`; `upload` from `@vercel/blob/client`; `setItemPhotoAction`/`removeItemPhotoAction` from the actions; `item.photoUrl` from `TitleView`.

- [ ] **Step 1: Thumbnail.** For equipment cards, render `item.photoUrl` as a thumbnail near the top (where the book cover renders for books), with a placeholder tile when null. Use a plain `<img>` with an `eslint-disable-next-line @next/next/no-img-element` comment (external Blob URL), mirroring the existing cover `<img>`:

```tsx
{isEquip && (
  item.photoUrl
    // eslint-disable-next-line @next/next/no-img-element -- external Blob URL; next/image not worth it here
    ? <img src={item.photoUrl} alt="" className="w-28 h-20 object-cover rounded mb-3 bg-card-bg" />
    : <div className="w-28 h-20 rounded mb-3 bg-card-bg/60 border border-border/40" />
)}
```

- [ ] **Step 2: Candidate → preview → confirm state + upload.** Add local state for a candidate (the downscaled Blob + a preview object-URL) and an uploading flag. A hidden file input; an "Add photo" button (members, only when `!item.photoUrl`); "Replace"/"Remove" (board). On file select → `downscaleImage` → set candidate + preview; render the preview with "Use this photo"/"Retake". On confirm → `upload(...)` to the token route → `setItemPhotoAction(item.id, url)` → revalidate refreshes. Reuse the existing `err` state for inline errors; disable during upload.

```tsx
'use client'
// add to existing imports:
import { upload } from '@vercel/blob/client'
import { downscaleImage } from '@/lib/image'
import { setItemPhotoAction, removeItemPhotoAction } from '@/app/members/_actions/lending-actions'

// inside the component:
const [candidate, setCandidate] = useState<{ blob: Blob; preview: string } | null>(null)
const [uploading, setUploading] = useState(false)
const fileRef = useRef<HTMLInputElement>(null)

async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  e.target.value = '' // allow re-picking the same file
  if (!file) return
  setErr(null)
  if (file.size > 20 * 1024 * 1024) { setErr('That image is too large (max ~20MB).'); return }
  try {
    const blob = await downscaleImage(file)
    setCandidate({ blob, preview: URL.createObjectURL(blob) })
  } catch { setErr("Couldn't process that image. Try another.") }
}

async function confirmUpload() {
  if (!candidate) return
  setUploading(true); setErr(null)
  try {
    const res = await upload(`equipment/${item.id}.jpg`, candidate.blob, {
      access: 'public',
      handleUploadUrl: '/api/members/equipment/photo',
    })
    const r = await setItemPhotoAction(item.id, res.url)
    if (!r.ok) setErr(r.reason === 'forbidden' ? 'A photo already exists.' : 'Could not save the photo.')
    else { URL.revokeObjectURL(candidate.preview); setCandidate(null) }
  } catch { setErr('Upload failed — try again.') }
  finally { setUploading(false) }
}

function retake() { if (candidate) URL.revokeObjectURL(candidate.preview); setCandidate(null); fileRef.current?.click() }
```

  JSX (place with the card's action controls):

```tsx
<input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
{isEquip && !candidate && !item.photoUrl && (
  <button disabled={uploading} onClick={() => fileRef.current?.click()} className="border border-border px-4 py-1.5 rounded-full text-sm disabled:opacity-50">Add photo</button>
)}
{isEquip && isBoard && item.photoUrl && !candidate && (
  <>
    <button disabled={uploading} onClick={() => fileRef.current?.click()} className="border border-border px-4 py-1.5 rounded-full text-sm">Replace photo</button>
    <button disabled={uploading} onClick={() => run(() => removeItemPhotoAction(item.id))} className="border border-red-500/40 text-red-400 px-4 py-1.5 rounded-full text-sm">Remove photo</button>
  </>
)}
{candidate && (
  <div className="mt-2">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={candidate.preview} alt="" className="w-28 h-20 object-cover rounded mb-2 bg-card-bg" />
    <div className="flex gap-2">
      <button disabled={uploading} onClick={confirmUpload} className="bg-accent hover:bg-accent-hover text-background px-4 py-1.5 rounded-full text-sm disabled:opacity-50">{uploading ? 'Uploading…' : 'Use this photo'}</button>
      <button disabled={uploading} onClick={retake} className="border border-border px-4 py-1.5 rounded-full text-sm">Retake</button>
    </div>
  </div>
)}
```

> `useRef` must be added to the React import. `run(...)` is the card's existing helper (works for `removeItemPhotoAction`, which returns `{ok,reason?}`). `capture="environment"` hints the rear camera on phones; harmless on desktop.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npm run build` succeeds (`/members/equipment` dynamic ƒ, the route present); `npx vitest run` all prior green; `npx eslint src/components/members/TitleCard.tsx src/lib/image.ts src/app/api/members/equipment/photo/route.ts` clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/members/TitleCard.tsx
git commit -m "feat(lending): equipment photo thumbnail + snap/upload w/ preview-confirm"
```

---

## Post-plan notes

- **Deploy (operator):** enable **Vercel Blob** on the `wcb-site` project (Storage tab) → this sets `BLOB_READ_WRITE_TOKEN` in the project env automatically → `prisma db push` (adds `photoUrl`) → deploy → smoke-test.
- **Smoke test:** as a member on a phone, open an equipment item with no photo → Add photo → snap → preview → Retake once → snap again → Use this photo → it appears. Confirm a member sees NO photo control on an item that already has one. As board: Replace + Remove.
- **New dep** `@vercel/blob` (installed); **new env** `BLOB_READ_WRITE_TOKEN` (Blob-enable auto-provides it). Add a note to `.env.example`.
- Equipment-only; books/library, checkout/return/renew, grouping, jump-nav untouched.
