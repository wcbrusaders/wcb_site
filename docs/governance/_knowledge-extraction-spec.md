# Meeting-Notes AI Extraction Spec (validated by spike, 2026-08-17)

Validated against a real Gemini transcript (WCB Monthly Meeting 2026-07-16, 23,736 chars).
This is the extraction contract the pipeline's AI pass must implement for MEETING NOTES.

## Goal
A non-attendee reading the published note should come away with **the same brewing takeaways as if they had attended** — not minutes. Teach the substance; don't just log that a topic came up.

## Preview summary (added 2026)
The extraction must emit a leading `SUMMARY:` line — a 2–3 sentence, meeting-specific plain-text blurb used as the card/preview excerpt (NOT the first-200-chars of the body, which is always the title + participants boilerplate and made every preview identical). Stored as `DraftArticle.excerpt` / `Article.excerpt`.

## Meeting vs. event (added 2026)
Not everything recorded is a monthly meeting — the club also records EVENTS for remote members (Mead Day, brew days, workshops, brewery visits). The AI decides from the transcript and titles accordingly: meeting → "WCB Monthly Meeting — <date>"; event → the event's real name (e.g. "WCB Mead Day — <date>"). Ambiguous → "WCB Meeting — <date>".

## Fixed template (same every note)
1. **Title:** meeting → `WCB Monthly Meeting — <date>`, event → event name — <date> (+ location if in the transcript)
2. **Named participants:** only people identifiable from the transcript, labeled honestly as "named from the transcript; not a full attendance list." Keep real names; keep handles as-is (e.g. bigfoot29708) if that's all that's given.
3. **What we covered — the brewing:** one subsection per brewing topic (workshop / technique nugget / style guide / demos). **Full teaching depth** — the technique, the numbers, the reasoning, the pitfalls — written so a reader learns it and can use it.
4. **Homebrew & tasting:** brief — what was shared/tasted.
5. **Competitions & logistics:** brief quick-reference bullets (dates, entry rules, distributions).
6. **Decisions & action items:** club decisions + concrete follow-ups.

## Depth rule (validated choice)
- **Teach the highlights deeply:** the workshop/technique/style/demo segments get full lesson treatment.
- **Summarize the admin:** competitions, logistics, decisions stay tight bullets.

## MUST STRIP (personal / off-topic / sensitive) — validated exclusions
From the test transcript, all of these were correctly removed and MUST NOT appear:
- Personal life: vacations/travel itineraries, weather chit-chat, pets/dog behavior, family/spouse asides, home aquarium/fish, campground ownership.
- Off-topic tangents: bison-attack video, quantum-mechanics aside.
- Sensitive club-politics / third parties: inter-club leadership conflicts (e.g. White Street negotiation details), commentary on other breweries' business failures.
- Legally-sensitive: moonshine/distilling legality discussion (distilling is not the club's brewing focus and carries legal nuance) — cut.
- Keep the *decision* that came out of a sensitive discussion when it's legitimate club business (e.g. "stay an independent club") WITHOUT the gossip/rationale about third parties.

## KEEP
- Attendee/named-participant info (per the "include attendees" requirement).
- All genuine brewing knowledge, numbers, techniques, gotchas.
- Club decisions + action items (attribution optional; folded into decisions is fine).

## Honesty constraints
- Do NOT invent attendees, facts, numbers, or citations not in the transcript.
- If the roll-call isn't in the transcript, say "named participants" — don't fabricate a full list.

## Officer review
Every extracted note enters an officer review queue and an officer approves before it publishes. (User chose "close, needs tuning" then approved the retuned output — auto-publish is NOT assumed; review gate stands.)

## Other content types (lower risk, not yet spiked in depth)
- **Workshop guides:** instructional docs; likely publishable with light cleanup (strip AI preamble), no heavy personal-content risk. Confirm on a real doc during build.
- **Recipes:** semi-structured (ingredients/steps). Treat as articles for now; a structured recipe type is a future option.
