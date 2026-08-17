// src/app/members/resources/page.tsx
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { HOWTO_PAGES, KNOWLEDGE_DRIVE_LINKS } from '@/lib/resources-links'

export const dynamic = 'force-dynamic'

export default async function ResourcesPage() {
  const session = await auth()
  const isBoard = !!session?.user?.isBoard
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
        {/* Lane 2 — knowledge (Drive links for now) */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">Knowledge & Experiments</h2>
          <p className="text-xs text-foreground/45 mt-1">Searchable on-site articles are coming. For now, browse the club's Drive folders:</p>
          <ul className="mt-3 space-y-2">
            {KNOWLEDGE_DRIVE_LINKS.map((l) => (
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
        <div className="mt-3 grid sm:grid-cols-2 gap-2">
          <Link href="/members/governance" className="block rounded-xl border border-border/60 bg-card-bg/30 hover:border-accent/40 px-4 py-3">
            <div className="font-semibold">Governance documents</div>
            <div className="text-sm text-foreground/55">Board, Code of Conduct, Bylaws{isBoard ? ', Articles of Incorporation' : ''}.</div>
          </Link>
          <Link href="/members/governance/bylaws" className="block rounded-xl border border-border/60 bg-card-bg/30 hover:border-accent/40 px-4 py-3">
            <div className="font-semibold">Bylaws <span className="text-foreground/40 font-normal text-xs">· draft v2.0</span></div>
            <div className="text-sm text-foreground/55">The club's governing document.</div>
          </Link>
        </div>
      </section>
    </div>
  )
}
