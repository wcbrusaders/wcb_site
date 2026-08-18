// Note categories: single source of truth for the club-notes taxonomy.
//
// Every export here derives from NOTE_CATEGORIES. Adding a new category later
// (e.g. technique-nugget, style-guide) should be a one-line addition to that
// array — everything else (labels, audience mapping, valid-value check,
// viewer filtering) follows automatically.
//
// Pure module: no db/react imports.

export type Audience = 'members' | 'officers'

interface CategoryDef<V extends string> {
  value: V
  label: string
  audience: Audience
}

export const NOTE_CATEGORIES = [
  { value: 'meeting', label: 'Meeting', audience: 'members' },
  { value: 'event', label: 'Event', audience: 'members' },
  { value: 'workshop', label: 'Workshop', audience: 'members' },
  { value: 'board', label: 'Board Meeting', audience: 'officers' },
  { value: 'annual', label: 'Annual Meeting', audience: 'officers' },
  { value: 'financial', label: 'Financial', audience: 'officers' },
] as const satisfies readonly CategoryDef<string>[]

export type NoteCategory = (typeof NOTE_CATEGORIES)[number]['value']

export const CATEGORY_LABELS: Record<NoteCategory, string> = Object.fromEntries(
  NOTE_CATEGORIES.map((c) => [c.value, c.label])
) as Record<NoteCategory, string>

const AUDIENCE_BY_CATEGORY: Record<NoteCategory, Audience> = Object.fromEntries(
  NOTE_CATEGORIES.map((c) => [c.value, c.audience])
) as Record<NoteCategory, Audience>

/**
 * Resolve the audience for a category value. Unknown values fail safe to
 * 'officers' (private) rather than leaking to all members.
 */
export function audienceForCategory(value: string): Audience {
  if (isValidCategory(value)) {
    return AUDIENCE_BY_CATEGORY[value]
  }
  return 'officers'
}

const VALID_CATEGORY_VALUES: ReadonlySet<string> = new Set(NOTE_CATEGORIES.map((c) => c.value))

export function isValidCategory(v: unknown): v is NoteCategory {
  return typeof v === 'string' && VALID_CATEGORY_VALUES.has(v)
}

export const MEMBER_VISIBLE_CATEGORIES: NoteCategory[] = NOTE_CATEGORIES.filter(
  (c) => c.audience === 'members'
).map((c) => c.value)

/**
 * Categories a viewer is allowed to see/use. Non-board viewers get only the
 * member-audience categories; board viewers get all categories, in
 * NOTE_CATEGORIES order.
 */
export function categoriesForViewer(isBoard: boolean): NoteCategory[] {
  if (isBoard) {
    return NOTE_CATEGORIES.map((c) => c.value)
  }
  return [...MEMBER_VISIBLE_CATEGORIES]
}

/**
 * Heuristic category guess from a note title, for seeding/migration of
 * existing notes that predate the category field. Officer-sensitive
 * categories are checked first so a title like "Annual Board Meeting"
 * resolves to 'annual' rather than falling through to the generic 'meeting'.
 */
export function guessCategoryFromTitle(title: string): NoteCategory {
  if (/financial|audit/i.test(title)) return 'financial'
  if (/annual/i.test(title)) return 'annual'
  if (/board/i.test(title)) return 'board'
  if (/workshop/i.test(title)) return 'workshop'
  if (/brew\s?day|festival|mead day|event/i.test(title)) return 'event'
  return 'meeting'
}
