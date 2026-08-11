'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { NavLink } from '@/lib/nav'
import { isActive } from '@/lib/nav'
import { NavIcon } from '@/components/NavIcons'
import { signOutAction } from '@/app/actions/auth-actions'

export function DesktopTabs({ links }: { links: NavLink[] }) {
  const pathname = usePathname()
  return (
    <div className="hidden md:flex items-center gap-5 text-sm">
      {links.map((l, i) => {
        const prevBoard = i > 0 && links[i - 1].board
        const showDivider = l.board && !prevBoard
        const active = isActive(pathname, l.href)
        if (l.board) {
          return (
            <div key={l.href} className="flex items-center gap-5">
              {showDivider && <span className="w-px h-4 bg-border" />}
              <Link href={l.href}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 ${active ? 'border-accent text-accent' : 'border-accent/35 text-accent/90 hover:text-accent'}`}>
                <NavIcon name={l.icon} className="h-4 w-4" /> {l.label}
              </Link>
            </div>
          )
        }
        return (
          <Link key={l.href} href={l.href}
            className={`inline-flex items-center gap-1.5 pb-1 border-b-2 ${active ? 'border-accent text-foreground' : 'border-transparent text-foreground/70 hover:text-foreground'} transition-colors`}>
            <NavIcon name={l.icon} className="h-[18px] w-[18px]" /> {l.label}
          </Link>
        )
      })}
      <form action={signOutAction}>
        <button type="submit" className="text-foreground/50 hover:text-foreground px-3 py-1.5 rounded-full border border-border/50 transition-colors">Sign out</button>
      </form>
    </div>
  )
}
