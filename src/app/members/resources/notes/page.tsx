import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const iso = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null)

export default async function MeetingNotesPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')

  const notes = await prisma.article.findMany({
    where: { category: 'meeting-notes' },
    orderBy: [{ meetingDate: 'desc' }, { publishedAt: 'desc' }],
    select: { slug: true, title: true, excerpt: true, meetingDate: true, publishedAt: true },
  })

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <Link href="/members/resources" className="text-sm text-foreground/50 hover:text-accent">← Resources</Link>
      <h1 className="text-2xl md:text-3xl font-bold mt-3">Meeting notes</h1>
      <p className="text-foreground/55 mt-1">
        What we covered at club meetings and events — the brewing takeaways, so you get them even if you missed it.
      </p>

      {notes.length === 0 ? (
        <p className="text-foreground/50 mt-6">No notes published yet.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {notes.map((n) => (
            <li key={n.slug}>
              <Link
                href={`/members/resources/notes/${n.slug}`}
                className="block rounded-xl border border-border/60 bg-card-bg/30 hover:border-accent/40 px-4 py-3"
              >
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <span className="font-semibold">{n.title}</span>
                  {iso(n.meetingDate) && (
                    <span className="text-xs text-foreground/40">{iso(n.meetingDate)}</span>
                  )}
                </div>
                {n.excerpt && <p className="text-sm text-foreground/55 mt-1">{n.excerpt}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
