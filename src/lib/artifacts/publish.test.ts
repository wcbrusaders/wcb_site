import { describe, it, expect } from 'vitest'
import { draftToArtifact } from './publish'

describe('draftToArtifact', () => {
  const now = new Date('2026-08-18T12:00:00.000Z')

  const draft = {
    sourceName: 'Off-Flavor Workshop Slides',
    sourceDriveId: 'drive-123',
    blobUrl: 'https://blob.example.com/off-flavor.pdf',
    mimeType: 'application/pdf',
    thumbnailUrl: 'https://blob.example.com/off-flavor-thumb.png',
    sizeBytes: 4096,
  }

  it('maps fields correctly', () => {
    const artifact = draftToArtifact(draft, {
      title: 'Off-Flavor Workshop',
      description: 'Slides from the August workshop.',
      category: 'workshop-guide',
      audience: 'members',
      officerEmail: 'officer@wcb.com',
      now,
    })

    expect(artifact).toEqual({
      title: 'Off-Flavor Workshop',
      description: 'Slides from the August workshop.',
      category: 'workshop-guide',
      audience: 'members',
      blobUrl: 'https://blob.example.com/off-flavor.pdf',
      mimeType: 'application/pdf',
      thumbnailUrl: 'https://blob.example.com/off-flavor-thumb.png',
      sourceDriveId: 'drive-123',
      sizeBytes: 4096,
      publishedAt: now,
      publishedBy: 'officer@wcb.com',
    })
  })

  it('falls back to sourceName when title is empty', () => {
    const artifact = draftToArtifact(draft, {
      title: '   ',
      description: undefined,
      category: 'presentation',
      audience: 'officers',
      officerEmail: 'officer@wcb.com',
      now,
    })
    expect(artifact.title).toBe('Off-Flavor Workshop Slides')
  })

  it('trims a provided title', () => {
    const artifact = draftToArtifact(draft, {
      title: '  Off-Flavor Workshop  ',
      description: undefined,
      category: 'presentation',
      audience: 'officers',
      officerEmail: 'officer@wcb.com',
      now,
    })
    expect(artifact.title).toBe('Off-Flavor Workshop')
  })

  it('maps an empty or missing description to null', () => {
    const empty = draftToArtifact(draft, {
      title: 'Title',
      description: '   ',
      category: 'recipe',
      audience: 'members',
      officerEmail: 'officer@wcb.com',
      now,
    })
    expect(empty.description).toBeNull()

    const missing = draftToArtifact(draft, {
      title: 'Title',
      description: undefined,
      category: 'recipe',
      audience: 'members',
      officerEmail: 'officer@wcb.com',
      now,
    })
    expect(missing.description).toBeNull()
  })

  it('defaults thumbnailUrl and sizeBytes to null when absent on the draft', () => {
    const artifact = draftToArtifact(
      { ...draft, thumbnailUrl: null, sizeBytes: null },
      {
        title: 'Title',
        description: undefined,
        category: 'recipe',
        audience: 'members',
        officerEmail: 'officer@wcb.com',
        now,
      },
    )
    expect(artifact.thumbnailUrl).toBeNull()
    expect(artifact.sizeBytes).toBeNull()
  })
})
