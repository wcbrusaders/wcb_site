// Artifact categories: single source of truth for the club-artifacts taxonomy.
//
// Every export here derives from ARTIFACT_CATEGORIES. Adding a new category
// later should be a one-line addition to that array — everything else
// (labels, valid-value check) follows automatically.
//
// Pure module: no db/react imports.

interface CategoryDef<V extends string> {
  value: V
  label: string
}

export const ARTIFACT_CATEGORIES = [
  { value: 'presentation', label: 'Presentation' },
  { value: 'technique-nugget', label: 'Technique Nugget' },
  { value: 'workshop-guide', label: 'Workshop Guide' },
  { value: 'recipe', label: 'Recipe' },
] as const satisfies readonly CategoryDef<string>[]

export type ArtifactCategory = (typeof ARTIFACT_CATEGORIES)[number]['value']

export const CATEGORY_LABELS: Record<ArtifactCategory, string> = Object.fromEntries(
  ARTIFACT_CATEGORIES.map((c) => [c.value, c.label])
) as Record<ArtifactCategory, string>

const VALID_CATEGORY_VALUES: ReadonlySet<string> = new Set(ARTIFACT_CATEGORIES.map((c) => c.value))

export function isValidArtifactCategory(v: unknown): v is ArtifactCategory {
  return typeof v === 'string' && VALID_CATEGORY_VALUES.has(v)
}

const VALID_AUDIENCE_VALUES: ReadonlySet<string> = new Set(['members', 'officers'])

export function isValidAudience(v: unknown): v is 'members' | 'officers' {
  return typeof v === 'string' && VALID_AUDIENCE_VALUES.has(v)
}
