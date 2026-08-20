import { describe, it, expect } from 'vitest'
import { buildPastedDraftData, PASTE_SOURCE_PREFIX } from './ingest-transcript'

describe('buildPastedDraftData', () => {
  it('builds a needs_processing meeting-notes draft from pasted title + text', () => {
    const r = buildPastedDraftData('WCB Monthly Meeting Notes — Aug 20, 2026', '  raw transcript text  ', 'abc123')
    expect(r).toEqual({
      ok: true,
      data: {
        sourceDriveId: `${PASTE_SOURCE_PREFIX}abc123`,
        sourceName: 'WCB Monthly Meeting Notes — Aug 20, 2026',
        kind: 'meeting-notes',
        status: 'needs_processing',
        rawText: 'raw transcript text', // trimmed
      },
    })
  })

  it('rejects an empty/whitespace title', () => {
    expect(buildPastedDraftData('   ', 'some text', 'id1')).toEqual({ ok: false, reason: 'Title is required.' })
  })

  it('rejects empty/whitespace transcript text', () => {
    expect(buildPastedDraftData('A title', '   ', 'id1')).toEqual({ ok: false, reason: 'Transcript text is required.' })
  })

  it('trims the title but keeps internal spacing', () => {
    const r = buildPastedDraftData('  My Meeting  ', 'text', 'id2')
    expect(r.ok && r.data.sourceName).toBe('My Meeting')
  })

  it('namespaces the synthetic sourceDriveId so it never collides with real Drive ids', () => {
    const r = buildPastedDraftData('t', 'x', 'zzz')
    expect(r.ok && r.data.sourceDriveId.startsWith(PASTE_SOURCE_PREFIX)).toBe(true)
  })
})
