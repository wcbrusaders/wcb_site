// src/app/members/resources/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { HOWTO_PAGES, KNOWLEDGE_DRIVE_LINKS } from '@/lib/resources-links'

export const dynamic = 'force-dynamic'

export default async function ResourcesPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')

  const meetingNotes = await prisma.article.findMany({
    where: { category: 'meeting-notes' },
    orderBy: { publishedAt: 'desc' },
    select: { slug: true, title: true, meetingDate: true, excerpt: true },
  })

  // Keep the other Drive-link categories (recipes, workshops, docs,
  // meeting-agendas) as-is for now — only meeting-notes has moved on-site.
  const otherDriveLinks = KNOWLEDGE_DRIVE_LINKS.filter((l) => l.title !== 'Meeting Agendas & Notes')

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl md:text-3xl font-bold">Resources</h1>
      <p className="text-foreground/55 mt-1">How to do things in the club, plus our knowledge library.</p>
      <div className="grid md:grid-cols-2 gap-6 mt-6">
        {/* Lane 1 — how-to */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">How-to & Getting Started</h2>
          <ul className="mt-3 space-y-2">
            {HOWTO_PAGES.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="block rounded-xl border border-border/60 bg-card-bg/30 hover:border-accent/40 px-4 py-3">
                  <div className="font-semibold">{p.title}</div>
                  <div className="text-sm text-foreground/55">{p.desc}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        {/* Lane 2 — knowledge (published meeting notes on-site + remaining Drive links) */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">Knowledge & Experiments</h2>
          <p className="text-xs text-foreground/45 mt-1">Meeting notes, published on-site. Everything else is still on Drive for now:</p>
          <ul className="mt-3 space-y-2">
            {meetingNotes.length === 0 && (
              <li className="text-sm text-foreground/45 px-1">No published meeting notes yet.</li>
            )}
            {meetingNotes.map((a) => (
              <li key={a.slug}>
                <Link href={`/members/resources/knowledge/${a.slug}`} className="block rounded-xl border border-border/60 bg-card-bg/30 hover:border-accent/40 px-4 py-3">
                  <div className="font-semibold">{a.title}</div>
                  {a.meetingDate && (
                    <div className="text-xs text-foreground/40">{a.meetingDate.toISOString().slice(0, 10)}</div>
                  )}
                  {a.excerpt && <div className="text-sm text-foreground/55">{a.excerpt}</div>}
                </Link>
              </li>
            ))}
            {otherDriveLinks.map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noreferrer" className="block rounded-xl border border-border/60 bg-card-bg/30 hover:border-accent/40 px-4 py-3">
                  <div className="font-semibold">{l.title} <span className="text-foreground/40 font-normal text-xs">↗ Drive</span></div>
                  <div className="text-sm text-foreground/55">{l.desc}</div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>

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
