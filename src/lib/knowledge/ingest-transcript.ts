// Ingest a raw meeting transcript pasted by a board member (no Drive doc).
// Produces the same needs_processing DraftArticle the Drive sync creates, so
// the rest of the pipeline (AI extract -> review -> publish) is identical.
//
// DraftArticle.sourceDriveId is @unique + required (it's the Drive sync key).
// A pasted draft has no Drive id, so we synthesize a namespaced unique value
// (`paste:<id>`) — keeps the unique contract and marks the draft's origin.

export const PASTE_SOURCE_PREFIX = 'paste:'

export type PastedDraftResult =
  | {
      ok: true
      data: {
        sourceDriveId: string
        sourceName: string
        kind: 'meeting-notes'
        status: 'needs_processing'
        rawText: string
      }
    }
  | { ok: false; reason: string }

/**
 * Validate + shape a pasted transcript into DraftArticle create fields.
 * `id` is any unique token (e.g. a cuid) the caller provides for the synthetic
 * sourceDriveId. Pure — no db/IO — so it's unit tested directly.
 */
export function buildPastedDraftData(title: string, rawText: string, id: string): PastedDraftResult {
  const name = title.trim()
  if (!name) return { ok: false, reason: 'Title is required.' }
  const text = rawText.trim()
  if (!text) return { ok: false, reason: 'Transcript text is required.' }
  return {
    ok: true,
    data: {
      sourceDriveId: `${PASTE_SOURCE_PREFIX}${id}`,
      sourceName: name,
      kind: 'meeting-notes',
      status: 'needs_processing',
      rawText: text,
    },
  }
}
