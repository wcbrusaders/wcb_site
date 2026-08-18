import Anthropic from '@anthropic-ai/sdk'
import { extractText } from 'unpdf'

// Builds the system/user prompt pair for AI-titling a club artifact document.
// Pure — no API calls. The reviewing officer approves every suggestion before
// it's published, so this is drafting for that reviewer, not publishing
// directly (same posture as buildExtractionPrompt in knowledge/extract-notes.ts).
export function buildArtifactDescribePrompt(
  textExcerpt: string,
  filename: string,
): { system: string; user: string } {
  const system = `You are titling a club document for the WCB (homebrew club) artifacts library. Every suggestion you produce enters an officer review queue — a human officer reviews and can edit or reject your suggestion before anything is published. You are drafting for that reviewer, not publishing directly.

## Inputs

You are given the document's extracted TEXT (may be partial or thin — it's an excerpt, and some documents extract poorly) and its original FILENAME, which is a weak hint about the document's identity (it may be a real name, a generic export name like a scanner or app default, or unrelated to the content).

## Task

Produce two things:

1. A concise, human-readable TITLE in proper case — the document's real name or subject (e.g. a beer/recipe name, or a talk/presentation title). If the text clearly indicates what the document is, use that. If the text is thin, garbled, or unhelpful, base the title on the filename instead (cleaned up, not the raw filename string).
2. A one-sentence DESCRIPTION of what the document is. Within that sentence, note the document TYPE it appears to be — for example "reads like meeting minutes", "a recipe sheet", "a slide deck", or "a how-to guide". This type note helps the reviewing officer catch mis-categorization, such as a meeting recap that landed in the artifacts pipeline by mistake.

## Honesty constraint

Invent nothing not supported by the text. If the text doesn't tell you what something is, don't guess at specifics — describe what you can actually observe, and fall back to the filename for the title when the text is too thin to name the subject confidently.

## Output format

Output EXACTLY two lines, in this order, and nothing else — no preamble, no commentary:
TITLE: <one line>
DESCRIPTION: <one sentence>`

  const user = `FILENAME: ${filename}

EXTRACTED TEXT:
${textExcerpt}`

  return { system, user }
}

export interface ArtifactDescription {
  title: string
  description: string
}

interface DescribeDeps {
  client?: Anthropic
}

// Strips extension + separators from a filename to produce a fallback title
// when the AI call fails or returns nothing usable. Simple, deterministic:
// replace [_-] with space, drop the extension, collapse whitespace, trim.
export function cleanFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^./\\]+$/, '')
  return withoutExt
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Parses the "TITLE: ...\nDESCRIPTION: ..." response text. Returns null if no
// TITLE line is present (caller falls back to the cleaned filename).
export function parseDescribeResponse(text: string): ArtifactDescription | null {
  const titleMatch = text.match(/^\s*TITLE:\s*(.+?)\s*$/m)
  if (!titleMatch) return null

  const descriptionMatch = text.match(/^\s*DESCRIPTION:\s*(.+?)\s*$/m)

  return {
    title: titleMatch[1].trim(),
    description: descriptionMatch ? descriptionMatch[1].trim() : '',
  }
}

// Calls Anthropic to generate a title + description from a document's
// extracted text and filename. Falls back to a cleaned filename (empty
// description) if the call throws, the response is empty, or no TITLE line
// is found — this must never throw or block the sync pipeline.
export async function describeArtifact(
  textExcerpt: string,
  filename: string,
  deps: DescribeDeps = {},
): Promise<ArtifactDescription> {
  const fallback: ArtifactDescription = { title: cleanFilename(filename), description: '' }

  try {
    const client = deps.client ?? new Anthropic()
    const { system, user } = buildArtifactDescribePrompt(textExcerpt, filename)

    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 500,
      system,
      messages: [{ role: 'user', content: user }],
    })

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()

    if (!text) return fallback

    const parsed = parseDescribeResponse(text)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

// Extracts up to maxChars of text from a PDF's bytes for use as the excerpt
// fed to describeArtifact. Defensive: any failure (corrupt PDF, unsupported
// content, etc.) returns an empty string rather than throwing, so a bad PDF
// never blocks the sync pipeline — describeArtifact/cleanFilename's filename
// fallback takes over from an empty excerpt.
export async function extractPdfText(pdfBytes: Buffer, maxChars = 4000): Promise<string> {
  try {
    const { text } = await extractText(new Uint8Array(pdfBytes), { mergePages: true })
    return text.slice(0, maxChars)
  } catch {
    return ''
  }
}
