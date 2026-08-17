// src/app/members/governance/page.tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
export const dynamic = 'force-dynamic'
export default async function GovernancePage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  const isBoard = !!session.user.isBoard
  const Card = ({ href, title, desc, tag, external }: { href: string; title: string; desc: string; tag: string; external?: boolean }) => {
    const inner = (
      <div className="rounded-xl border border-border/60 bg-card-bg/30 hover:border-accent/40 px-4 py-3">
        <div className="font-semibold">{title} <span className="text-foreground/40 font-normal text-xs">· {tag}{external ? ' ↗' : ''}</span></div>
        <div className="text-sm text-foreground/55">{desc}</div>
      </div>
    )
    return external
      ? <a href={href} target="_blank" rel="noreferrer">{inner}</a>
      : <Link href={href}>{inner}</Link>
  }
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl md:text-3xl font-bold">Governance</h1>
      <p className="text-foreground/55 mt-1">How the club is constituted and run.</p>
      <div className="mt-6 space-y-2">
        <Card href="/board" title="The Board" desc="Who runs the club and how to reach the Ombudsman." tag="public" external />
        <Card href="/code-of-conduct" title="Code of Conduct" desc="Ratified Aug 15, 2026 — the rules we all agree to." tag="ratified" external />
        <Card href="/members/governance/bylaws" title="Bylaws" desc="The club's governing document (draft v2.0, pending ratification)." tag="members" />
        {isBoard && <Card href="/members/governance/articles" title="Articles of Incorporation" desc="Legal founding document." tag="officers" />}
      </div>
    </div>
  )
}
