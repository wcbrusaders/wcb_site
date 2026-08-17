# WCB Member Resources — Design

**Status:** Approved design · Build sequence = de-risk spike first
**Date:** 2026-08-17
**Supersedes:** `2026-08-17-wcb-member-guide-design.md` (the guide becomes Lane 1 of Resources; that doc's per-page ground truth still governs Lane 1's content).

## Purpose

Give members ONE place — **Resources** — for everything they need to *do* and to *learn*, built so it never has to be rebuilt as content grows. Two kinds of content with different lifecycles live here:

- **How-to & Getting Started** — a small, curated, hand-authored set of task pages (the guide). Changes rarely.
- **Knowledge & Experiments** — a large, growing library of articles (experiment writeups, brewing reference, recipes, workshop guides, club docs), **auto-synced from the club's existing Google Drive folders**. Grows continuously.

This also consolidates the homepage "Taplist" (which is already a set of link-outs to these same Drive folders) into a richer, searchable, members-only form — and lays the groundwork for the Discord bot to later search and deep-link this content.

## Top-level: one entry point named "Resources"

- Nav button **Resources** → `/members/resources`. Chosen because it comfortably covers how-tos AND a growing article library AND link-outs — it never needs renaming as content types are added.
- Add `{ href: '/members/resources', label: 'Resources', icon: 'help' }` to `MEMBER_LINKS` in `src/lib/nav.ts` (new `'help'` IconName, distinct from the `'book'` icon used by "Books"). Placed last among non-board links → non-board members see: Hub, Competitions, Equipment, Books, Resources (5 tabs, under the prior overflow threshold).
- A **"New here? Start here →"** card on the members dashboard (`/members`) links to `/members/resources/getting-started`.

## Landing UX: two clear lanes

Member picks intent first — *act* vs. *learn* — so the curated how-to content never gets buried under the growing article pile, and vice-versa.

```
RESOURCES  (/members/resources)
┌─ How-to & Getting Started ─┐   ┌─ Knowledge & Experiments ──────┐
│  (curated, hand-authored)  │   │  🔍 search all articles…       │
│  • Getting started         │   │  Categories:                   │
│  • Borrow gear             │   │   Experiments · Brewing        │
│  • Enter a competition     │   │   Knowledge · Recipes ·        │
│  • Grain buys              │   │   Workshop Guides · Community   │
│  • Brewing help (the bot)  │   │   Docs · Meeting Notes         │
│  • Learn (the Academy)     │   │  (each category: on-site       │
│  • How the club runs       │   │   articles + "see all in Drive")│
└────────────────────────────┘   └────────────────────────────────┘
```

## Lane 1 — How-to & Getting Started (the guide)

Seven hand-authored static server-component pages under `/members/resources/`:
`getting-started`, `borrow-gear`, `enter-competition`, `grain-buys`, `brewing-help`, `learn`, `the-club`.

**Content is fully specified (code-verified) in the superseded guide spec** — carry it forward verbatim. Key facts: books 30-day / equipment 14-day loans, 2 renewals, no fines; competition deliver-by = ship deadline − 7 days, 3 channels, club covers shipping; grain buys via `/grainbuy` + order in the Sheet with `WCB - Grain Buy` in the payment note; ask the bot in plain English (@mention or `#bot-help`, 10/hr, no link needed); the Academy at `academy.wcbrusaders.com` (5 tiers Foundations→Expert, Google login, separate-roster rough edge surfaced honestly); the-club membership/dues/meetings/board/CoC with `GUIDE_TODO` placeholders ONLY for genuinely-external facts (dues amount, meeting cadence, roster-tier meaning). Do NOT tell members to run `/welcome` (dead bot command).

Each page carries a **🌐 site / 💬 Discord / 🎓 Academy** destination tag. Static, no DB, no client state — cannot hit the DB-flapping failure mode; cacheable.

## Lane 2 — Knowledge & Experiments (Drive-synced article library)

### Storage: DB-backed `Article` model
```
Article {
  id            String  @id @default(cuid())
  slug          String  @unique        // stable, from title or Drive doc
  title         String
  body          String                 // stored rich content (see rendering)
  excerpt       String?                // short summary for cards/search
  category      String                 // one of the fixed categories below
  tags          String[]               // free tags for filter/search
  author        String?
  publishedAt   DateTime?
  sourceDriveId String  @unique        // Google Doc/file id — the sync key
  sourceFolder  String                 // which Drive folder → category mapping
  syncedAt      DateTime               // last successful sync
  status        String  @default("published") // published | hidden
  @@index([category])
  @@index([slug])
}
```
Single source of truth shared by site search now and the bot later.

### Rendering: clean, styled — NO visible markdown/raw markup
Hard requirement (user: "formatted nicely, not markdown bs"). Articles render as polished pages — proper headings, spacing, tables, images, callouts — the member never sees syntax. How the body is stored internally (sanitized HTML vs. a rich format) is an implementation choice made in the spike, judged solely by **how good the rendered output looks on real club docs.** Images inside Drive docs must be re-hosted or safely proxied, not left as expiring Google links.

### Content workflow: auto-sync from Drive (scheduled)
- **Drive is the source of truth.** Members/officers edit the Google Docs in the existing folders; a scheduled job re-reads them and upserts `Article` rows. Edit in Drive → site reflects it on the next sync. No site-side editing (a later sync would overwrite it).
- **Sync job:** a Vercel Cron route (e.g. `/api/cron/sync-knowledge`, hourly or daily) that: lists docs in each mapped folder via the Google Drive/Docs API → converts each to the stored render format → upserts by `sourceDriveId` → marks `syncedAt`. Uses the same Google credentials the LMS/bot already use for Sheets (documented operational overlap).
- **Deletions/moves:** a doc removed from its folder → article set `hidden` (soft), not hard-deleted, so a Drive hiccup can't wipe the library. Renames keep `sourceDriveId` stable, so the article survives a title change (slug policy decided in spike).
- **Draft control:** decide in spike what marks a doc publish-ready (e.g. a folder convention, a filename prefix, or a doc property) so half-written docs don't appear.

### Categories (map to the taplist's existing Drive folders)
All under the Knowledge lane, per user. Each shows imported on-site articles + a "see all in Drive" link until fully migrated:
- **Experiments** — member experiment writeups (the headline use case; folder TBD/new)
- **Brewing Knowledge** — Drive `1VPpxxr5sz-cREJiWNC7fRq46N7tewWC_` ("the club's growing reference library")
- **Recipes** — Drive `1b-7-hMPgU6gBNqnNmIxSNROgUILW1jwc` (house recipes, medal winners). Note: recipes are semi-structured; for now treat as articles, flag as a possible future structured type — do NOT block this build on it.
- **Workshop Guides** — Drive `1_I7Po8n9d1gBCze9xphoB5cVTZrLtBhf`
- **Community Docs** — Drive `0AH3fezsxCD4DUk9PVA` (bylaws, officer/planning docs — gate any board-only docs by `isBoard`)
- **Meeting Notes** — Drive `1Jysdr3jXicNqMgtFRuUBcmDG9_djtWqw` (agendas & notes)

### Search
Full-text over `Article` (title, excerpt, body, tags). Start with Postgres search (ILIKE/`to_tsvector`) — no external search service. Search box lives at the top of the Knowledge lane and searches articles only (the 7 how-to pages are a fixed short list, no search needed).

## The taplist
The **public homepage taplist stays as-is** (recruitment/marketing surface for non-members). Members get the searchable on-site version inside Resources. Same Drive folders, two presentations. No change to `src/app/page.tsx` in this build.

## Bot tie-in (future phase — design for it, don't build it)
Because articles are stored cleanly in one DB table, the bot can later: (a) answer "where's the club's article on X" by querying `Article`, and (b) deep-link members to `/members/resources/knowledge/<slug>`. This is additive; nothing in this build should preclude it. (Ties to the bot-refocus session and the RAG stack.)

## Build sequence (de-risk spike FIRST)

**Phase 0 — Drive-sync spike (prove formatting on real docs):**
Build the thin vertical slice: authenticate to Google → read ONE real folder (Brewing Knowledge) → convert docs → `Article` rows → one styled article render page. **Success gate: the rendered output looks genuinely good on the user's actual Drive docs.** If conversion quality is poor, resolve (conversion approach, authoring conventions, or fall back to per-article polish) BEFORE building the surrounding UI. This is the make-or-break risk; everything else is low-risk.

**Phase 1 — Resources shell + both lanes:**
Resources landing (two lanes) + the 7 how-to pages + nav link + dashboard card + Knowledge lane wired to the `Article` model with search + category browse. Categories not yet synced show the Drive "see all" link.

**Phase 2 — fill the library:**
Point the sync at the remaining folders; categories graduate from link-out to on-site articles. Pure content/config — no structural change.

**Phase 3 — bot tie-in:** separate effort (see above).

## Non-goals
- No site-side article editing (Drive is source of truth).
- No structured recipe type yet (recipes ride the Article model for now).
- Store stays a "coming soon" mention in `borrow-gear` (unbuilt; separate spec).
- No change to the public homepage taplist.
- Not fixing the bot `/welcome` / `startgrainbuy` help-text bugs here.

## Files (anticipated)
- **Phase 0:** `prisma/schema.prisma` (Article model); `src/lib/knowledge/drive-sync.ts` (Drive read + convert + upsert); `src/lib/knowledge/render.ts` (safe render); `src/app/api/cron/sync-knowledge/route.ts`; a minimal article render page; Google API creds in env.
- **Phase 1:** `src/app/members/resources/page.tsx` (two-lane landing) + the 7 how-to `page.tsx` files + `knowledge/` (list/search) + `knowledge/[slug]/page.tsx`; `src/lib/nav.ts` (+ `'help'` icon in `DesktopTabs`/`MobileNav`); `src/app/members/page.tsx` ("Start here" card); shared guide/card components.
