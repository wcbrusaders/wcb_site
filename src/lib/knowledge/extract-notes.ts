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

1. **Title** — "WCB Monthly Meeting — <date>" (include location too if the transcript states one). Use an <h1> for the title.
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

Output clean semantic HTML only, using exclusively these tags: h1, h2, h3, p, ul, li, strong, em. Do not use any other tags (no div, span, table, img, script, or inline styles/classes). Do not wrap the output in markdown code fences. Do not include any preamble, explanation, or commentary outside the HTML itself — output only the HTML document body content.`

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

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content: user }],
  })

  const rawHtml = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()

  const bodyHtml = sanitizeArticleHtml(rawHtml)
  const title = deriveTitle(bodyHtml)
  const excerpt = deriveExcerpt(bodyHtml)

  return { title, bodyHtml, excerpt }
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
