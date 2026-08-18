// src/app/members/governance/page.tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { PageHeader, Card, CardTitle, CardBody } from '@/components/ui'

export const dynamic = 'force-dynamic'

const DOCS = [
  { href: '/board', title: 'The Board', desc: 'Who runs the club and how to reach the Ombudsman.', tag: 'Public', external: true },
  { href: '/code-of-conduct', title: 'Code of Conduct', desc: 'Ratified Aug 15, 2026 — the rules we all agree to.', tag: 'Ratified', external: true },
  { href: '/members/governance/bylaws', title: 'Bylaws', desc: "The club's governing document (draft v2.0, pending ratification).", tag: 'Members' },
  { href: '/members/governance/articles', title: 'Articles of Incorporation', desc: 'Legal founding document (public record).', tag: 'Members' },
]

export default async function GovernancePage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <PageHeader
        eyebrow="⚖️ Governance"
        title="Governance"
        lead="How the club is constituted and run."
      />
      <div className="grid gap-3">
        {DOCS.map((d) => (
          <Card key={d.href} href={d.href} external={d.external}>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>
                {d.title}
                {d.external ? ' ↗' : ''}
              </CardTitle>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground/40 whitespace-nowrap">
                {d.tag}
              </span>
            </div>
            <CardBody>{d.desc}</CardBody>
          </Card>
        ))}
      </div>
    </div>
  )
}
