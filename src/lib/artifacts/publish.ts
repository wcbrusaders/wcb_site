// Pure helpers for turning a reviewed ArtifactDraft into a publishable Artifact.
// No DB/network access here — keep testable without mocks.

import type { ArtifactCategory } from './categories'

export interface DraftForArtifact {
  sourceName: string
  sourceDriveId: string
  blobUrl: string
  mimeType: string
  thumbnailUrl: string | null
  sizeBytes: number | null
}

export interface ArtifactCreateFields {
  title: string
  description: string | null
  category: ArtifactCategory
  audience: 'members' | 'officers'
  blobUrl: string
  mimeType: string
  thumbnailUrl: string | null
  sourceDriveId: string
  sizeBytes: number | null
  publishedAt: Date
  publishedBy: string
}

export interface DraftToArtifactOptions {
  title: string
  description?: string
  category: ArtifactCategory
  audience: 'members' | 'officers'
  officerEmail: string
  now: Date
}

/** Maps a reviewed artifact draft to Artifact create fields. `category`/`audience`
 * are officer-picked and validated by the caller before this runs. */
export function draftToArtifact(
  draft: DraftForArtifact,
  opts: DraftToArtifactOptions,
): ArtifactCreateFields {
  const trimmedTitle = opts.title.trim()
  const trimmedDescription = opts.description?.trim()

  return {
    title: trimmedTitle || draft.sourceName,
    description: trimmedDescription || null,
    category: opts.category,
    audience: opts.audience,
    blobUrl: draft.blobUrl,
    mimeType: draft.mimeType,
    thumbnailUrl: draft.thumbnailUrl ?? null,
    sourceDriveId: draft.sourceDriveId,
    sizeBytes: draft.sizeBytes ?? null,
    publishedAt: opts.now,
    publishedBy: opts.officerEmail,
  }
}
