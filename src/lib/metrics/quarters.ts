// Shared quarter helpers for the membership metrics engine.
//
// Multiple reports (Trends, Composition's Cohort Retention, Revenue) group
// data by calendar quarter using identical UTC-based logic. This module is
// the single source of truth for that logic so it isn't copy-pasted across
// report modules.
//
// All quarter boundaries use UTC date construction (consistent with
// kpis.ts's completeMonths) to avoid local-timezone drift, since these
// modules are fed date-only values that parse as UTC midnight.

/** A quarter identified by its year and quarter-of-year (1-4). */
export type QuarterKey = { year: number; q: 1 | 2 | 3 | 4 }

function quarterOfMonth(monthIndex0: number): 1 | 2 | 3 | 4 {
  return (Math.floor(monthIndex0 / 3) + 1) as 1 | 2 | 3 | 4
}

/** The quarter (UTC) containing the given date. */
export function quarterOf(date: Date): QuarterKey {
  return { year: date.getUTCFullYear(), q: quarterOfMonth(date.getUTCMonth()) }
}

/** Half-open [start, end) UTC date range for a quarter. */
export function quarterRange(key: QuarterKey): { start: Date; end: Date } {
  const startMonth = (key.q - 1) * 3
  const start = new Date(Date.UTC(key.year, startMonth, 1))
  const end = new Date(Date.UTC(key.year, startMonth + 3, 1))
  return { start, end }
}

export function quarterLabel(key: QuarterKey): string {
  return `${key.year}-Q${key.q}`
}

/** The quarter immediately following the given one. */
export function nextQuarter(key: QuarterKey): QuarterKey {
  return key.q === 4 ? { year: key.year + 1, q: 1 } : { year: key.year, q: ((key.q + 1) as 1 | 2 | 3 | 4) }
}

/** Ordered list of quarters from `first` through `last`, inclusive. */
export function enumerateQuarters(first: QuarterKey, last: QuarterKey): QuarterKey[] {
  const quarters: QuarterKey[] = []
  let cur = first
  // Linear index comparison avoids infinite loop if first > last.
  const toIndex = (k: QuarterKey) => k.year * 4 + (k.q - 1)
  const lastIndex = toIndex(last)
  while (toIndex(cur) <= lastIndex) {
    quarters.push(cur)
    cur = nextQuarter(cur)
  }
  return quarters
}

/** Linear ordering index for a QuarterKey (year*4 + q-1); useful for min/max comparisons. */
export function quarterIndex(key: QuarterKey): number {
  return key.year * 4 + (key.q - 1)
}
