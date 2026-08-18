import { describe, it, expect } from 'vitest'
import {
  ARTIFACT_CATEGORIES,
  CATEGORY_LABELS,
  isValidArtifactCategory,
  isValidAudience,
} from './categories'

describe('ARTIFACT_CATEGORIES', () => {
  it('lists the four categories in order with their labels', () => {
    expect(ARTIFACT_CATEGORIES).toEqual([
      { value: 'presentation', label: 'Presentation' },
      { value: 'technique-nugget', label: 'Technique Nugget' },
      { value: 'workshop-guide', label: 'Workshop Guide' },
      { value: 'recipe', label: 'Recipe' },
    ])
  })
})

describe('CATEGORY_LABELS', () => {
  it('maps all four category values to their labels', () => {
    expect(CATEGORY_LABELS).toEqual({
      presentation: 'Presentation',
      'technique-nugget': 'Technique Nugget',
      'workshop-guide': 'Workshop Guide',
      recipe: 'Recipe',
    })
  })
})

describe('isValidArtifactCategory', () => {
  it('accepts each of the four category values', () => {
    expect(isValidArtifactCategory('presentation')).toBe(true)
    expect(isValidArtifactCategory('technique-nugget')).toBe(true)
    expect(isValidArtifactCategory('workshop-guide')).toBe(true)
    expect(isValidArtifactCategory('recipe')).toBe(true)
  })

  it('rejects unknown strings, wrong types, and junk', () => {
    expect(isValidArtifactCategory('bogus')).toBe(false)
    expect(isValidArtifactCategory('')).toBe(false)
    expect(isValidArtifactCategory(null)).toBe(false)
    expect(isValidArtifactCategory(undefined)).toBe(false)
    expect(isValidArtifactCategory(42)).toBe(false)
    expect(isValidArtifactCategory({ value: 'recipe' })).toBe(false)
  })
})

describe('isValidAudience', () => {
  it('accepts members and officers', () => {
    expect(isValidAudience('members')).toBe(true)
    expect(isValidAudience('officers')).toBe(true)
  })

  it('rejects unknown strings, wrong types, and junk', () => {
    expect(isValidAudience('bogus')).toBe(false)
    expect(isValidAudience('')).toBe(false)
    expect(isValidAudience(null)).toBe(false)
    expect(isValidAudience(undefined)).toBe(false)
    expect(isValidAudience(42)).toBe(false)
    expect(isValidAudience({ value: 'members' })).toBe(false)
  })
})
