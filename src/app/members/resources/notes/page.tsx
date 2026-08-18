import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { categoriesForViewer, audienceForCategory, isValidCategory } from '@/lib/knowledge/categories'
import { NotesCategoryFilter, type NotesListItem } from '@/components/members/NotesCategoryFilter'

export const dynamic = 'force-dynamic'

const iso = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null)

export default async function MeetingNotesPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')

  const isBoard = !!session.user.isBoard
  const allowedCategories = categoriesForViewer(isBoard)

  const notes = await prisma.article.findMany({
    where: { kind: 'meeting-notes', category: { in: allowedCategories } },
    orderBy: [{ meetingDate: 'desc' }, { publishedAt: 'desc' }],
    select: { slug: true, title: true, excerpt: true, meetingDate: true, publishedAt: true, category: true },
  })

  const items: NotesListItem[] = notes.map((n) => ({
    slug: n.slug,
    title: n.title,
    excerpt: n.excerpt,
    meetingDate: iso(n.meetingDate),
    category: isValidCategory(n.category) ? n.category : null,
    officersOnly: audienceForCategory(n.category ?? '') === 'officers',
  }))

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <Link href="/members/resources" className="text-sm text-foreground/50 hover:text-accent">← Resources</Link>
      <h1 className="text-2xl md:text-3xl font-bold mt-3">Meeting notes</h1>
      <p className="text-foreground/55 mt-1">
        What we covered at club meetings and events — the brewing takeaways, so you get them even if you missed it.
      </p>

      {items.length === 0 ? (
        <p className="text-foreground/50 mt-6">No notes published yet.</p>
      ) : (
        <NotesCategoryFilter notes={items} categories={allowedCategories} />
      )}
    </div>
  )
}
