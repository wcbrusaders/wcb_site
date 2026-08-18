import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listTitles } from '@/lib/lending'
import { TitleCard } from '@/components/members/TitleCard'
import { AddTitleForm } from '@/components/members/AddTitleForm'
import { PageHeader, EmptyState } from '@/components/ui'

export default async function LibraryPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  const isBoard = !!session.user.isBoard
  const items = await listTitles('book', session.user.memberId)
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <PageHeader eyebrow="📚 Members" title="Book Library" lead="Brewing books club members can borrow — check one out, or add a book you're lending." />
      <AddTitleForm category="book" />{/* open contribution: any member can add */}
      {items.length === 0 ? (
        <EmptyState icon="📚">No books yet.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{items.map(i => <TitleCard key={i.id} item={i} isBoard={isBoard} />)}</div>
      )}
    </div>
  )
}
