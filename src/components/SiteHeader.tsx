import Link from 'next/link'
import { auth, signOut } from '@/lib/auth'

// Global header rendered on every page (via the root layout).
// Left: WCB home link (always). Right: member nav + auth.
// Server component: reads the session directly.
export async function SiteHeader() {
  const session = await auth()
  const signedIn = !!session?.user?.memberId

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur">
      <nav className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-4 md:px-6 py-3 text-sm">
        {/* Left: always a way home */}
        <Link href="/" className="font-bold tracking-tight hover:text-accent transition-colors">
          WCB
        </Link>

        {/* Right: member nav + auth */}
        <div className="flex items-center gap-2 md:gap-4">
          {signedIn ? (
            <>
              <Link href="/members" className="text-foreground/70 hover:text-foreground transition-colors">
                Hub
              </Link>
              <Link href="/members/library" className="text-foreground/70 hover:text-foreground transition-colors">
                Library
              </Link>
              <Link href="/members/equipment" className="text-foreground/70 hover:text-foreground transition-colors">
                Equipment
              </Link>
              <form
                action={async () => {
                  'use server'
                  await signOut({ redirectTo: '/' })
                }}
              >
                <button
                  type="submit"
                  className="text-foreground/50 hover:text-foreground px-3 py-1.5 rounded-full border border-border/50 transition-colors"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="bg-accent hover:bg-accent-hover text-background font-medium px-4 py-1.5 rounded-full transition-colors"
            >
              Member Login
            </Link>
          )}
        </div>
      </nav>
    </header>
  )
}
