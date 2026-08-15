import { fetchAllRosterRows, type MemberRecord } from './roster'

export const OMBUDSMAN = { name: 'Marcella', discord: 'Arycella' } as const

export type BoardMember = { name: string; role: string }

const ROLE_ORDER = ['President', 'Vice President', 'Treasurer', 'Secretary', 'Ombudsman']

export function boardFromRoster(rows: MemberRecord[]): BoardMember[] {
  const members = rows
    .filter((r): r is MemberRecord & { name: string; role: string } =>
      r.isBoard && !!r.role && !!r.name)
    .map((r) => ({ name: r.name, role: r.role }))
  return members.sort((a, b) => {
    const ai = ROLE_ORDER.indexOf(a.role), bi = ROLE_ORDER.indexOf(b.role)
    const ar = ai === -1 ? ROLE_ORDER.length : ai
    const br = bi === -1 ? ROLE_ORDER.length : bi
    if (ar !== br) return ar - br
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
