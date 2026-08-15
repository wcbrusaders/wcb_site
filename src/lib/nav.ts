export type IconName = 'home' | 'trophy' | 'wrench' | 'book' | 'shield'
export type NavLink = { href: string; label: string; icon: IconName; board?: boolean }

// Single source of truth for the members nav. Usage order (Hub first, then the
// club's real priority: Competitions > Equipment > Books), Holdings last (board).
// Note: "Books" is the LABEL; the route stays /members/library.
export const MEMBER_LINKS: NavLink[] = [
  { href: '/members', label: 'Hub', icon: 'home' },
  { href: '/members/competitions', label: 'Competitions', icon: 'trophy' },
  { href: '/members/equipment', label: 'Equipment', icon: 'wrench' },
  { href: '/members/library', label: 'Books', icon: 'book' },
  { href: '/members/holdings', label: 'Holdings', icon: 'shield', board: true },
  { href: '/members/admin', label: 'Admin', icon: 'shield', board: true },
]

export function visibleLinks(isBoard: boolean): NavLink[] {
  return MEMBER_LINKS.filter((l) => !l.board || isBoard)
}

// Hub (/members) is active only on the exact hub route; feature links are active
// on their route and any nested path under it.
export function isActive(pathname: string, href: string): boolean {
  const p = pathname.replace(/\/$/, '') || '/'   // normalize trailing slash
  if (href === '/members') return p === '/members'
  return p === href || p.startsWith(href + '/')
}
