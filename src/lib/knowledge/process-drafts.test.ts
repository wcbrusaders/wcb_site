import { describe, it, expect, vi } from 'vitest'
import { draftToReviewFields, processPendingDrafts } from './process-drafts'
import type { ExtractedMeetingNote } from './extract-notes'

// Pure mapping + a fake-db loop test — no live API calls, no live Prisma
// client. draftToReviewFields is asserted directly; processPendingDrafts is
// exercised against an in-memory fake db + a stubbed extract fn.

describe('draftToReviewFields', () => {
  it('maps a successful extract to the in_review update fields', () => {
    const extract: ExtractedMeetingNote = {
      title: 'WCB Monthly Meeting — July 2026',
      bodyHtml: '<h1>WCB Monthly Meeting — July 2026</h1><p>Content.</p>',
      excerpt: 'Content.',
    }
    const now = new Date('2026-08-17T12:00:00.000Z')

    expect(draftToReviewFields(extract, now)).toEqual({
      processedTitle: extract.title,
      processedHtml: extract.bodyHtml,
      excerpt: extract.excerpt,
      status: 'in_review',
      processedAt: now,
      errorText: null,
    })
  })
})

// Minimal fake db shape: just the draftArticle.findMany/update surface that
// processPendingDrafts uses.
type FakeDraft = {
  id: string
  rawText: string
  status: string
  processedTitle?: string | null
  processedHtml?: string | null
  excerpt?: string | null
  errorText?: string | null
  processedAt?: Date | null
}

function makeFakeDb(drafts: FakeDraft[]) {
  return {
    draftArticle: {
      findMany: vi.fn(async ({ where }: { where: { status: string } }) =>
        drafts.filter((d) => d.status === where.status),
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeDraft> }) => {
        const draft = drafts.find((d) => d.id === where.id)
        if (!draft) throw new Error('not found')
        Object.assign(draft, data)
        return draft
      }),
    },
  }
}

describe('processPendingDrafts', () => {
  it('processes a normal needs_processing draft into in_review with mapped fields', async () => {
    const now = new Date('2026-08-17T12:00:00.000Z')
    const drafts: FakeDraft[] = [
      { id: 'd1', rawText: 'raw transcript', status: 'needs_processing' },
    ]
    const db = makeFakeDb(drafts)
    const extract = vi.fn(async (): Promise<ExtractedMeetingNote> => ({
      title: 'WCB Monthly Meeting — July 2026',
      bodyHtml: '<h1>WCB Monthly Meeting — July 2026</h1><p>Content.</p>',
      excerpt: 'Content.',
    }))

    const result = await processPendingDrafts({ db: db as never, extract, now: () => now })

    expect(result).toEqual({ processed: 1, errored: 0 })
    expect(drafts[0]).toMatchObject(
      draftToReviewFields(
        {
          title: 'WCB Monthly Meeting — July 2026',
          bodyHtml: '<h1>WCB Monthly Meeting — July 2026</h1><p>Content.</p>',
          excerpt: 'Content.',
        },
        now,
      ),
    )
  })

  it('sets status error with errorText when extract throws, and continues to the next draft', async () => {
    const now = new Date('2026-08-17T12:00:00.000Z')
    const drafts: FakeDraft[] = [
      { id: 'd1', rawText: 'bad transcript', status: 'needs_processing' },
      { id: 'd2', rawText: 'good transcript', status: 'needs_processing' },
    ]
    const db = makeFakeDb(drafts)
    const extract = vi.fn(async (rawText: string): Promise<ExtractedMeetingNote> => {
      if (rawText === 'bad transcript') throw new Error('anthropic API exploded')
      return {
        title: 'WCB Monthly Meeting — July 2026',
        bodyHtml: '<h1>Title</h1><p>Content.</p>',
        excerpt: 'Content.',
      }
    })

    const result = await processPendingDrafts({ db: db as never, extract, now: () => now })

    expect(result).toEqual({ processed: 1, errored: 1 })

    expect(drafts[0].status).toBe('error')
    expect(drafts[0].errorText).toBe('anthropic API exploded')
    expect(drafts[0].processedAt).toEqual(now)

    // second draft in the same batch still processes despite the first's failure
    expect(drafts[1].status).toBe('in_review')
    expect(drafts[1].processedTitle).toBe('WCB Monthly Meeting — July 2026')
  })

  it('treats empty bodyHtml as a failure (guard) and does not move the draft to in_review', async () => {
    const now = new Date('2026-08-17T12:00:00.000Z')
    const drafts: FakeDraft[] = [
      { id: 'd1', rawText: 'transcript with nothing extractable', status: 'needs_processing' },
    ]
    const db = makeFakeDb(drafts)
    const extract = vi.fn(async (): Promise<ExtractedMeetingNote> => ({
      title: 'WCB Meeting Notes',
      bodyHtml: '   ',
      excerpt: '',
    }))

    const result = await processPendingDrafts({ db: db as never, extract, now: () => now })

    expect(result).toEqual({ processed: 0, errored: 1 })
    expect(drafts[0].status).toBe('error')
    expect(drafts[0].errorText).toBe('empty extraction')
    expect(drafts[0].processedAt).toEqual(now)
  })

  it('processes multiple needs_processing drafts and ignores drafts in other statuses', async () => {
    const now = new Date('2026-08-17T12:00:00.000Z')
    const drafts: FakeDraft[] = [
      { id: 'd1', rawText: 'raw 1', status: 'needs_processing' },
      { id: 'd2', rawText: 'raw 2', status: 'in_review' },
      { id: 'd3', rawText: 'raw 3', status: 'needs_processing' },
    ]
    const db = makeFakeDb(drafts)
    const extract = vi.fn(async (): Promise<ExtractedMeetingNote> => ({
      title: 'Title',
      bodyHtml: '<h1>Title</h1><p>Body.</p>',
      excerpt: 'Body.',
    }))

    const result = await processPendingDrafts({ db: db as never, extract, now: () => now })

    expect(result).toEqual({ processed: 2, errored: 0 })
    expect(extract).toHaveBeenCalledTimes(2)
    expect(drafts[1].status).toBe('in_review') // untouched, was already in_review before call — sanity: still same value
  })
})
