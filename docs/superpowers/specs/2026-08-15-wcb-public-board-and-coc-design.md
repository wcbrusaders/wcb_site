# WCB Public Board + Code of Conduct Pages — Design

**Status:** Approved design · Not yet planned/built
**Date:** 2026-08-15
**Repo/branch:** `wcb_site`, feature branch off `main`

## Goal

Two new **public** (no-auth) pages that turn the freshly-ratified Code of Conduct and a named, accountable board into a **recruitment and trust surface**. A prospective member — especially those who look for a code before joining (women, per the club's recruitment push) — can see the club is safe and accountable *before* joining. Homepage gains entry points to both.

## Ratified content note

The Code of Conduct was **ratified August 15, 2026 by vote of the WCB Board**. The canonical text is `WCB-Code-of-Conduct-RATIFIED.md` (extracted from the ratified .docx). The ratified strike ladder is **3-rung**: Correction → Strike 1 (Warning) → Strike 2 ("Board decides": time-limited suspension OR removal by two-thirds vote; a member suspended here who violates again is removed). The page renders the ratified text verbatim. The Code contains **no names or incident references** — pure policy, safe to publish.

## Pages

### `/code-of-conduct` (public)
- The ratified Code rendered as a **native, styled, mobile-friendly web page** matching site design. Google-indexable, linkable, no download required.
- Content sourced from the ratified markdown, rendered as real page content (headings, lists, the violations table). Shows the "Ratified August 15, 2026 by vote of the WCB Board" line instead of blank signature/adoption lines.
- This page is the **canonical on-site source** of the Code; the future members-hub captive-page onboarding gate reuses this same content.
- Optional: a "download PDF" link is OUT for v1 (native page is enough); can add later.

### `/board` (public)
- Member-facing board roster: each board member's **name + role/title**, plus the **Ombudsman contact** (how to raise a concern), tying to what the Code references.
- **Data source:** derived from the roster (filter `isBoard = true`), so it auto-updates as board membership changes. Requires adding a **`Role` column** to the roster sheet (+ surfacing it on `MemberRecord`). Members with `isBoard = true` and a Role render on the page.
- Contact: the Ombudsman contact method is **"DM on Discord"** — display the Ombudsman's Discord handle (**Marcella, handle `Arycella`**) as the primary "raise a concern" path, with the Code's fallback ("or DM any board member") noted. Handle stored in config (not hardcoded in JSX) so it's editable without a code change. The page should make the "start with the Ombudsman" path in the Code concretely actionable (the visible `Arycella` handle to DM), not just a role name.
- Privacy: board members are volunteering to be publicly named as leadership — this is names + roles only, no personal contact beyond the Ombudsman channel.

## Homepage entry points (`src/app/page.tsx`)
- The homepage has its OWN header/nav (separate from the members-layout SiteHeader — do not confuse them). Add nav entries in **both** the desktop nav AND the mobile menu (both must be updated together — prior regressions came from updating only one).
- Add links to `/code-of-conduct` and `/board` (e.g., alongside the existing `#benefits` / `#pathways` / `/bot` items, or grouped under a small "About" affordance).
- Add a **trust-signal near the join CTA**: a short line like "We're a welcoming, harassment-free community — read our Code of Conduct" linking to `/code-of-conduct`. This is the recruitment lever.

## Architecture
- Two new public routes as **siblings to `/bot`** (existing public route pattern: `/`, `/bot`, `/login`). No auth gate.
- `/code-of-conduct` can be a **static/server component** (content is fixed until the Code changes) — cheapest, fastest, indexable.
- `/board` is a **server component** that reads the roster (via the existing `roster.ts` Google client) at request/build time and renders board members. Reuses existing roster infrastructure; no new data source.
- Styling: match the existing homepage/site dark theme + tokens.

## Roster change required
Add a **`Role`** column to the member roster Google Sheet and map it in `mapSheetRow` / `MemberRecord` (like the existing `isBoard` mapping). Board members get a Role value (President, Vice President, Treasurer, Ombudsman, etc.). This is the only data-model change.

## Explicitly OUT (v1)
- Photos / bios on the board page (name + role only, per decision).
- PDF download of the Code (native page suffices).
- Any members-only gating (both pages are fully public, by design).
- The captive-page onboarding gate (separate, related build; reuses this page's content).

## Testing / bar
- tsc + build clean; both routes render server-side; `/board` handles the roster fetch (and degrades gracefully if the roster is unreachable — show a fallback, don't 500). Mobile + desktop nav both updated. Matches the WCB subsystem quality bar (tsc/build/eslint).

## Relationship to other work
- Reuses the ratified Code content that the **captive-page CoC gate** will also use.
- Independent of the **officer admin page** build — ships on its own.
