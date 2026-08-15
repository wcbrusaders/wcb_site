import { fetchAllRosterRows, type MemberRecord } from './roster'

export const OMBUDSMAN = { name: 'Marcella', discord: 'Arycella' } as const

export type BoardMember = { name: string; role: string }

// Explicit display order by first NAME (case-insensitive, prefix match so a
// roster value like "Jordan Lafontaine" still matches "jordan"). Roles are
// displayed as-is; ordering is by this leadership list so title spelling can't
// reshuffle the board. Anyone not listed sorts after, alphabetically.
const NAME_ORDER = ['jordan', 'nate', 'karl', 'marcella']

function orderIndex(name: string): number {
  const n = name.trim().toLowerCase()
  const i = NAME_ORDER.findIndex((first) => n === first || n.startsWith(first + ' '))
  return i === -1 ? NAME_ORDER.length : i
}

export function boardFromRoster(rows: MemberRecord[]): BoardMember[] {
  const members = rows
    .filter((r): r is MemberRecord & { name: string; role: string } =>
      r.isBoard && !!r.role && !!r.name)
    .map((r) => ({ name: r.name, role: r.role }))
  return members.sort((a, b) => {
    const ai = orderIndex(a.name), bi = orderIndex(b.name)
    if (ai !== bi) return ai - bi
    return a.name.localeCompare(b.name)
  })
}

export async function getBoard(): Promise<BoardMember[]> {
  try {
    return boardFromRoster(await fetchAllRosterRows())
  } catch {
    return []
  }
}
