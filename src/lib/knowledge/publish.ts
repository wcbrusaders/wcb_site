// Pure helpers for turning a reviewed DraftArticle into a publishable Article.
// No DB/network access here — keep testable without mocks.

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Lowercase-hyphen slug from a title, with the meeting date appended when
 * present (e.g. "wcb-monthly-meeting-2026-07-16"). Collision-safety (e.g.
 * appending -2, -3 on a duplicate) is left to the caller/DB unique constraint
 * for now — this is a stub that produces a stable, readable slug.
 */
export function slugForNote(title: string, meetingDate: Date | null): string {
  const base = title
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!meetingDate) return base
  return `${base}-${isoDate(meetingDate)}`
}

export interface DraftForArticle {
  processedTitle: string | null
  processedHtml: string | null
  excerpt: string | null
  meetingDate: Date | null
}

export interface ArticleCreateFields {
  slug: string
  title: string
  bodyHtml: string
  excerpt: string | null
  category: 'meeting-notes'
  meetingDate: Date | null
  publishedAt: Date
  publishedBy: string
}

/** Maps a reviewed draft to Article create fields (Phase A: meeting-notes only). */
export function draftToArticle(
  draft: DraftForArticle,
  officerEmail: string,
  now: Date,
): ArticleCreateFields {
  const title = draft.processedTitle ?? ''
  return {
    slug: slugForNote(title, draft.meetingDate),
    title,
    bodyHtml: draft.processedHtml ?? '',
    excerpt: draft.excerpt,
    category: 'meeting-notes',
    meetingDate: draft.meetingDate,
    publishedAt: now,
    publishedBy: officerEmail,
  }
}
