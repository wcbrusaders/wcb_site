# WCB Knowledge Sync — Phase 0 De-Risk Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that a real WCB Google Doc from the Brewing Knowledge Drive folder can be pulled, converted, stored as an `Article`, and rendered as a clean, styled web page — good enough to justify building the full Resources knowledge base on top of it.

**Architecture:** A thin vertical slice using the site's existing stack: reuse the LMS/bot Google OAuth creds (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REFRESH_TOKEN`) via `googleapis` to read Drive + export Google Docs to HTML; sanitize/normalize that HTML into a stored `Article` row (Prisma/Postgres); render it through one styled article page. A `CRON_SECRET`-guarded sync route drives it, mirroring the existing `sync-roster` route. NO two-lane UI, NO nav changes, NO search — those are Phase 1.

**Tech Stack:** Next.js 16 (App Router, server components), Prisma 6 / Postgres, `googleapis` ^166 (already a dependency), `sanitize-html` for safe HTML normalization, Vitest for unit tests.

## Global Constraints

- **Reuse existing Google auth verbatim:** env vars `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, via `new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET)` + `setCredentials({ refresh_token })` — exactly as `LMS/src/lib/sheets.ts` does. Never print secret values to logs or chat.
- **Prisma is imported from `@/lib/db`** (named export `prisma`). Do not instantiate a new `PrismaClient`.
- **Rendered articles must look clean — NO visible markdown or raw HTML tags to the member.** Output is sanitized, styled HTML. This is the success criterion of the whole spike.
- **Article identity key is `sourceDriveId`** (the Google Doc file id); upserts are keyed on it so re-syncs update in place.
- **Cron/sync route auth mirrors `src/app/api/cron/sync-roster/route.ts`:** `GET`, checks `authorization === \`Bearer ${CRON_SECRET}\`` when `CRON_SECRET` is set, returns JSON `{ ok, ... }` / 500 on error.
- **Brewing Knowledge folder id:** `1VPpxxr5sz-cREJiWNC7fRq46N7tewWC_` (from the homepage taplist).
- **No secrets committed.** Env vars are pulled into `.env` locally / Vercel env; `.env` is git-ignored (verify).
- **TDD:** every unit of pure logic (HTML normalization, folder listing shape, upsert mapping) gets a failing test first. Google API calls are exercised via a live smoke script, not mocked into the unit suite.

---

### Task 1: Confirm Drive+Docs scope on the reused OAuth token (spike gate)

The LMS token is only ever used for Sheets. Before building anything, prove the SAME refresh token can list Drive files and export a Doc. If it can't (Sheets-only scope), STOP and report — the auth decision must be revisited (re-consent with `drive.readonly` scope, or switch to a service account).

**Files:**
- Create: `scripts/spike-drive-check.mjs` (throwaway smoke script, not shipped)

**Interfaces:**
- Consumes: `process.env.GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
- Produces: console proof that Drive list + Docs/Drive export works (or a clear scope error)

- [ ] **Step 1: Copy the Google OAuth env vars into the site's `.env`**

Pull the three values from the LMS/bot environment into `wcb_site/.env` (locally). Do this WITHOUT echoing values to the terminal — e.g. append via an editor or a base64 round-trip. Verify `.env` is git-ignored: `git check-ignore .env` must print `.env`.

- [ ] **Step 2: Write the smoke script**

```js
// scripts/spike-drive-check.mjs
import { google } from 'googleapis'
import 'dotenv/config'

const FOLDER = '1VPpxxr5sz-cREJiWNC7fRq46N7tewWC_'
const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })

const drive = google.drive({ version: 'v3', auth: oauth2 })

const list = await drive.files.list({
  q: `'${FOLDER}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
  fields: 'files(id,name,modifiedTime,mimeType)',
  pageSize: 5,
})
console.log('DOCS FOUND:', list.data.files?.length ?? 0)
for (const f of list.data.files ?? []) console.log(' -', f.id, f.name)

const first = list.data.files?.[0]
if (first) {
  const exp = await drive.files.export({ fileId: first.id, mimeType: 'text/html' }, { responseType: 'text' })
  const html = exp.data
  console.log('EXPORT OK, html length:', html.length)
  console.log('HTML HEAD SAMPLE:', html.slice(0, 300))
}
```

- [ ] **Step 3: Run it**

Run: `node scripts/spike-drive-check.mjs`
Expected: prints `DOCS FOUND: N` (N ≥ 1), lists doc ids/names, `EXPORT OK` with a non-zero html length, and a sample of exported HTML.
If it fails with an insufficient-scope / 403 error: STOP. Report "reused token lacks Drive scope" and the exact error — do not proceed to later tasks.

- [ ] **Step 4: Record the outcome, do NOT commit the throwaway script's secrets**

Note in the report: docs found, export worked, and paste the ~300-char HTML head sample (it reveals what Google's export HTML looks like — this drives Task 3's normalization). Commit `scripts/spike-drive-check.mjs` (it contains no secrets) if useful for re-runs, or leave uncommitted.

---

### Task 2: Add the `Article` Prisma model

**Files:**
- Modify: `prisma/schema.prisma` (append model)
- Run: `npx prisma generate`

**Interfaces:**
- Produces: `Article` model / Prisma type used by Tasks 3-5.

- [ ] **Step 1: Add the model**

Append to `prisma/schema.prisma`:

```prisma
model Article {
  id            String   @id @default(cuid())
  slug          String   @unique
  title         String
  bodyHtml      String                    // sanitized, styled-ready HTML (NOT markdown)
  excerpt       String?
  category      String                    // e.g. "brewing-knowledge"
  tags          String[]  @default([])
  author        String?
  publishedAt   DateTime?
  sourceDriveId String   @unique          // Google Doc file id — the sync key
  sourceFolder  String                    // Drive folder id it came from
  syncedAt      DateTime @default(now())
  status        String   @default("published") // published | hidden
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([category])
  @@index([status])
}
```

- [ ] **Step 2: Generate the client**

Run: `npx prisma generate`
Expected: completes; `Article` available on the Prisma client. (DB push to the live DB is done later during the spike verification via the tunnel — see Task 6. Do NOT push in this task.)

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(knowledge): add Article model for Drive-synced knowledge base"
```

---

### Task 3: HTML normalization — Google-export HTML → clean styled body

Google Docs' HTML export is full of inline styles, wrapper spans, and `class="c0 c1"` junk. This task converts it to clean semantic HTML the site can style. This is the make-or-break unit — it is pure and fully unit-tested.

**Files:**
- Create: `src/lib/knowledge/normalize.ts`
- Test: `src/lib/knowledge/normalize.test.ts`
- Add dep: `sanitize-html` (+ `@types/sanitize-html`)

**Interfaces:**
- Consumes: raw HTML string from Google Docs export (Task 1 sample shows the shape).
- Produces: `normalizeGoogleDocHtml(rawHtml: string): { bodyHtml: string; excerpt: string }` — `bodyHtml` is sanitized semantic HTML (h1-h4, p, ul/ol/li, strong/em, a, table/thead/tbody/tr/th/td, blockquote, img, br, hr, code, pre) with all inline `style`/`class`/`id`/font junk stripped; `excerpt` is the first ~200 chars of plain text.

- [ ] **Step 1: Add the dependency**

Run: `npm install sanitize-html && npm install -D @types/sanitize-html`

- [ ] **Step 2: Write failing tests**

```ts
// src/lib/knowledge/normalize.test.ts
import { test, expect } from 'vitest'
import { normalizeGoogleDocHtml } from './normalize'

test('strips Google class/style junk but keeps headings, paragraphs, lists', () => {
  const raw = `<html><body>
    <p class="c0"><span class="c1" style="font-weight:700">Water Chemistry</span></p>
    <h2 class="c2" style="color:#000"><span class="c3">Overview</span></h2>
    <p class="c0"><span class="c1">Target your <span style="font-style:italic">sulfate</span> ratio.</span></p>
    <ul class="c4"><li class="c5"><span class="c1">Step one</span></li><li><span>Step two</span></li></ul>
  </body></html>`
  const { bodyHtml } = normalizeGoogleDocHtml(raw)
  expect(bodyHtml).not.toMatch(/class=/)
  expect(bodyHtml).not.toMatch(/style=/)
  expect(bodyHtml).toContain('<h2>Overview</h2>')
  expect(bodyHtml).toContain('<li>Step one</li>')
  expect(bodyHtml).toContain('<em>sulfate</em>')   // italic span -> em
})

test('preserves links and tables, drops empty spans', () => {
  const raw = `<p><span><a class="c9" href="https://x.test">link</a></span></p>
    <table class="c1"><tbody><tr><td class="c2"><span>A</span></td><td><span>B</span></td></tr></tbody></table>
    <p><span class="c1"></span></p>`
  const { bodyHtml } = normalizeGoogleDocHtml(raw)
  expect(bodyHtml).toContain('<a href="https://x.test"')
  expect(bodyHtml).toContain('<td>A</td>')
  expect(bodyHtml).not.toMatch(/<span>\s*<\/span>/)
})

test('excerpt is plain-text prefix, no tags', () => {
  const raw = `<h1><span>Title</span></h1><p><span>First paragraph body text here.</span></p>`
  const { excerpt } = normalizeGoogleDocHtml(raw)
  expect(excerpt).not.toMatch(/[<>]/)
  expect(excerpt).toContain('First paragraph body text')
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/knowledge/normalize.test.ts`
Expected: FAIL — `normalizeGoogleDocHtml` not defined.

- [ ] **Step 4: Implement**

```ts
// src/lib/knowledge/normalize.ts
import sanitizeHtml from 'sanitize-html'

// Google Docs HTML export wraps everything in styled spans with c0/c1 classes and
// bold/italic via inline style. Convert bold/italic spans to strong/em, then strip
// all class/style/id and unwrap now-empty spans into clean semantic HTML.
export function normalizeGoogleDocHtml(rawHtml: string): { bodyHtml: string; excerpt: string } {
  // 1) promote inline font-weight/style spans to semantic tags BEFORE stripping styles
  let html = rawHtml
    .replace(/<span[^>]*font-weight:\s*(?:700|bold)[^>]*>([\s\S]*?)<\/span>/gi, '<strong>$1</strong>')
    .replace(/<span[^>]*font-style:\s*italic[^>]*>([\s\S]*?)<\/span>/gi, '<em>$1</em>')

  // 2) sanitize: keep semantic tags, drop everything else and all attributes except href/src/alt
  const clean = sanitizeHtml(html, {
    allowedTags: ['h1','h2','h3','h4','p','ul','ol','li','strong','em','b','i','a','table','thead','tbody','tr','th','td','blockquote','img','br','hr','code','pre'],
    allowedAttributes: { a: ['href','name','target','rel'], img: ['src','alt'] },
    transformTags: {
      b: 'strong', i: 'em',
      a: (tn, attribs) => ({ tagName: 'a', attribs: { ...attribs, target: '_blank', rel: 'noreferrer' } }),
    },
    // sanitize-html drops disallowed tags (span, div, html, body) but keeps their text
  })

  // 3) collapse empty tags and whitespace left behind
  const bodyHtml = clean
    .replace(/<(\w+)>\s*<\/\1>/g, '')     // empty <p></p>, <span></span> remnants
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const text = sanitizeHtml(bodyHtml, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim()
  const excerpt = text.slice(0, 200)
  return { bodyHtml, excerpt }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/knowledge/normalize.test.ts`
Expected: PASS (all 3).

- [ ] **Step 6: Commit**

```bash
git add src/lib/knowledge/normalize.ts src/lib/knowledge/normalize.test.ts package.json package-lock.json
git commit -m "feat(knowledge): Google-doc HTML -> clean semantic HTML normalizer"
```

---

### Task 4: Drive sync — list folder, export docs, upsert Articles

**Files:**
- Create: `src/lib/knowledge/drive-sync.ts`
- Test: `src/lib/knowledge/drive-sync.test.ts`

**Interfaces:**
- Consumes: `normalizeGoogleDocHtml` (Task 3), `prisma` from `@/lib/db`, Google OAuth env (Task 1).
- Produces:
  - `slugify(title: string): string` — lowercase, hyphenated, ASCII, collision-safe stub.
  - `docToArticleInput(doc: { id: string; name: string; modifiedTime?: string }, rawHtml: string, folderId: string, category: string): ArticleUpsertInput` — pure mapper (Drive doc + html → Prisma upsert fields). Fully unit-tested.
  - `syncFolder(folderId: string, category: string, deps?): Promise<{ scanned: number; upserted: number; hidden: number }>` — the live sync (Google calls + prisma upsert), NOT unit-tested (exercised via Task 6 live run).

- [ ] **Step 1: Write failing tests for the pure helpers**

```ts
// src/lib/knowledge/drive-sync.test.ts
import { test, expect } from 'vitest'
import { slugify, docToArticleInput } from './drive-sync'

test('slugify: lowercase hyphen ascii', () => {
  expect(slugify('Water Chemistry 101!')).toBe('water-chemistry-101')
  expect(slugify('  Dry-Hop  Timing  ')).toBe('dry-hop-timing')
})

test('docToArticleInput maps a doc + html to upsert fields keyed on sourceDriveId', () => {
  const raw = `<h1><span>Water Chemistry</span></h1><p><span>Body text.</span></p>`
  const input = docToArticleInput(
    { id: 'DOC123', name: 'Water Chemistry', modifiedTime: '2026-08-01T00:00:00Z' },
    raw, 'FOLDER9', 'brewing-knowledge'
  )
  expect(input.sourceDriveId).toBe('DOC123')
  expect(input.title).toBe('Water Chemistry')
  expect(input.slug).toBe('water-chemistry')
  expect(input.category).toBe('brewing-knowledge')
  expect(input.sourceFolder).toBe('FOLDER9')
  expect(input.bodyHtml).toContain('<h1>Water Chemistry</h1>')
  expect(input.excerpt).toContain('Body text')
  expect(input.status).toBe('published')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/knowledge/drive-sync.test.ts`
Expected: FAIL — `slugify` / `docToArticleInput` not defined.

- [ ] **Step 3: Implement**

```ts
// src/lib/knowledge/drive-sync.ts
import { google } from 'googleapis'
import { prisma } from '@/lib/db'
import { normalizeGoogleDocHtml } from './normalize'

export function slugify(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export type ArticleUpsertInput = {
  slug: string; title: string; bodyHtml: string; excerpt: string
  category: string; sourceDriveId: string; sourceFolder: string
  publishedAt: Date | null; status: string
}

export function docToArticleInput(
  doc: { id: string; name: string; modifiedTime?: string },
  rawHtml: string, folderId: string, category: string
): ArticleUpsertInput {
  const { bodyHtml, excerpt } = normalizeGoogleDocHtml(rawHtml)
  return {
    slug: slugify(doc.name) || doc.id.toLowerCase(),
    title: doc.name,
    bodyHtml, excerpt, category,
    sourceDriveId: doc.id, sourceFolder: folderId,
    publishedAt: doc.modifiedTime ? new Date(doc.modifiedTime) : null,
    status: 'published',
  }
}

function driveClient() {
  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth: oauth2 })
}

export async function syncFolder(
  folderId: string, category: string,
  deps: { db?: typeof prisma; drive?: ReturnType<typeof driveClient> } = {}
): Promise<{ scanned: number; upserted: number; hidden: number }> {
  const db = deps.db ?? prisma
  const drive = deps.drive ?? driveClient()

  const list = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
    fields: 'files(id,name,modifiedTime)', pageSize: 200,
  })
  const files = list.data.files ?? []
  const seenIds: string[] = []
  let upserted = 0

  for (const f of files) {
    if (!f.id || !f.name) continue
    const exp = await drive.files.export({ fileId: f.id, mimeType: 'text/html' }, { responseType: 'text' })
    const input = docToArticleInput(
      { id: f.id, name: f.name, modifiedTime: f.modifiedTime ?? undefined },
      exp.data as unknown as string, folderId, category
    )
    await db.article.upsert({
      where: { sourceDriveId: input.sourceDriveId },
      create: { ...input, syncedAt: new Date() },
      update: { title: input.title, slug: input.slug, bodyHtml: input.bodyHtml, excerpt: input.excerpt,
                category: input.category, sourceFolder: input.sourceFolder, publishedAt: input.publishedAt,
                status: 'published', syncedAt: new Date() },
    })
    seenIds.push(input.sourceDriveId)
    upserted++
  }

  // Soft-hide articles from this folder whose doc vanished (moved/trashed) — never hard-delete.
  const hidden = await db.article.updateMany({
    where: { sourceFolder: folderId, sourceDriveId: { notIn: seenIds.length ? seenIds : ['__none__'] } },
    data: { status: 'hidden' },
  })
  return { scanned: files.length, upserted, hidden: hidden.count }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/knowledge/drive-sync.test.ts`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge/drive-sync.ts src/lib/knowledge/drive-sync.test.ts
git commit -m "feat(knowledge): Drive folder sync (list, export, upsert Articles)"
```

---

### Task 5: Sync route + one styled article render page

**Files:**
- Create: `src/app/api/cron/sync-knowledge/route.ts`
- Create: `src/app/members/resources/knowledge/[slug]/page.tsx`
- Create: `src/app/members/resources/knowledge/_article.css` (or Tailwind prose classes inline)

**Interfaces:**
- Consumes: `syncFolder` (Task 4), `prisma`, the members auth gate pattern used by other `/members/*` pages (`auth()` → redirect `/login` if no `memberId`).
- Produces: an authenticated route that syncs the Brewing Knowledge folder; a member-facing page that renders one Article's `bodyHtml` as clean styled content.

- [ ] **Step 1: Sync route (mirror sync-roster)**

```ts
// src/app/api/cron/sync-knowledge/route.ts
import { NextResponse } from 'next/server'
import { syncFolder } from '@/lib/knowledge/drive-sync'

const BREWING_KNOWLEDGE = '1VPpxxr5sz-cREJiWNC7fRq46N7tewWC_'

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const r = await syncFolder(BREWING_KNOWLEDGE, 'brewing-knowledge')
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 2: Article render page (member-gated, clean styling)**

```tsx
// src/app/members/resources/knowledge/[slug]/page.tsx
import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  const { slug } = await params
  const article = await prisma.article.findFirst({ where: { slug, status: 'published' } })
  if (!article) notFound()
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <a href="/members/resources" className="text-sm text-foreground/50 hover:text-accent">← Resources</a>
      <h1 className="text-3xl font-bold mt-3">{article.title}</h1>
      {article.publishedAt && (
        <p className="text-foreground/45 text-sm mt-1">Updated {new Date(article.publishedAt).toISOString().slice(0,10)}</p>
      )}
      {/* bodyHtml is sanitized in normalize.ts (Task 3) — safe to render. `prose` gives clean styled output. */}
      <article className="prose prose-invert max-w-none mt-6" dangerouslySetInnerHTML={{ __html: article.bodyHtml }} />
    </div>
  )
}
```

Note: if Tailwind `prose` (typography plugin) is not installed, style headings/lists/tables/links with a scoped stylesheet instead — the constraint is that it LOOKS clean, not the mechanism. Check `tailwind.config`/globals for an existing prose setup first; add `@tailwindcss/typography` only if absent.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit && npx next build`
Expected: both succeed. (The route and page compile; no live Google/DB call at build time because the page is `force-dynamic` and the route is on-demand.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/sync-knowledge src/app/members/resources
git commit -m "feat(knowledge): sync-knowledge cron route + styled article render page"
```

---

### Task 6: Live spike run + the make-or-break formatting judgment

This is the actual de-risk. Push the schema to the live DB via the Fly tunnel, run the sync against the real Brewing Knowledge folder, open a synced article, and JUDGE whether it looks clean enough.

**Files:** none (operational).

- [ ] **Step 1: Push the Article table to the live DB (tunnel method)**

Reuse the existing Fly proxy tunnel to `wcb-hub-db` (localhost:15432). Build the push URL from `.env`'s `DATABASE_URL` with host rewritten to `127.0.0.1:15432` (never printing the password), then:
`DATABASE_URL="$PUSH_URL" npx prisma db push --skip-generate`
Expected: "Your database is now in sync" — `Article` table created.

- [ ] **Step 2: Run the sync locally against the live DB**

Start the site (`npm run dev`) with the live `DATABASE_URL` (tunnel) + Google env set, then hit the route:
`curl -s -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-knowledge`
Expected JSON: `{ ok: true, scanned: N, upserted: N, hidden: 0 }` with N ≥ 1.

- [ ] **Step 3: Open a synced article and JUDGE the formatting**

Query one slug (`prisma studio` or a quick query), open `http://localhost:3000/members/resources/knowledge/<slug>` (logged in), and evaluate against the success gate:
- Headings, paragraphs, lists, bold/italic, links, and any tables render as clean styled content.
- NO visible markdown, NO `class="c0"` junk, NO raw tags, no giant empty gaps.
- Images (if any in the doc) — note whether they render or are broken Google links (informs a Phase 1 image-hosting task; does NOT fail the spike by itself).

- [ ] **Step 4: Record the verdict**

Write the outcome into `docs/superpowers/plans/2026-08-17-wcb-knowledge-sync-spike.md` (append a "## Spike Result" section) or the SDD ledger:
- **PASS** → conversion quality is good; Phase 1 (full Resources UI) is greenlit. Note any small normalization tweaks still wanted and the image-handling finding.
- **NEEDS WORK** → list exactly what rendered badly. Decide the fix path (better normalization rules, an authoring convention for the docs, or fall back to per-article polish) BEFORE Phase 1. This is the whole point of the spike.

- [ ] **Step 5: Tear down**

Stop `npm run dev`. Leave the Fly tunnel as-is if it predates this work.

---

## Self-Review

- **Spec coverage:** Phase 0 spec goals = pull a real doc → convert → store `Article` → styled render → judge quality. Tasks 1 (auth+read), 2 (model), 3 (convert), 4 (store), 5 (route+render), 6 (live run + judgment) cover all of it. ✅
- **Placeholder scan:** no TBD/TODO; all code blocks concrete. Real folder id and env var names used throughout.
- **Type consistency:** `normalizeGoogleDocHtml` returns `{ bodyHtml, excerpt }` — consumed by `docToArticleInput` (Task 4). `ArticleUpsertInput` fields match the `Article` model (Task 2: `bodyHtml`, `sourceDriveId`, `sourceFolder`, `status`). Route calls `syncFolder(folderId, category)` (Task 4 signature). Page reads `article.bodyHtml`/`slug`/`status` (Task 2 fields). ✅
- **Scope:** strictly the spike — no nav, no two-lane landing, no search, no other folders. Those are Phase 1, gated on Task 6 = PASS.
