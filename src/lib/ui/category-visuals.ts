// Category visual language (design "System B"): the single source of truth
// mapping each note/artifact category to a color + icon + label. Cards,
// badges, and section labels all read from here so the members area speaks
// one consistent visual vocabulary.
//
// Colors are plain 6-digit hex so component CSS can blend them with
// `color-mix(in srgb, <color> N%, transparent)` for tints and accents.
//
// Pure module: no db/react imports. Unknown input NEVER throws — it resolves
// to NEUTRAL_VISUAL so any caller can always render a card.

import { CATEGORY_LABELS as NOTE_LABELS, isValidCategory } from '@/lib/knowledge/categories'
import {
  CATEGORY_LABELS as ARTIFACT_LABELS,
  isValidArtifactCategory,
} from '@/lib/artifacts/categories'

export interface CategoryVisual {
  color: string // #rrggbb
  icon: string // emoji glyph
  label: string
}

// Brand amber for the club's flagship content; a distinct hue per other
// category so a member can tell them apart at a glance.
const AMBER = '#ff9500'
const TEAL = '#4dd0e1'
const PURPLE = '#b388ff'
const GREEN = '#66bb6a'
const SLATE = '#7f9cf5'

/** Officer-only content is flagged with this regardless of its category. */
export const OFFICERS_VISUAL = { color: '#ff6b6b', icon: '🔒', label: 'Officers only' } as const

export const NEUTRAL_VISUAL: CategoryVisual = { color: '#8a8a8a', icon: '📄', label: 'Item' }

// Icon + color per artifact category. Labels come from the taxonomy so they
// can't drift out of sync.
const ARTIFACT_STYLE: Record<string, { color: string; icon: string }> = {
  recipe: { color: AMBER, icon: '🍺' },
  'technique-nugget': { color: TEAL, icon: '🎯' },
  'workshop-guide': { color: GREEN, icon: '📓' },
  presentation: { color: PURPLE, icon: '📊' },
}

// Icon + color per note category. Meeting-family notes share the slate hue;
// workshop notes echo the workshop-guide green; officer-sensitive categories
// (board/annual/financial) still get their own hue but always render the
// OFFICERS_VISUAL badge on top via the audience check at the call site.
const NOTE_STYLE: Record<string, { color: string; icon: string }> = {
  meeting: { color: SLATE, icon: '📝' },
  event: { color: AMBER, icon: '🎉' },
  workshop: { color: GREEN, icon: '📓' },
  board: { color: PURPLE, icon: '🗂️' },
  annual: { color: PURPLE, icon: '📅' },
  financial: { color: TEAL, icon: '💵' },
}

/** Visual for a note category value. Unknown/junk → NEUTRAL_VISUAL. */
export function categoryVisual(value: unknown): CategoryVisual {
  if (isValidCategory(value)) {
    const style = NOTE_STYLE[value]
    if (style) return { ...style, label: NOTE_LABELS[value] }
  }
  return NEUTRAL_VISUAL
}

/** Visual for an artifact category value. Unknown/junk → NEUTRAL_VISUAL. */
export function artifactCategoryVisual(value: unknown): CategoryVisual {
  if (isValidArtifactCategory(value)) {
    const style = ARTIFACT_STYLE[value]
    if (style) return { ...style, label: ARTIFACT_LABELS[value] }
  }
  return NEUTRAL_VISUAL
}
