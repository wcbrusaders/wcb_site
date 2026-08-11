import { test, expect } from 'vitest'
import { MAPPING } from './backfill-equipment-subcategory.mjs'
import { EQUIPMENT_SUBCATEGORIES } from '../src/lib/lending'

test('backfill MAPPING: 53 titles, all values valid categories, no dupes', () => {
  const entries = Object.entries(MAPPING)
  expect(entries.length).toBe(53)
  const known = new Set<string>(EQUIPMENT_SUBCATEGORIES)
  for (const [title, cat] of entries) {
    expect(known.has(cat as string)).toBe(true) // every category is valid
    expect(typeof title).toBe('string')
  }
  // no title appears twice (object keys already dedupe, but assert count of unique keys)
  expect(new Set(Object.keys(MAPPING)).size).toBe(53)
})
