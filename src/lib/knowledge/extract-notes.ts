import Anthropic from '@anthropic-ai/sdk'
import sanitizeHtml from 'sanitize-html'

// Allowed output tags — mirrors the allowlist we'd otherwise keep in
// src/lib/knowledge/normalize.ts (that module doesn't exist yet in this
// codebase; inlined here so extraction output is sanitized consistently
// with whatever normalizer lands later).
const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'p',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'b',
  'i',
  'a',
  'blockquote',
  'br',
  'hr',
  'code',
  'pre',
]

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href'],
  },
  // Explicitly strip class/style from every tag (belt-and-suspenders on top
  // of the default disallowedTagsMode, which already drops unknown attrs).
  transformTags: {
    '*': (tagName, attribs) => {
      const { class: _class, style: _style, ...rest } = attribs
      return { tagName, attribs: rest }
    },
  },
}

// Single source of truth for article-body sanitization. Used on the AI-extraction
// output AND on any officer-edited HTML before it is published, so officer edits
// can't introduce a stored-XSS vector (scripts, event handlers, styles).
export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS).trim()
}

export function buildExtractionPrompt(rawText: string): { system: string; user: string } {
  const system = `You are the WCB (club) knowledge-pipeline extraction assistant. You turn a raw meeting transcript into a single published meeting note. Every note you produce enters an officer review queue and a human officer approves it before anything is published — you are drafting for that reviewer, not publishing directly.

## Goal

A non-attendee reading the published note should come away with the same brewing takeaways as if they had attended — not minutes. Teach the substance; don't just log that a topic came up.

## Fixed template (use this structure every time, in this order)

1. **Title** — First decide from the transcript whether this was a regular club MEETING (monthly gathering with workshop/technique/business) or an EVENT (a specific activity recorded for remote members — e.g. a Mead Day, a brew day, a workshop session, a brewery visit). Title accordingly: a meeting is "WCB Monthly Meeting — <date>"; an event uses the event's real name, e.g. "WCB Mead Day — <date>" or "WCB Brew Day: Pilsner — <date>". Include location if the transcript states one. Use an <h1> for the title. If it's genuinely ambiguous, default to "WCB Meeting — <date>".
2. **Named participants** — list only people identifiable from the transcript (real names as given, or handles as-is, e.g. bigfoot29708, if that's all the transcript provides). Label this section honestly: named from the transcript; not a full attendance list. If no roll-call or attendee list appears in the transcript at all, say "named participants" were not identifiable rather than fabricating a full list — never invent a roster.
3. **What we covered — the brewing** — one subsection (use <h3>) per brewing topic: workshop segments, technique nuggets, style guides, demos. This is the section that needs full teaching depth: the technique, the numbers, the reasoning, the pitfalls — written so a reader learns it and can use it themselves, not just a note that the topic was discussed.
4. **Homebrew & tasting** — brief. What homebrew was shared or tasted, and any notable feedback. Keep this tight.
5. **Competitions & logistics** — brief quick-reference bullets: dates, entry rules, distributions, and other administrative logistics.
6. **Decisions & action items** — club decisions and concrete follow-ups. Attribution is optional; folding attribution into the decision text is fine.

## Depth rule

Teach the highlights deeply: workshop, technique, style, and demo segments in "What we covered — the brewing" get full lesson treatment — enough that someone who missed the meeting actually learns the material.
Summarize the admin tightly: competitions, logistics, and decisions stay as brief, scannable bullets. Do not give admin content the same depth as brewing content.

## MUST STRIP — do not include any of the following, under any circumstances

- **Personal life**: vacations, travel itineraries, weather chit-chat, pets or pet/dog behavior, family or spouse asides, home aquarium or fish, campground ownership, or similar personal-life content.
- **Off-topic tangents**: things like a bison-attack video, a quantum-mechanics aside, or other topics unrelated to club brewing business.
- **Sensitive club-politics and third-party commentary**: inter-club leadership conflicts (e.g. negotiation details with another organization), commentary on other breweries' business failures, or gossip/rationale about third parties. If a legitimate club decision emerged from a sensitive discussion (for example, "we will remain an independent club"), keep the decision itself in "Decisions & action items" but strip the surrounding gossip, rationale, or third-party commentary.
- **Legally-sensitive content**: distilling or moonshine legality discussion. Distilling is not the club's brewing focus and carries legal nuance — cut it entirely.

## Keep

- Attendee / named-participant information, per the naming rule above.
- All genuine brewing knowledge, numbers, techniques, and gotchas.
- Club decisions and action items (attribution optional).

## Honesty constraints

- Do not invent attendees, facts, numbers, or citations that are not in the transcript. Invent nothing.
- If the roll-call is not present in the transcript, say "named participants" — do not fabricate a full attendance list.

## Output format

First, output a single line that begins EXACTLY with "SUMMARY:" followed by a 2–3 sentence plain-text summary of the meeting's brewing highlights and key decisions — the kind of blurb that would make a good preview card. This summary must be specific to THIS meeting (mention the actual topics/decisions), NOT a generic "the club met and discussed brewing." Do not use any HTML in the SUMMARY line. Example: "SUMMARY: Covered Star San chemistry (keep pH below 3, mix with RO water) and summer dry-yeast strategy. Started a club yeast bank and agreed to broaden the club's scope to all fermentation."

After the SUMMARY line, output the full note as clean semantic HTML only, using exclusively these tags: h1, h2, h3, p, ul, li, strong, em. Do not use any other tags (no div, span, table, img, script, or inline styles/classes). Do not wrap the output in markdown code fences. Do not include any preamble, explanation, or commentary other than the SUMMARY line and the HTML body.`

  const user = rawText

  return { system, user }
}

export interface ExtractedMeetingNote {
  title: string
  bodyHtml: string
  excerpt: string
}

interface ExtractDeps {
  client?: Anthropic
}

const DEFAULT_TITLE = 'WCB Meeting Notes'
const EXCERPT_MAX_LENGTH = 200

export async function extractMeetingNote(
  rawText: string,
  deps: ExtractDeps = {},
): Promise<ExtractedMeetingNote> {
  const client = deps.client ?? new Anthropic()
  const { system, user } = buildExtractionPrompt(rawText)

  // Stream the request: with a high max_tokens the SDK REQUIRES streaming
  // (a non-streaming call is rejected as it may exceed the 10-min timeout).
  // .finalMessage() reassembles the complete response for us.
  const stream = client.messages.stream({
    model: 'claude-opus-5',
    // A recap is a compression of the transcript; the longest we've seen is
    // ~8k chars (~2k tokens). 32k gives large headroom even for a marathon
    // meeting AND for adaptive thinking, which shares this budget. If a recap
    // ever still hits the cap, the stop_reason guard below catches it rather
    // than silently landing a half-note in the review queue.
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content: user }],
  })
  const response = await stream.finalMessage()

  // Never let a truncated recap pass as complete. The API tells us why it
  // stopped; 'max_tokens' means the output was cut off mid-thought.
  if (response.stop_reason === 'max_tokens') {
    throw new Error('extraction truncated (hit max_tokens) — meeting too long for the current output budget')
  }

  const raw = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()

  // Split off the leading "SUMMARY: ..." line (the AI-written preview blurb)
  // from the HTML body. Falls back to a derived excerpt if the model omitted it.
  const { summary, rest } = splitSummary(raw)
  const bodyHtml = sanitizeArticleHtml(rest)
  const title = deriveTitle(bodyHtml)
  // Prefer the AI's summary line; fall back to first-content if it was omitted.
  const excerpt = summary || deriveExcerpt(bodyHtml)

  return { title, bodyHtml, excerpt }
}

// Extracts a leading "SUMMARY: ..." line. Everything after it is the HTML body.
// Tolerant: matches the marker anywhere in the first few lines, case-insensitive.
function splitSummary(raw: string): { summary: string; rest: string } {
  const m = raw.match(/^\s*SUMMARY:\s*(.+?)\s*(?:\n|$)/i)
  if (!m) return { summary: '', rest: raw }
  const summary = m[1].replace(/<[^>]*>/g, '').trim().slice(0, 400)
  const rest = raw.slice(m.index! + m[0].length).trim()
  return { summary, rest }
}

function deriveTitle(html: string): string {
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (h1Match) {
    const text = stripTags(h1Match[1]).trim()
    if (text) return text
  }

  const headingMatch = html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)
  if (headingMatch) {
    const text = stripTags(headingMatch[1]).trim()
    if (text) return text
  }

  return DEFAULT_TITLE
}

function deriveExcerpt(html: string): string {
  const text = stripTags(html).replace(/\s+/g, ' ').trim()
  if (text.length <= EXCERPT_MAX_LENGTH) return text
  return `${text.slice(0, EXCERPT_MAX_LENGTH).trimEnd()}…`
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ')
}
