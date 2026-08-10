import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listTitles } from '@/lib/lending'
import { TitleCard } from '@/components/members/TitleCard'
import { AddTitleForm } from '@/components/members/AddTitleForm'

export default async function LibraryPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  const isBoard = !!session.user.isBoard
  const items = await listTitles('book', session.user.memberId)
  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-4xl mx-auto px-6 py-24">
        <p className="text-accent font-medium tracking-wide uppercase text-sm mb-4">Members Hub</p>
        <h1 className="text-3xl md:text-4xl font-bold mb-8">Book Library</h1>
        {isBoard && <AddTitleForm category="book" />}
        {items.length === 0 ? <p className="text-foreground/50">No books yet.</p> : (
          <div className="grid gap-4 md:grid-cols-2">{items.map(i => <TitleCard key={i.id} item={i} isBoard={isBoard} />)}</div>
        )}
      </main>
    </div>
  )
}
