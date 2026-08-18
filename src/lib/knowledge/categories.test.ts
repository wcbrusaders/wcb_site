import { describe, it, expect } from 'vitest'
import {
  NOTE_CATEGORIES,
  CATEGORY_LABELS,
  MEMBER_VISIBLE_CATEGORIES,
  audienceForCategory,
  isValidCategory,
  categoriesForViewer,
  guessCategoryFromTitle,
} from './categories'

describe('NOTE_CATEGORIES', () => {
  it('lists the six categories in members-first, officers-second order', () => {
    expect(NOTE_CATEGORIES.map((c) => c.value)).toEqual([
      'meeting',
      'event',
      'workshop',
      'board',
      'annual',
      'financial',
    ])
  })

  it('has the expected labels and audiences', () => {
    expect(NOTE_CATEGORIES).toEqual([
      { value: 'meeting', label: 'Meeting', audience: 'members' },
      { value: 'event', label: 'Event', audience: 'members' },
      { value: 'workshop', label: 'Workshop', audience: 'members' },
      { value: 'board', label: 'Board Meeting', audience: 'officers' },
      { value: 'annual', label: 'Annual Meeting', audience: 'officers' },
      { value: 'financial', label: 'Financial', audience: 'officers' },
    ])
  })
})

describe('CATEGORY_LABELS', () => {
  it('maps every category value to its label', () => {
    expect(CATEGORY_LABELS).toEqual({
      meeting: 'Meeting',
      event: 'Event',
      workshop: 'Workshop',
      board: 'Board Meeting',
      annual: 'Annual Meeting',
      financial: 'Financial',
    })
  })
})

describe('audienceForCategory', () => {
  it('maps member categories to members', () => {
    expect(audienceForCategory('meeting')).toBe('members')
    expect(audienceForCategory('event')).toBe('members')
    expect(audienceForCategory('workshop')).toBe('members')
  })

  it('maps officer categories to officers', () => {
    expect(audienceForCategory('board')).toBe('officers')
    expect(audienceForCategory('annual')).toBe('officers')
    expect(audienceForCategory('financial')).toBe('officers')
  })

  it('fails safe to officers for an unknown category', () => {
    expect(audienceForCategory('bogus')).toBe('officers')
    expect(audienceForCategory('')).toBe('officers')
  })
})

describe('isValidCategory', () => {
  it('accepts each of the six category values', () => {
    for (const cat of NOTE_CATEGORIES) {
      expect(isValidCategory(cat.value)).toBe(true)
    }
  })

  it('rejects unknown strings, wrong types, and junk', () => {
    expect(isValidCategory('bogus')).toBe(false)
    expect(isValidCategory('')).toBe(false)
    expect(isValidCategory(null)).toBe(false)
    expect(isValidCategory(undefined)).toBe(false)
    expect(isValidCategory(42)).toBe(false)
    expect(isValidCategory({ value: 'meeting' })).toBe(false)
  })
})

describe('categoriesForViewer', () => {
  it('returns only the 3 member categories for non-board viewers', () => {
    const result = categoriesForViewer(false)
    expect(result).toEqual(['meeting', 'event', 'workshop'])
    expect(result).not.toContain('board')
    expect(result).not.toContain('annual')
    expect(result).not.toContain('financial')
  })

  it('returns all 6 categories in NOTE_CATEGORIES order for board viewers', () => {
    expect(categoriesForViewer(true)).toEqual([
      'meeting',
      'event',
      'workshop',
      'board',
      'annual',
      'financial',
    ])
  })
})

describe('MEMBER_VISIBLE_CATEGORIES', () => {
  it('is exactly the 3 member-audience categories', () => {
    expect(MEMBER_VISIBLE_CATEGORIES).toEqual(['meeting', 'event', 'workshop'])
  })
})

describe('guessCategoryFromTitle', () => {
  it('guesses financial for financial/audit titles', () => {
    expect(guessCategoryFromTitle('Q2 Financial Report')).toBe('financial')
    expect(guessCategoryFromTitle('Annual Audit Findings')).toBe('financial')
  })

  it('guesses annual for annual titles', () => {
    expect(guessCategoryFromTitle('Annual Meeting Minutes')).toBe('annual')
  })

  it('guesses board for board titles', () => {
    expect(guessCategoryFromTitle('Board Meeting Notes - August')).toBe('board')
  })

  it('checks officer-sensitive categories before meeting/workshop so combined titles resolve correctly', () => {
    expect(guessCategoryFromTitle('Annual Board Meeting')).toBe('annual')
  })

  it('guesses workshop for workshop titles', () => {
    expect(guessCategoryFromTitle('Off-Flavor Workshop')).toBe('workshop')
  })

  it('guesses event for brew day / festival / mead day / event titles', () => {
    expect(guessCategoryFromTitle('Brew Day at Jordan\'s')).toBe('event')
    expect(guessCategoryFromTitle('Brewday Sign-up')).toBe('event')
    expect(guessCategoryFromTitle('Fall Festival Planning')).toBe('event')
    expect(guessCategoryFromTitle('Mead Day 2026')).toBe('event')
    expect(guessCategoryFromTitle('Club Event This Weekend')).toBe('event')
  })

  it('falls back to meeting for plain monthly-meeting titles', () => {
    expect(guessCategoryFromTitle('WCB Monthly Meeting')).toBe('meeting')
    expect(guessCategoryFromTitle('July Meeting Notes')).toBe('meeting')
  })

  it('is case-insensitive', () => {
    expect(guessCategoryFromTitle('FINANCIAL REPORT')).toBe('financial')
    expect(guessCategoryFromTitle('board meeting')).toBe('board')
  })
})
