import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { audienceForCategory } from '@/lib/knowledge/categories'
import { EditNoteTitle } from '@/components/members/EditNoteTitle'

export const dynamic = 'force-dynamic'

export default async function MeetingNotePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')

  const { slug } = await params
  // Article rows only exist via the board publish action — no unpublished state,
  // so "not found" is the only "not published" case to guard.
  const article = await prisma.article.findUnique({ where: { slug } })
  if (!article) notFound()

  // Server-side audience gate: a member with a direct link to an
  // officers-only note (or a note with an unknown/missing category, which
  // fails safe to 'officers') must never see the content — 404, not a redirect,
  // so the note's existence isn't confirmed either.
  if (audienceForCategory(article.category ?? '') === 'officers' && !session.user.isBoard) notFound()

  // The stored body leads with an <h1> title; the page renders its own title
  // header, so strip a leading <h1> to avoid showing it twice.
  const body = article.bodyHtml.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/i, '')

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <Link href="/members/resources/notes" className="text-sm text-accent hover:underline">
        ← Meeting notes
      </Link>

      <h1 className="text-2xl md:text-3xl font-bold mt-3">{article.title}</h1>
      {article.meetingDate && (
        <p className="text-foreground/50 text-sm mt-1">{article.meetingDate.toISOString().slice(0, 10)}</p>
      )}
      {session.user.isBoard && <EditNoteTitle articleId={article.id} currentTitle={article.title} />}

      {/* bodyHtml is sanitized in src/lib/knowledge/extract-notes.ts before storage. */}
      <div
        className="mt-6 text-foreground/75 text-[15px] leading-relaxed space-y-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_li]:my-0.5 [&_a]:text-accent [&_a]:hover:underline [&_strong]:font-semibold [&_em]:italic"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </div>
  )
}
