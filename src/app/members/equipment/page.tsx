import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listTitles, groupBySubcategory, categorySlug } from '@/lib/lending'
import { TitleCard } from '@/components/members/TitleCard'
import { AddTitleForm } from '@/components/members/AddTitleForm'
import { CategoryJumpNav } from '@/components/members/CategoryJumpNav'
import { PageHeader, SectionLabel, EmptyState } from '@/components/ui'

export default async function EquipmentPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  const isBoard = !!session.user.isBoard
  const items = await listTitles('equipment', session.user.memberId)
  const groups = groupBySubcategory(items)
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <PageHeader eyebrow="🔧 Members" title="Equipment" lead="Club gear you can borrow — check out a piece, or add something you're donating." />
      <AddTitleForm category="equipment" />{/* open contribution: any member can add */}
      {items.length === 0 ? (
        <EmptyState icon="🔧">No equipment yet.</EmptyState>
      ) : (
        <>
          <CategoryJumpNav categories={groups.map((g) => g.subcategory)} />
          <div className="space-y-8">
            {groups.map((g) => (
              <section key={g.subcategory} id={categorySlug(g.subcategory)} className="scroll-mt-32">
                <SectionLabel>{g.subcategory}</SectionLabel>
                <div className="grid gap-4 md:grid-cols-2">
                  {g.items.map((i) => <TitleCard key={i.id} item={i} isBoard={isBoard} />)}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
