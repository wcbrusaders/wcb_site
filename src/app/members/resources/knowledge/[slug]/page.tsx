import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function KnowledgeArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')

  const { slug } = await params
  // Article rows only ever come into existence via the board publish action
  // (src/app/members/admin/knowledge/_actions.ts) — there is no draft/unpublished
  // Article state, so "not found" is the only "not published" case to guard.
  const article = await prisma.article.findUnique({ where: { slug } })
  if (!article) notFound()

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <Link href="/members/resources" className="text-sm text-accent hover:underline">
        ← Back to Resources
      </Link>

      <h1 className="text-2xl md:text-3xl font-bold mt-3">{article.title}</h1>
      {article.meetingDate && (
        <p className="text-foreground/50 text-sm mt-1">{article.meetingDate.toISOString().slice(0, 10)}</p>
      )}

      {/* bodyHtml is sanitized in src/lib/knowledge/extract-notes.ts before storage. */}
      <div
        className="mt-6 text-foreground/75 text-[15px] leading-relaxed space-y-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-2 [&_a]:text-accent [&_a]:hover:underline"
        dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
      />
    </div>
  )
}
