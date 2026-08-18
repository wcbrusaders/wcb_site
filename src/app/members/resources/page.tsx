// src/app/members/resources/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { HOWTO_PAGES } from '@/lib/resources-links'
import { categoriesForViewer } from '@/lib/knowledge/categories'

export const dynamic = 'force-dynamic'

export default async function ResourcesPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')

  const isBoard = !!session.user.isBoard

  const notesCount = await prisma.article.count({
    where: { kind: 'meeting-notes', category: { in: categoriesForViewer(isBoard) } },
  })

  const LIBRARY = [
    { href: '/members/resources/presentations', title: 'Presentations' },
    { href: '/members/resources/technique-nuggets', title: 'Technique Nuggets' },
    { href: '/members/resources/workshop-guides', title: 'Workshop Guides' },
    { href: '/members/resources/recipes', title: 'Recipes' },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl md:text-3xl font-bold">Resources</h1>
      <p className="text-foreground/55 mt-1">How to do things in the club, our knowledge library, and how the club is run.</p>

      {/* How-to & Getting Started */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">How-to & Getting Started</h2>
        <div className="grid sm:grid-cols-2 gap-2 mt-3">
          {HOWTO_PAGES.map((p) => (
            <Link key={p.href} href={p.href} className="block rounded-xl border border-border/60 bg-card-bg/30 hover:border-accent/40 px-4 py-3">
              <div className="font-semibold">{p.title}</div>
              <div className="text-sm text-foreground/55">{p.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Notes */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">Notes</h2>
        <p className="text-xs text-foreground/45 mt-1">Brewing takeaways from club meetings and events — read what you missed.</p>
        <div className="mt-3">
          <Link href="/members/resources/notes" className="block rounded-xl border border-border/60 bg-card-bg/30 hover:border-accent/40 px-4 py-3">
            <div className="font-semibold">Meeting &amp; event notes{notesCount ? ` (${notesCount})` : ''} →</div>
            <div className="text-sm text-foreground/55">Structured recaps of what each meeting covered.</div>
          </Link>
        </div>
      </section>

      {/* Library — per-type artifact browse pages */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">Library</h2>
        <p className="text-xs text-foreground/45 mt-1">Presentations, technique nuggets, workshop guides, and recipes.</p>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          {LIBRARY.map((l) => (
            <Link key={l.href} href={l.href} className="block rounded-xl border border-border/60 bg-card-bg/30 hover:border-accent/40 px-4 py-3">
              <div className="font-semibold">{l.title} →</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Governance — the club's founding & governing documents */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">Governance</h2>
        <p className="text-xs text-foreground/45 mt-1">How the club is constituted and run.</p>
        <div className="mt-3">
          <Link href="/members/governance" className="block rounded-xl border border-border/60 bg-card-bg/30 hover:border-accent/40 px-4 py-3">
            <div className="font-semibold">Governance documents →</div>
            <div className="text-sm text-foreground/55">Board, Code of Conduct, Bylaws (draft v2.0), and Articles of Incorporation.</div>
          </Link>
        </div>
      </section>
    </div>
  )
}
