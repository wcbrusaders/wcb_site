# WCB Equipment Grouping — Design

**Date:** 2026-08-10
**Status:** Approved (brainstorming) → ready for implementation plan
**Scope:** `wcb_site` — categorize the lending system's equipment into groups and render `/members/equipment` as grouped sections instead of one flat list. Small additive change to the live lending feature.

## Problem

The lending system is live (`wcb-site.vercel.app/members/equipment`). It seeded ~53 equipment titles that currently render as **one flat grid** — hard to scan ("is a chiller free?" means eyeballing the whole list). Books (18) are fine flat. This spec adds equipment categories + grouped browse.

## Key decisions (locked in brainstorming)

- **Real schema field**, not derived-from-keywords or stuffed-in-notes: add `subcategory String?` to `LoanableItem`. Board-editable, queryable, durable.
- **Fixed category set** (dropdown-selected, code-defined — not free-form text): `Kegging & Serving`, `Fermentation`, `Measurement`, `Transfer & Hoses`, `Kettle & Hot-side`, `Bottling`, `Cleaning`, `Other`. Defined as `EQUIPMENT_SUBCATEGORIES` in `lending.ts`; single source of truth for the dropdown and the section ordering. Adding/renaming a category = a one-line edit (they change rarely).
- **Grouped section headers** in browse (no filter/search — grouping alone deemed sufficient). Sections render in the `EQUIPMENT_SUBCATEGORIES` order (most-used first), NOT alphabetical. Empty categories omitted.
- **Null/unknown subcategory → "Other"** at the bottom, so nothing ever disappears for being uncategorized.
- **Equipment only.** Books stay a flat A–Z list; `subcategory` is nullable + ignored for books.
- **Backfill the 53 existing items** via a one-time script using an approved title→category mapping (below). New items get a subcategory from the board dropdown.

## Out of scope

- Filter / search UI (grouped sections are enough for now).
- Book grouping (18 homogeneous titles are fine flat).
- Any change to checkout / return / renew / board-mutation LOGIC — only the Add/Edit forms gain a subcategory `<select>` and the equipment page gains grouping.

## Data model (Prisma — additive)

Add one nullable column to `LoanableItem`:
- `subcategory String?` — the group label (one of `EQUIPMENT_SUBCATEGORIES`, or null). Nullable so books + un-categorized equipment are valid; browse treats null equipment as "Other".

Additive, backward-compatible. Does not touch `Copy`/`Loan`/the gate/anything shipped. `prisma db push` applies it.

## Architecture

- **`src/lib/lending.ts`** (framework-free):
  - `export const EQUIPMENT_SUBCATEGORIES: string[]` — the 8 categories in display order, `Other` last. Single source of truth.
  - `TitleView` gains `subcategory: string | null`; `listTitles` selects + returns it.
  - `export function groupBySubcategory(titles: TitleView[]): { subcategory: string; items: TitleView[] }[]` — pure: buckets titles by subcategory into `EQUIPMENT_SUBCATEGORIES` order, routes null/unrecognized to "Other", drops empty categories. Unit-tested without React. **Called only by the equipment page** — the library page never calls it (books stay flat).
- **`src/app/members/equipment/page.tsx`**: calls `listTitles('equipment', memberId)` → `groupBySubcategory(...)` → renders one section (header + `TitleCard` grid) per returned group. Library page unchanged.
- **`src/components/members/AddTitleForm.tsx`** + **`TitleCard.tsx`** (inline Edit): gain a subcategory `<select>` (options = `EQUIPMENT_SUBCATEGORIES`) shown only for `category === 'equipment'`. Wired into `addTitleAction` / `editTitleAction` (extend their payloads with `subcategory`).
- **Backfill:** one-time script sets `subcategory` on each existing title by exact-title match (idempotent). Run post-deploy after the schema push.

## Approved backfill mapping (53 items)

- **Kegging & Serving (15):** Ball-lock gas & beer connector (set); 2-way CO2 manifold; 4-way CO2 manifold; CO2 regulator; CO2 regulator for sixtel; Kegco tap; Perlick tap; Sixtel tap; Tap (unknown brand); Pin-lock beer keg connector; Pin-lock gas keg connector; 3" shank; 8" shank; Bev-lex serving line 18'; Bev-lex serving line 25'.
- **Fermentation (7):** Airlock; 6.5 gal bucket; Glass carboy neck transport handle; Carboy carrier; 1/2" plug-in heat belt; Johnson Controls temp chamber controller; BIAB bag.
- **Measurement (8):** Thin glass thermometer; 12" clip-on thermometer; 12" thermometer; 9" thermometer w/ clip; Hydrometer; Refractometer; Digital scale (0.5g / 0.01oz); 1000mL flask.
- **Transfer & Hoses (13):** Bev-lex PVC tubing 9'; Braided PVC hose 3'; Braided PVC hose 7'; Braided PVC hose 8'; Brass garden hose fitting w/ quick conn; Syphon; Glass wine thief; 17" turkey baster (wine thief); Small 4" funnel; 1/2" ball valve; 1/2" 3-piece ball valve; 1/2" steel ball-lock valve; 3/8" brass ball-lock valve.
- **Kettle & Hot-side (5):** 36" wooden mash paddle; 24" plastic mash paddle; 21" metal spoon; Hop spider holder for kettle; Plastic grain scoop.
- **Bottling (3):** Bottle capper; Spring-loaded bottle filler; Counter-pressure bottle filler.
- **Cleaning (1):** Carboy brush.
- **Other (1):** 120mm PC fan.

Exact-title match; coverage verified (all 53 assigned once, no gaps/typos). The 2 archived consumables (bottle caps, bungs) are deliberately NOT in this mapping — the backfill must not un-archive or touch them; they stay archived/hidden for the future store.

## Data flow

`/members/equipment` → `listTitles('equipment', memberId)` (now includes `subcategory`) → `groupBySubcategory` → sections in canonical order, empties dropped, null→Other. Each section renders the existing `TitleCard`s unchanged. Board Add/Edit sets `subcategory` via the dropdown.

## Error handling & edge cases

- **Uncategorized equipment** (null or a value not in `EQUIPMENT_SUBCATEGORIES`) → grouped under "Other" (never dropped).
- **A category with no items** → its section is omitted (no empty header).
- **Books** → never grouped; `subcategory` null and ignored on the library page.
- **Backfill title mismatch** (a title renamed since the mapping) → that item simply stays null → shows under "Other"; board can set it via Edit. No crash.
- Additive schema → no migration risk; existing rows get `subcategory = null` until backfilled.

## Testing (TDD, framework-free)

- **`groupBySubcategory`:** titles across categories → grouped in `EQUIPMENT_SUBCATEGORIES` order (not input/alpha); empty categories dropped; a null-subcategory item and an unrecognized-value item both land in "Other"; "Other" is last.
- **`EQUIPMENT_SUBCATEGORIES`:** exported; "Other" is the last element (a test asserts this, since both the dropdown and grouping depend on it).
- **`listTitles`:** `subcategory` flows into `TitleView` (update existing listTitles tests so they still pass with the added field; assert an item's subcategory is returned).
- **Verification bar:** `tsc --noEmit` clean, `vitest run` green, `npm run build` compiles (`/members/equipment` dynamic ƒ). Post-deploy: `prisma db push` → run backfill → eyeball the grouped page shows sections in order with the right items.

## Success criteria

- `/members/equipment` renders as grouped sections (Kegging & Serving, Fermentation, … Other) in that order, each listing its items, empty categories hidden.
- All 53 existing items appear under their approved category after backfill; none lost.
- Board can set/change an equipment item's category via a dropdown in Add and Edit; the change moves it between sections.
- Uncategorized equipment falls under "Other," never disappears.
- Books/library unchanged; checkout/return/renew/board-mutation logic unchanged.
- `groupBySubcategory` + `EQUIPMENT_SUBCATEGORIES` are framework-free and unit-tested.
