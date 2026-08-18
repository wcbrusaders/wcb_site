import { describe, it, expect } from 'vitest'
import { NOTE_CATEGORIES } from '@/lib/knowledge/categories'
import { ARTIFACT_CATEGORIES } from '@/lib/artifacts/categories'
import {
  categoryVisual,
  artifactCategoryVisual,
  NEUTRAL_VISUAL,
  type CategoryVisual,
} from './category-visuals'

function assertWellFormed(v: CategoryVisual) {
  // A hex color like #ff9500 that our card CSS can consume via color-mix.
  expect(v.color).toMatch(/^#[0-9a-f]{6}$/i)
  // A short, non-empty icon glyph.
  expect(v.icon.length).toBeGreaterThan(0)
  // A human label.
  expect(v.label.length).toBeGreaterThan(0)
}

describe('categoryVisual (notes)', () => {
  it('resolves every note category to a well-formed visual', () => {
    for (const c of NOTE_CATEGORIES) {
      assertWellFormed(categoryVisual(c.value))
    }
  })

  it('uses the taxonomy label for the visual label', () => {
    // The visual should not invent a different label than the taxonomy.
    expect(categoryVisual('board').label).toBe('Board Meeting')
    expect(categoryVisual('meeting').label).toBe('Meeting')
  })

  it('fails safe to the neutral visual for unknown/junk input', () => {
    expect(categoryVisual('bogus')).toEqual(NEUTRAL_VISUAL)
    expect(categoryVisual('')).toEqual(NEUTRAL_VISUAL)
    expect(categoryVisual(null)).toEqual(NEUTRAL_VISUAL)
    expect(categoryVisual(undefined)).toEqual(NEUTRAL_VISUAL)
  })
})

describe('artifactCategoryVisual', () => {
  it('resolves every artifact category to a well-formed visual', () => {
    for (const c of ARTIFACT_CATEGORIES) {
      assertWellFormed(artifactCategoryVisual(c.value))
    }
  })

  it('assigns the System-B brand colors to the core artifact categories', () => {
    // Recipe rides the club's amber brand color.
    expect(artifactCategoryVisual('recipe').color).toBe('#ff9500')
    expect(artifactCategoryVisual('recipe').icon).toBe('🍺')
    expect(artifactCategoryVisual('presentation').icon).toBe('📊')
    expect(artifactCategoryVisual('technique-nugget').icon).toBe('🎯')
    expect(artifactCategoryVisual('workshop-guide').icon).toBe('📓')
  })

  it('fails safe to the neutral visual for unknown/junk input', () => {
    expect(artifactCategoryVisual('bogus')).toEqual(NEUTRAL_VISUAL)
    expect(artifactCategoryVisual(null)).toEqual(NEUTRAL_VISUAL)
  })
})

describe('NEUTRAL_VISUAL', () => {
  it('is itself well-formed so callers can always render a card', () => {
    assertWellFormed(NEUTRAL_VISUAL)
  })
})
