import { prisma } from './db'

export type ItemCategory = 'book' | 'equipment'
export type Condition = 'New' | 'Good' | 'Fair' | 'Poor' | 'Damaged'

export function coverUrl(isbn: string | null | undefined): string | null {
  const v = (isbn ?? '').trim()
  return v ? `https://covers.openlibrary.org/b/isbn/${v}-L.jpg` : null
}

export type TitleView = {
  id: string; category: string; title: string; description: string | null
  author: string | null; isbn: string | null; notes: string | null
  availableCount: number; totalCount: number
  myLoan: { loanId: string; copyId: string; dueAt: Date; renewedCount: number } | null
}

export async function listTitles(
  category: ItemCategory,
  viewerMemberId: string,
  opts: { availableOnly?: boolean } = {},
  deps: { db?: typeof prisma } = {},
): Promise<TitleView[]> {
  const db = deps.db ?? prisma
  const rows = await db.loanableItem.findMany({
    where: { category },
    include: { copies: { where: { status: { not: 'archived' } }, include: { loans: { where: { returnedAt: null } } } } },
    orderBy: { title: 'asc' },
  })
  const views: TitleView[] = []
  for (const r of rows as any[]) {
    const copies = r.copies ?? []
    if (copies.length === 0) continue // all copies archived -> hide title
    const available = copies.filter((c: any) => c.status === 'available').length
    if (opts.availableOnly && available === 0) continue
    let myLoan: TitleView['myLoan'] = null
    for (const c of copies) {
      const l = (c.loans ?? []).find((x: any) => x.memberId === viewerMemberId)
      if (l) { myLoan = { loanId: l.id, copyId: c.id, dueAt: l.dueAt, renewedCount: l.renewedCount }; break }
    }
    views.push({
      id: r.id, category: r.category, title: r.title, description: r.description,
      author: r.author, isbn: r.isbn, notes: r.notes,
      availableCount: available, totalCount: copies.length, myLoan,
    })
  }
  return views
}
