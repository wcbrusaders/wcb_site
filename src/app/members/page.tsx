import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

export default async function MembersPage() {
  const session = await auth()
  // Defense-in-depth: middleware already gates /members/*, but never render
  // this page without a session (e.g. if the matcher is ever misconfigured).
  if (!session?.user) redirect('/login')
  const user = session.user

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-3xl mx-auto px-6 py-24">
        <p className="text-accent font-medium tracking-wide uppercase text-sm mb-4">
          Members Hub
        </p>
        <h1 className="text-3xl md:text-4xl font-bold mb-6">WCB Members</h1>

        <div className="rounded-2xl border border-border/50 bg-card-bg/30 p-6 md:p-8">
          <p className="text-foreground/60 mb-1">Signed in as</p>
          <p className="text-lg font-semibold mb-4">{user?.email}</p>

          <div className="flex flex-wrap gap-3 text-sm">
            {user?.tier && (
              <span className="inline-flex items-center gap-2 bg-accent/10 text-accent px-3 py-1 rounded-full border border-accent/30">
                {user.tier}
              </span>
            )}
            {user?.isBoard && (
              <span className="inline-flex items-center gap-2 bg-foreground/5 text-foreground/70 px-3 py-1 rounded-full border border-border/60">
                Board Member
              </span>
            )}
          </div>
        </div>

        <p className="text-foreground/40 text-sm mt-8">
          You&apos;re in. This page proves the login flow works.
        </p>
      </main>
    </div>
  )
}
