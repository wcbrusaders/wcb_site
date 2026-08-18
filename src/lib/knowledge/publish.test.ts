import { describe, it, expect } from 'vitest'
import { slugForNote, draftToArticle } from './publish'

describe('slugForNote', () => {
  it('lowercases and hyphenates the title', () => {
    expect(slugForNote('WCB Monthly Meeting', null)).toBe('wcb-monthly-meeting')
  })

  it('appends the meeting date (YYYY-MM-DD) when present', () => {
    const d = new Date('2026-07-16T00:00:00.000Z')
    expect(slugForNote('WCB Monthly Meeting', d)).toBe('wcb-monthly-meeting-2026-07-16')
  })

  it('strips punctuation and collapses whitespace/hyphens', () => {
    expect(slugForNote('  WCB Monthly Meeting — July!! 2026  ', null)).toBe('wcb-monthly-meeting-july-2026')
  })

  it('handles titles that already contain hyphens without doubling them', () => {
    expect(slugForNote('Off-Flavor Workshop', null)).toBe('off-flavor-workshop')
  })

  it('produces a stable slug regardless of time-of-day on the meeting date', () => {
    const d = new Date('2026-01-05T23:59:59.000Z')
    expect(slugForNote('Title', d)).toBe('title-2026-01-05')
  })
})

describe('draftToArticle', () => {
  const now = new Date('2026-08-17T12:00:00.000Z')
  const meetingDate = new Date('2026-07-16T00:00:00.000Z')

  const draft = {
    processedTitle: 'WCB Monthly Meeting — July 2026',
    processedHtml: '<h1>WCB Monthly Meeting</h1><p>Body</p>',
    excerpt: 'Body',
    meetingDate,
  }

  it('maps a draft to Article create fields', () => {
    const article = draftToArticle(draft, 'officer@wcb.com', now)
    expect(article).toEqual({
      slug: 'wcb-monthly-meeting-july-2026-2026-07-16',
      title: 'WCB Monthly Meeting — July 2026',
      bodyHtml: '<h1>WCB Monthly Meeting</h1><p>Body</p>',
      excerpt: 'Body',
      category: 'meeting-notes',
      meetingDate,
      publishedAt: now,
      publishedBy: 'officer@wcb.com',
    })
  })

  it('handles a draft with no meetingDate', () => {
    const article = draftToArticle({ ...draft, meetingDate: null }, 'officer@wcb.com', now)
    expect(article.slug).toBe('wcb-monthly-meeting-july-2026')
    expect(article.meetingDate).toBeNull()
  })
})
