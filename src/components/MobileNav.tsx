'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { NavLink } from '@/lib/nav'
import { isActive } from '@/lib/nav'
import { NavIcon } from '@/components/NavIcons'
import { signOutAction } from '@/app/actions/auth-actions'

export function MobileNav({ links, signedIn }: { links: NavLink[]; signedIn: boolean }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Signed-out: no drawer, just the login pill (matches desktop).
  if (!signedIn) {
    return (
      <Link href="/login" className="md:hidden bg-accent hover:bg-accent-hover text-background font-medium px-4 py-1.5 rounded-full text-sm transition-colors">
        Member Login
      </Link>
    )
  }

  return (
    <div className="md:hidden">
      <button aria-label="Open menu" onClick={() => setOpen(true)} className="flex flex-col gap-[5px] p-2">
        <span className="block h-0.5 w-5 bg-foreground rounded"></span>
        <span className="block h-0.5 w-5 bg-foreground rounded"></span>
        <span className="block h-0.5 w-5 bg-foreground rounded"></span>
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />
          {/* drawer */}
          <div className="fixed right-0 top-0 z-50 h-full w-72 bg-background border-l border-border p-3 flex flex-col">
            <button aria-label="Close menu" onClick={() => setOpen(false)} className="self-end text-foreground/60 text-2xl leading-none px-2">×</button>
            <nav className="mt-2 flex flex-col">
              {links.map((l, i) => {
                const prevBoard = i > 0 && links[i - 1].board
                const showDivider = l.board && !prevBoard   // divider before the first board link
                const active = isActive(pathname, l.href)
                return (
                  <div key={l.href}>
                    {showDivider && <div className="my-2 h-px bg-border mx-3" />}
                    <Link href={l.href} onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg text-[15px] ${active ? 'bg-accent/10 text-accent' : 'text-foreground/85 hover:bg-card-bg'}`}>
                      <NavIcon name={l.icon} className="h-[18px] w-[18px]" />
                      {l.label}
                      {l.board && <span className="ml-auto text-[9px] text-accent border border-accent/40 rounded-full px-1.5 py-0.5">BOARD</span>}
                    </Link>
                  </div>
                )
              })}
            </nav>
            <form action={signOutAction} className="mt-auto">
              <button type="submit" className="w-full border border-border rounded-full py-2.5 text-sm text-foreground/60 hover:text-foreground">Sign out</button>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
