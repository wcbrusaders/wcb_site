# WCB Member Guide — Design

**Status:** SUPERSEDED by `2026-08-17-wcb-member-resources-design.md` — the guide is now Lane 1 ("How-to & Getting Started") of the Resources area. The per-page ground-truth content below still governs Lane 1; the top-level structure/naming is replaced by the Resources spec.
**Date:** 2026-08-17

## Purpose

The members area has features (library, equipment, competitions, soon store) and the club has activities (grain buys, Discord, meetings) — but nothing explains **how any of it works** or **what to do first**. A new member lands in `/members` and has to reverse-engineer the club by clicking around. This guide is the club's internal handbook + product help, in one place, doubling as onboarding.

## Organizing principle: by task, not by platform

Sort content by **what a member wants to do**, not by *where* it happens. A newcomer thinks "how do I get equipment?" or "how do I join a grain buy?" — not "I need the Discord page." Each task page states **what** you're doing, then tells you **where** it happens (🌐 on the site, with a direct link · 💬 in Discord, with the command/channel). This future-proofs the guide: when the store ships or a feature moves off Discord onto the site, only *where a task points* changes — the task itself doesn't move.

## Authoring & maintenance

**Phase 1 (this build): hardcoded pages.** Content lives in the codebase as React server components. All content is **derived from the actual code** (procedures verified against the site + bot source — see "Ground truth" below), so the guide matches reality rather than inventing it. Board-editing (DB-backed CMS) is explicitly deferred to a possible Phase 2, only if edit demand proves real (YAGNI).

**Genuinely-external facts** — things that live nowhere in code — are the ONLY placeholders. These get a clearly-marked callout ("Check with the board" / a `GUIDE_TODO` constant) rather than an invented value:
- Dues amount and renewal price
- Meeting cadence / location / orientation steps
- Membership **tier** definitions & benefits (the `Member.tier` field is free-text synced from the roster sheet; there is NO tier enum in code — do not invent "Foundations/Expert" etc.; the homepage's learning-tier marketing is unrelated)
- Shipping-cost policy specifics (code only asserts "club covers shipping")

## Routes & structure

New section under `/members/guide`. One page per task (most scannable). All pages are static server components — **no DB, no server actions, no client state** (so this section can never hit the DB-flapping failure mode, and it's fully cacheable).

```
/members/guide                    Index — "what do you want to do?" card grid + "Start here" pointer
/members/guide/getting-started    New member: first steps
/members/guide/borrow-gear        Borrow books & equipment  (🌐 site)
/members/guide/enter-competition  Enter a competition + club shipping  (🌐 site)
/members/guide/grain-buys         Buy grain in bulk  (💬 Discord + Google Sheet)
/members/guide/brewing-help       Get brewing help — ask the bot  (💬 Discord)
/members/guide/learn              Learn & level up — the Brusaders Academy  (🎓 academy.wcbrusaders.com)
/members/guide/the-club           How the club runs: membership, dues, meetings, board, Code of Conduct
```

Store is **not** its own page yet (it's unbuilt — a disabled "Shop · Coming soon" tile on the hub). It gets a one-line "coming soon" mention inside `borrow-gear` (the closest task) and on the index. When the store ships, add `/members/guide/buy-sell-donate`.

## Discoverability (nav link + dashboard card)

1. **Nav link** — add `{ href: '/members/guide', label: 'Guide', icon: 'help' }` to `MEMBER_LINKS` in `src/lib/nav.ts`. This requires a **new `'help'` icon** in the `IconName` union and in whatever renders the icons (`DesktopTabs`/`MobileNav`), because the existing `'book'` icon is already used by "Books" — Guide must be visually distinct. Place Guide **last among non-board links** (after Books, before the board-only Holdings/Admin). Non-board members then see 5 tabs (Hub, Competitions, Equipment, Books, Guide) — well under the count that caused prior nav overflow.
2. **Dashboard card** — add a prominent **"New here? Start here →"** card near the top of `/members` (`src/app/members/page.tsx`), linking to `/members/guide/getting-started`. It should sit above or beside the membership cards so it's the first thing a new member sees.

## Ground truth (verified from code — content source of truth)

### getting-started
The real new-member path: read Code of Conduct → agree → pay dues via PayPal (on public `/join`, off-site) → get added to the roster/Google Group out-of-band → then you can log in (passwordless 6-digit email code, 10-min expiry; only current roster members can sign in). Once in: explain the hub cards, point to each task page, and prompt them to link Discord (`/link`) and say hi. **Do not** tell members to run `/welcome` — that command was removed from the bot (advertised but dead; a bot-side bug tracked separately).

### borrow-gear (🌐 site)
- Two catalogs: **Books** at `/members/library`, **Equipment** at `/members/equipment` (equipment grouped: Kegging & Serving, Fermentation, Measurement, Transfer & Hoses, Kettle & Hot-side, Bottling, Cleaning, Other).
- **Check out**: click "Check out" when a copy is available and you don't already hold that title. Equipment asks you to pick a condition (New/Good/Fair/Poor/Damaged) on the way out. **Handoff/pickup is arranged out-of-band** (an officer is notified) — the app doesn't track physical location.
- **Loan length: books 30 days, equipment 14 days.** **Renew** up to **2 times** (each renewal adds another full period). **Return** any time; equipment asks the condition it's coming back in.
- One copy per title at a time; **no limit** on how many different titles you hold; **no fines/fees** anywhere.
- **Any member can add a new book/equipment title** to the library (Phase-1 open contributions). Board-only: add copies, edit, archive, manage photos.
- Coming soon: a member **store** (buy/sell/donate gear, proceeds to the club).

### enter-competition (🌐 site)
- `/members/competitions`. **Any member can add a competition** (name, homepage, entry-reg date, beer-arrival date, bottles/entry, ship-to address, optional drop-off). **Any member can add/edit/delete their own entries** (beer name, style, channel, registered flag). Deleting a whole competition is board-only.
- **Three channels** for how a beer gets there: **Club ships** (`club_ship` — the club ships it for you; only these count toward the club pack + reminders and "club covers shipping"), **I ship it** (`self_ship`), **I drop off** (`dropoff`).
- **Deliver-by = beer-arrival deadline − 7 days.** If you have any club-ship entry, the card shows "Get your bottles to the shipper by {date}" and turns urgent (red/⏰) within 7 days. So: **get club-ship bottles to the shipper one week before they must arrive.**
- **Registered** flag is your own bookkeeping that you registered on the comp's website — the app doesn't verify it.
- **Shipment tracking**: officers set the carrier + tracking number (one shipment per comp); **every member can see it** with a clickable UPS/FedEx/DHL link. (USPS unsupported — illegal to mail alcohol.)

### grain-buys (💬 Discord + Google Sheet)
- Grain buys run **2–4 times a year**, coordinated by an officer.
- In Discord, run **`/grainbuy`** (no args) to see the active buy: coordinator, order deadline, delivery date, pickup location, running totals, a link to the order Google Sheet, and a "📋 Browse Products" button (live Epiphany Craft Malt catalog, price per 55 lb bag + SRM).
- **You order in the Google Sheet**, not in Discord: on the "Order Form" tab, enter your first/last name, email, grain type, and quantity (1–10 bags) — price/total auto-fill.
- **Pay via PayPal or Venmo, and you MUST include `WCB - Grain Buy` in the payment note** — that's how payment auto-tracks to your order. Late orders (after the deadline) get flagged.
- The bot posts an announcement to **`#grain-buy`** when a buy opens and sends **3-day and 1-day** deadline reminders. Pickup: Epiphany location shown in the buy; CMC Pilsner pickup is at Bond Brothers, Cary NC.
- No account link required for `/grainbuy`.

### brewing-help (💬 Discord — the bot as a brewing partner)
- The bot is a **brewing-knowledge partner** — ask it in **plain English** (not a slash command). It answers when you: **@mention it** in any channel, **DM it**, post **in a thread**, or post in **`#bot-help`** (no mention needed there).
- Ask about: brewing science & styles, water chemistry, hops/grains/yeast, recipes & brewing guides, quick calcs (e.g. "calculate ABV from OG 1.055 FG 1.012"), and live content from Brulosophy/BYO/HomebrewTalk/BJCP. You can also **attach a beer photo** for feedback.
- Limit: **10 questions/hour**. **No account link required** to ask.
- Example: `@WCB Bot what's the difference between American and English IPA?`

### learn (🎓 the Brusaders Academy — LMS)
- The club runs a full self-paced **Brusaders Academy** at **`academy.wcbrusaders.com`** (verified live — HTTP 200, valid cert). Its own tagline: *"Level up your brewing skills through quests, challenges, and badges."*
- **What's there:** 250+ bite-size lessons ("challenges") across **five tiers — Foundations → Core Brewer → Skilled Brewer → Advanced Brewer → Expert Brewer** — and **three paths: Technical** (brewing science & data), **Creative** (innovation, wild ferm, unique ingredients), **Competitive** (BJCP mastery & competition strategy). You earn **XP, streaks, and badges** as you go, plus **BJCP 2021 style flashcards**. Foundations starts from zero — no experience needed.
- **This is what "your tier" refers to** — the learning progression Foundations→Expert. (Note: the members-site profile also shows a "tier" field from the roster; that's the club's own label and is separate from your academy progress. See the-club below.)
- **How to get in:** open **`academy.wcbrusaders.com`** and click **"Start Your Journey"** → sign in **with Google**. It's a **separate login from this members site** (Google, not the email code), and access is granted to current club members. **Known rough edge (be honest with members):** if the academy says you're not authorized even though your membership is current, its roster hasn't picked you up yet — contact the board/an officer. *(Internal note: this is the LMS's separate roster-sync failing closed — see the cross-surface "raise up" items; not fixed by this guide.)*
- Content is still growing (the Competitive path's upper tiers are partly in progress); a lesson with no content yet shows a "coming soon" note.

### the-club (membership, dues, meetings, board, CoC)
- **Your membership** (shown on the hub, all read-only, synced from the club roster): status, tier, tenure ("Member for…"), join/renew/last-payment dates, linked partner, and Drive & Calendar access (derived from real Google Group membership). **You can't edit your own profile in the app** — ask the board to change your details (they can update your secondary/partner email).
- **Dues / renewal:** GUIDE_TODO — amount + how/when to renew (paid off-site via PayPal; the join/dues PayPal link is on `/join`). Not in code.
- **Meetings:** GUIDE_TODO — cadence, location, what to expect. Not in code.
- **Membership tier (the roster label):** the "Tier" on your profile is a free-text label set by the club on the roster — it is NOT your academy progress. GUIDE_TODO — what the roster tiers mean / benefits (not in code; do not invent values). For the *learning* tiers (Foundations→Expert), see the **Learn & level up** page.
- **The board & Code of Conduct:** link to the public `/board` and `/code-of-conduct` pages. Summarize the member-facing parts of the ratified CoC: how to report a concern (Ombudsman or any board member), the board's 48-hour acknowledgment / 7-day decision commitment, and the strike ladder (Correction → Warning → Board decides). Note access can be paused (interim) or removed by board vote.
- **Discord slash commands you can use as a member:** `/link` (connect your Discord to your membership — DM-based, use your join email; needed for `/dashboard`), `/grainbuy`, `/dashboard`, `/help`, `/catchup` (AI recap of what you missed in a channel). No account link needed to ask the bot brewing questions.

## Non-goals / out of scope
- No DB model, no server actions, no editing UI (deferred Phase 2).
- Not documenting the store's mechanics (unbuilt — "coming soon" only).
- Not fixing the bot's `/welcome` and `/admin startgrainbuy` help-text bugs here (bot-refocus session).
- Not duplicating the full RAG/brewing knowledge on the site — the guide *points to* the bot for that.

## Files (anticipated)
- Create: `src/app/members/guide/page.tsx` (index) + `getting-started/`, `borrow-gear/`, `enter-competition/`, `grain-buys/`, `brewing-help/`, `learn/`, `the-club/` page.tsx files.
- Create: a small shared layout/card component for the guide (consistent "🌐 site / 💬 Discord" tag, section header, back-to-guide link).
- Modify: `src/lib/nav.ts` (add Guide link + `'help'` IconName), the icon renderers (`DesktopTabs`/`MobileNav`) for the new icon.
- Modify: `src/app/members/page.tsx` ("Start here" card).
- Optional: a `guide-content.ts` constants module if it keeps the page components lean (GUIDE_TODO markers centralized).
