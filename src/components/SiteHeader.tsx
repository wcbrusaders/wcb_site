import Link from 'next/link'
import { auth, signOut } from '@/lib/auth'

// Global header rendered on every page (via the root layout). Shows a Login
// link when signed out; a "Members Hub" link + Sign out when signed in.
// Server component: reads the session directly.
export async function SiteHeader() {
  const session = await auth()
  const signedIn = !!session?.user?.memberId

  return (
    <header className="absolute top-0 right-0 z-50 p-4 md:p-6">
      <nav className="flex items-center gap-3 text-sm">
        {signedIn ? (
          <>
            <Link
              href="/members"
              className="bg-accent hover:bg-accent-hover text-background font-medium px-4 py-2 rounded-full transition-colors"
            >
              Members Hub
            </Link>
            <form
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/' })
              }}
            >
              <button
                type="submit"
                className="text-foreground/60 hover:text-foreground px-3 py-2 rounded-full border border-border/50 transition-colors"
              >
                Sign out
              </button>
            </form>
          </>
        ) : (
          <Link
            href="/login"
            className="bg-accent hover:bg-accent-hover text-background font-medium px-4 py-2 rounded-full transition-colors"
          >
            Member Login
          </Link>
        )}
      </nav>
    </header>
  )
}
