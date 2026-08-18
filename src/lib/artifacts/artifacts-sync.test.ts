import { describe, it, expect } from 'vitest'
import { isArtifactFile, folderToCategory, blobPathFor, needsThumbnail, refineCategoryByFolderName, needsPdfConversion } from './artifacts-sync'

// Pure helpers only — no Drive/DB/Blob calls. syncArtifacts's live Drive/Blob/
// unpdf calls are intentionally NOT unit-tested here; dependency injection
// exists so the loop *could* be exercised with fakes, but the real calls are
// exercised in Task 8.

describe('isArtifactFile', () => {
  it('accepts application/pdf', () => {
    expect(isArtifactFile('application/pdf')).toBe(true)
  })

  it('accepts common image mime types', () => {
    expect(isArtifactFile('image/png')).toBe(true)
    expect(isArtifactFile('image/jpeg')).toBe(true)
    expect(isArtifactFile('image/gif')).toBe(true)
    expect(isArtifactFile('image/webp')).toBe(true)
  })

  it('accepts Office docx/pptx mime types', () => {
    expect(
      isArtifactFile('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    ).toBe(true)
    expect(
      isArtifactFile('application/vnd.openxmlformats-officedocument.presentationml.presentation')
    ).toBe(true)
  })

  it('accepts Google-native docs and slides (exported to Office format)', () => {
    expect(isArtifactFile('application/vnd.google-apps.document')).toBe(true)
    expect(isArtifactFile('application/vnd.google-apps.presentation')).toBe(true)
  })

  it('rejects a Drive folder', () => {
    expect(isArtifactFile('application/vnd.google-apps.folder')).toBe(false)
  })

  it('rejects video', () => {
    expect(isArtifactFile('video/mp4')).toBe(false)
  })

  it('rejects plain text', () => {
    expect(isArtifactFile('text/plain')).toBe(false)
  })

  it('rejects an empty or unknown mime type', () => {
    expect(isArtifactFile('')).toBe(false)
    expect(isArtifactFile('application/octet-stream')).toBe(false)
  })
})

describe('folderToCategory', () => {
  it('maps the Workshop Guides folder to workshop-guide', () => {
    expect(folderToCategory('1_I7Po8n9d1gBCze9xphoB5cVTZrLtBhf')).toBe('workshop-guide')
  })

  it('maps the Recipe Library folder to recipe', () => {
    expect(folderToCategory('1b-7-hMPgU6gBNqnNmIxSNROgUILW1jwc')).toBe('recipe')
  })

  it('returns null for an unknown folder id', () => {
    expect(folderToCategory('some-unmapped-folder-id')).toBeNull()
  })
})

describe('blobPathFor', () => {
  it('produces a stable path namespaced by driveId', () => {
    expect(blobPathFor('abc123', 'Recipe.pdf')).toBe('artifacts/abc123/Recipe.pdf')
  })

  it('is stable across calls (deterministic, no randomness)', () => {
    expect(blobPathFor('abc123', 'Recipe.pdf')).toBe(blobPathFor('abc123', 'Recipe.pdf'))
  })

  it('sanitizes unsafe characters out of the file name', () => {
    const path = blobPathFor('abc123', 'My Recipe: Stout #1?.pdf')
    expect(path.startsWith('artifacts/abc123/')).toBe(true)
    expect(path).not.toMatch(/[:#?]/)
    expect(path).not.toMatch(/\s/)
  })

  it('produces different paths for different drive ids with the same name (collision-safe)', () => {
    expect(blobPathFor('abc123', 'Recipe.pdf')).not.toBe(blobPathFor('xyz789', 'Recipe.pdf'))
  })
})

describe('needsThumbnail', () => {
  it('is true for pdf', () => {
    expect(needsThumbnail('application/pdf')).toBe(true)
  })

  it('is true for images', () => {
    expect(needsThumbnail('image/png')).toBe(true)
    expect(needsThumbnail('image/jpeg')).toBe(true)
    expect(needsThumbnail('image/gif')).toBe(true)
    expect(needsThumbnail('image/webp')).toBe(true)
  })

  it('is false for docx/pptx (generic icon instead)', () => {
    expect(
      needsThumbnail('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    ).toBe(false)
    expect(
      needsThumbnail('application/vnd.openxmlformats-officedocument.presentationml.presentation')
    ).toBe(false)
  })
})

describe('needsPdfConversion', () => {
  it('is true for docx', () => {
    expect(
      needsPdfConversion('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    ).toBe(true)
  })

  it('is true for pptx', () => {
    expect(
      needsPdfConversion('application/vnd.openxmlformats-officedocument.presentationml.presentation')
    ).toBe(true)
  })

  it('is true for a Google Doc', () => {
    expect(needsPdfConversion('application/vnd.google-apps.document')).toBe(true)
  })

  it('is true for Google Slides', () => {
    expect(needsPdfConversion('application/vnd.google-apps.presentation')).toBe(true)
  })

  it('is false for pdf (already a PDF)', () => {
    expect(needsPdfConversion('application/pdf')).toBe(false)
  })

  it('is false for images', () => {
    expect(needsPdfConversion('image/png')).toBe(false)
    expect(needsPdfConversion('image/jpeg')).toBe(false)
    expect(needsPdfConversion('image/gif')).toBe(false)
    expect(needsPdfConversion('image/webp')).toBe(false)
  })
})

describe('refineCategoryByFolderName', () => {
  it('switches to technique-nugget for a Technique Nuggets subfolder', () => {
    expect(refineCategoryByFolderName('Technique Nuggets', 'workshop-guide')).toBe('technique-nugget')
  })
  it('switches to presentation / workshop-guide / recipe by name', () => {
    expect(refineCategoryByFolderName('2025 Presentations', null)).toBe('presentation')
    expect(refineCategoryByFolderName('Workshop Materials', null)).toBe('workshop-guide')
    expect(refineCategoryByFolderName('Recipe Box', null)).toBe('recipe')
  })
  it('inherits the parent category for an unmatched subfolder name', () => {
    expect(refineCategoryByFolderName('Saison', 'recipe')).toBe('recipe')
    expect(refineCategoryByFolderName('Kombucha with Dan!', 'workshop-guide')).toBe('workshop-guide')
    expect(refineCategoryByFolderName('Misc', null)).toBeNull()
  })
})
