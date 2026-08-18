import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { KnowledgeQueue } from '@/components/members/KnowledgeQueue'
import { ArtifactQueue } from '@/components/members/ArtifactQueue'

// Board-only review queue. Always reflect live drafts (no static caching).
export const dynamic = 'force-dynamic'

export default async function KnowledgeQueuePage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  if (!session.user.isBoard) redirect('/members')

  const drafts = await prisma.draftArticle.findMany({
    where: { status: { in: ['in_review', 'error'] } },
    orderBy: { createdAt: 'desc' },
  })

  // Prisma Dates cross the RSC boundary to the client component as strings
  // regardless — normalize explicitly to ISO strings here (see
  // wcb-rsc-date-boundary-trap) rather than passing Date objects through.
  const inReview = drafts
    .filter((d) => d.status === 'in_review')
    .map((d) => ({
      id: d.id,
      processedTitle: d.processedTitle,
      processedHtml: d.processedHtml,
      excerpt: d.excerpt,
      meetingDate: d.meetingDate ? d.meetingDate.toISOString() : null,
    }))

  const errored = drafts
    .filter((d) => d.status === 'error')
    .map((d) => ({ id: d.id, sourceName: d.sourceName, errorText: d.errorText }))

  const artifactDrafts = await prisma.artifactDraft.findMany({
    where: { status: { in: ['needs_review', 'error'] } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      sourceName: true,
      blobUrl: true,
      mimeType: true,
      thumbnailUrl: true,
      suggestedCategory: true,
      status: true,
      errorText: true,
    },
  })

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl font-bold">Knowledge — Review Queue</h1>
      <p className="text-foreground/50 text-sm mt-1">
        Board-only. Review AI-extracted meeting notes before they publish to the club. Nothing publishes automatically.
      </p>
      <KnowledgeQueue inReview={inReview} errored={errored} />

      <h2 className="text-lg font-semibold mt-10">Artifacts awaiting review ({artifactDrafts.length})</h2>
      <ArtifactQueue artifacts={artifactDrafts} />
    </div>
  )
}
