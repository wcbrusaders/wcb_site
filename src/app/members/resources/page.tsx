// src/app/members/resources/page.tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { HOWTO_PAGES } from '@/lib/resources-links'
import { categoriesForViewer } from '@/lib/knowledge/categories'
import { artifactCategoryVisual, categoryVisual } from '@/lib/ui/category-visuals'
import type { ArtifactCategory } from '@/lib/artifacts/categories'
import {
  PageHeader,
  SectionLabel,
  Card,
  CardIcon,
  CardTitle,
  CardBody,
} from '@/components/ui'

export const dynamic = 'force-dynamic'

const LIBRARY: { href: string; category: ArtifactCategory; desc: string }[] = [
  { href: '/members/resources/presentations', category: 'presentation', desc: 'Meeting talks & slide decks.' },
  { href: '/members/resources/technique-nuggets', category: 'technique-nugget', desc: 'Short, focused how-tos.' },
  { href: '/members/resources/workshop-guides', category: 'workshop-guide', desc: 'Hands-on session guides.' },
  { href: '/members/resources/recipes', category: 'recipe', desc: 'Club & member recipes.' },
]

export default async function ResourcesPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')

  const isBoard = !!session.user.isBoard

  const notesCount = await prisma.article.count({
    where: { kind: 'meeting-notes', category: { in: categoriesForViewer(isBoard) } },
  })

  const notesVisual = categoryVisual('meeting')

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <PageHeader
        eyebrow="Members"
        title="Resources"
        lead="How to do things in the club, our knowledge library, and how the club is run."
      />

      {/* How-to & Getting Started — neutral utility cards */}
      <SectionLabel icon="🧭">How-to &amp; Getting Started</SectionLabel>
      <div className="grid sm:grid-cols-2 gap-3">
        {HOWTO_PAGES.map((p) => (
          <Card key={p.href} href={p.href}>
            <CardTitle>{p.title}</CardTitle>
            <CardBody>{p.desc}</CardBody>
          </Card>
        ))}
      </div>

      {/* Notes */}
      <SectionLabel icon="📝">Notes</SectionLabel>
      <Card href="/members/resources/notes" visual={notesVisual}>
        <CardIcon visual={notesVisual} />
        <CardTitle>Meeting &amp; event notes{notesCount ? ` (${notesCount})` : ''} →</CardTitle>
        <CardBody>Structured recaps of the brewing takeaways from each meeting.</CardBody>
      </Card>

      {/* Library — per-type artifact browse pages, category-accented */}
      <SectionLabel icon="📚">Library</SectionLabel>
      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
        {LIBRARY.map((l) => {
          const v = artifactCategoryVisual(l.category)
          return (
            <Card key={l.href} href={l.href} visual={v}>
              <CardIcon visual={v} />
              <CardTitle>{v.label} →</CardTitle>
              <CardBody>{l.desc}</CardBody>
            </Card>
          )
        })}
      </div>

      {/* Governance */}
      <SectionLabel icon="⚖️">Governance</SectionLabel>
      <Card href="/members/governance">
        <CardTitle>Governance documents →</CardTitle>
        <CardBody>Board, Code of Conduct, Bylaws (draft v2.0), and Articles of Incorporation.</CardBody>
      </Card>
    </div>
  )
}
