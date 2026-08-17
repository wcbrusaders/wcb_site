# WCB Governance Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A single Governance hub at `/members/governance` linking the club's governance documents, each gated to its own audience: Board (public, existing `/board`), Code of Conduct (public, existing `/code-of-conduct`), Bylaws v2.0 (all members, new rendered page, shown as DRAFT pending ratification), Articles of Incorporation (officers only, new rendered page).

**Architecture:** Static/server-component pages following the existing Code-of-Conduct pattern (a body component + a thin page wrapper). Doc bodies are transcribed into TSX components from the canonical markdown sources in `docs/governance/` (no markdown library — matches existing repo convention). The hub is member-gated via the members layout; the Articles page adds a board-gate redirect. Reachable from the Resources "How the club runs" page and the members nav is unchanged (hub linked contextually, not a new top-level tab).

**Tech Stack:** Next.js 16 App Router (server components), Tailwind v4, existing `auth()` gate + members layout.

## Global Constraints

- **Canonical source of record:** `docs/governance/bylaws-v2.md` and `docs/governance/articles-of-incorporation.md`. The rendered TSX bodies must match these texts faithfully. Do not alter the governance wording.
- **Bylaws are DRAFT:** the Bylaws page MUST show a clear "Draft — pending Board ratification" banner. Do NOT present bylaws as adopted/in-force. (The Code of Conduct, by contrast, IS ratified — reflect each doc's true status.)
- **Audience gating (per item):** Bylaws = any logged-in member (members layout already gates `/members/*`). Articles = board only (add `if (!session.user.isBoard) redirect('/members')`). Board + CoC = public (link out to existing `/board`, `/code-of-conduct`).
- **Follow the CoC pattern:** a body component (like `src/components/CodeOfConductBody.tsx`) + a thin page. Reuse the members-area styling idiom.
- **No new dependencies.** No markdown renderer; transcribe to TSX.
- **Members-area pages** live under `/members/*` and render inside `src/app/members/layout.tsx` (header + suspension gate already provided) — do not add another header.

## Task 1: Bylaws body component + member page

**Files:**
- Create: `src/components/governance/BylawsBody.tsx`
- Create: `src/app/members/governance/bylaws/page.tsx`

**Interfaces:**
- Produces: `BylawsBody` (server component rendering the full bylaws v2.0 text) consumed by the bylaws page.

- [ ] **Step 1: Transcribe bylaws into `BylawsBody.tsx`**

Render every article from `docs/governance/bylaws-v2.md` (Articles One–Fourteen + Revision Log) as clean semantic TSX — h2 per article, p/ul/li for content, matching the CoC body's styling approach (use the same class idiom as `CodeOfConductBody.tsx`; read it first). Include the intro note (HSB legal / WCB operating). Faithful to the source text.

- [ ] **Step 2: Bylaws page with DRAFT banner (member-gated)**

```tsx
// src/app/members/governance/bylaws/page.tsx
import Link from 'next/link'
import { BylawsBody } from '@/components/governance/BylawsBody'
export const dynamic = 'force-dynamic'
export default function BylawsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <Link href="/members/governance" className="text-sm text-foreground/50 hover:text-accent">← Governance</Link>
      <h1 className="text-3xl font-bold mt-3">Bylaws</h1>
      <p className="text-foreground/50 text-sm mt-1">Holly Springs Brüsaders · operating as Wake County Brusaders</p>
      <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/[0.06] p-3.5 text-sm">
        <span className="font-semibold text-amber-300">Draft v2.0 — pending Board ratification.</span> These bylaws
        have not yet been adopted by Board vote. Provided for review.
      </div>
      <div className="mt-6"><BylawsBody /></div>
    </div>
  )
}
```

(The members layout already gates `/members/*` to logged-in members, so no extra auth needed here.)

- [ ] **Step 3: Verify** `npx tsc --noEmit && npx next build`. Commit both files:
  `git commit -m "feat(governance): bylaws v2.0 body + member-visible page (draft banner)"`

## Task 2: Articles of Incorporation body + officer-only page

**Files:**
- Create: `src/components/governance/ArticlesBody.tsx`
- Create: `src/app/members/governance/articles/page.tsx`

**Interfaces:**
- Consumes: `auth` from `@/lib/auth`. Produces: `ArticlesBody`.

- [ ] **Step 1: Transcribe `docs/governance/articles-of-incorporation.md` into `ArticlesBody.tsx`** (Articles I–X + signature note + the WCB/DBA intro), same styling idiom.

- [ ] **Step 2: Officer-only page**

```tsx
// src/app/members/governance/articles/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { ArticlesBody } from '@/components/governance/ArticlesBody'
export const dynamic = 'force-dynamic'
export default async function ArticlesPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  if (!session.user.isBoard) redirect('/members/governance')  // officer-only
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <Link href="/members/governance" className="text-sm text-foreground/50 hover:text-accent">← Governance</Link>
      <h1 className="text-3xl font-bold mt-3">Articles of Incorporation</h1>
      <p className="text-foreground/50 text-sm mt-1">Holly Springs Brüsaders · legal founding document · officers only</p>
      <div className="mt-6"><ArticlesBody /></div>
    </div>
  )
}
```

- [ ] **Step 3: Verify** `npx tsc --noEmit && npx next build`. Commit:
  `git commit -m "feat(governance): Articles of Incorporation body + officer-only page"`

## Task 3: Governance hub (per-item gating) + link from Resources

**Files:**
- Create: `src/app/members/governance/page.tsx`
- Modify: `src/app/members/resources/the-club/page.tsx` (add a link to the hub)

**Interfaces:**
- Consumes: `auth` (to know `isBoard` for showing the Articles row).

- [ ] **Step 1: Hub page**

```tsx
// src/app/members/governance/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
export const dynamic = 'force-dynamic'
export default async function GovernancePage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  const isBoard = !!session.user.isBoard
  const Card = ({ href, title, desc, tag, external }: { href: string; title: string; desc: string; tag: string; external?: boolean }) => {
    const inner = (
      <div className="rounded-xl border border-border/60 bg-card-bg/30 hover:border-accent/40 px-4 py-3">
        <div className="font-semibold">{title} <span className="text-foreground/40 font-normal text-xs">· {tag}{external ? ' ↗' : ''}</span></div>
        <div className="text-sm text-foreground/55">{desc}</div>
      </div>
    )
    return external
      ? <a href={href} target="_blank" rel="noreferrer">{inner}</a>
      : <Link href={href}>{inner}</Link>
  }
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl md:text-3xl font-bold">Governance</h1>
      <p className="text-foreground/55 mt-1">How the club is constituted and run.</p>
      <div className="mt-6 space-y-2">
        <Card href="/board" title="The Board" desc="Who runs the club and how to reach the Ombudsman." tag="public" external />
        <Card href="/code-of-conduct" title="Code of Conduct" desc="Ratified Aug 15, 2026 — the rules we all agree to." tag="ratified" external />
        <Card href="/members/governance/bylaws" title="Bylaws" desc="The club's governing document (draft v2.0, pending ratification)." tag="members" />
        {isBoard && <Card href="/members/governance/articles" title="Articles of Incorporation" desc="Legal founding document." tag="officers" />}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Link the hub from the-club page.** In `src/app/members/resources/the-club/page.tsx`, add a line near the board/CoC references pointing to `/members/governance` (e.g. "See all governance documents — Board, Code of Conduct, Bylaws — on the Governance page."). Use `<Link>`.

- [ ] **Step 3: Verify** `npx tsc --noEmit && npx next build`. Then run the full suite `npx vitest run` (should stay green — no logic touched). Commit:
  `git commit -m "feat(governance): governance hub with per-item gating + link from Resources"`

## Self-Review
- Coverage: hub (Task 3), bylaws member page + draft banner (Task 1), articles officer-only page (Task 2), Resources link (Task 3), per-item gating (bylaws=member via layout, articles=board redirect, board/CoC=public external). ✅
- Placeholder scan: none — content transcribed from canonical `docs/governance/*.md`.
- Consistency: hub links match the two new routes (`/members/governance/bylaws`, `/members/governance/articles`) and existing public routes (`/board`, `/code-of-conduct`). Board-gate uses the established `auth()` → `isBoard` redirect pattern. `dynamic = 'force-dynamic'` on session-reading pages.
- Status honesty: Bylaws shows DRAFT banner; CoC labeled "ratified"; Board "public". No doc misrepresented.
