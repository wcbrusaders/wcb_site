import Link from 'next/link'
import Image from 'next/image'
import { auth } from '@/lib/auth'
import { visibleLinks } from '@/lib/nav'
import { DesktopTabs } from '@/components/DesktopTabs'
import { MobileNav } from '@/components/MobileNav'

// Global header on every page (root layout). Server component: reads the
// session, filters board links server-side, and passes ONLY plain NavLink[]
// data to the client tab/drawer components (no auth/prisma/JSX crossing).
export async function SiteHeader() {
  const session = await auth()
  const signedIn = !!session?.user?.memberId
  const isBoard = !!session?.user?.isBoard
  const links = signedIn ? visibleLinks(isBoard) : []

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur">
      <nav className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-4 md:px-6 py-3">
        {/* Brand: crest + wordmark, links home */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <Image src="/images/wcb-crest.png" alt="Wake County Brusaders" width={40} height={42} className="h-8 w-auto" priority />
          <span className="font-extrabold tracking-tight leading-[1.02] text-[13px] hidden sm:block">
            WAKE COUNTY<br /><span className="text-accent">BRUSADERS</span>
          </span>
        </Link>

        {/* Desktop tabs (client, for active-state) — hidden on mobile */}
        {signedIn ? (
          <DesktopTabs links={links} />
        ) : (
          <Link href="/login" className="hidden md:inline-flex bg-accent hover:bg-accent-hover text-background font-medium px-4 py-1.5 rounded-full text-sm transition-colors">
            Member Login
          </Link>
        )}

        {/* Mobile hamburger/drawer (client) — hidden on desktop */}
        <MobileNav links={links} signedIn={signedIn} />
      </nav>
    </header>
  )
}
