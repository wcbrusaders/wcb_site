import { prisma } from './db'

export type ItemCategory = 'book' | 'equipment'
export type Condition = 'New' | 'Good' | 'Fair' | 'Poor' | 'Damaged'

export const EQUIPMENT_SUBCATEGORIES = [
  'Kegging & Serving', 'Fermentation', 'Measurement', 'Transfer & Hoses',
  'Kettle & Hot-side', 'Bottling', 'Cleaning', 'Other',
] as const

export function coverUrl(isbn: string | null | undefined): string | null {
  const v = (isbn ?? '').trim()
  return v ? `https://covers.openlibrary.org/b/isbn/${v}-L.jpg` : null
}

export type TitleView = {
  id: string; category: string; title: string; description: string | null
  author: string | null; isbn: string | null; notes: string | null; subcategory: string | null; photoUrl: string | null
  availableCount: number; totalCount: number
  myLoan: { loanId: string; copyId: string; dueAt: Date; renewedCount: number } | null
  archivableCopyId: string | null
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
    const archivableCopy = copies.find((c: any) => c.status === 'available')
    views.push({
      id: r.id, category: r.category, title: r.title, description: r.description,
      author: r.author, isbn: r.isbn, notes: r.notes, subcategory: r.subcategory ?? null, photoUrl: r.photoUrl ?? null,
      availableCount: available, totalCount: copies.length, myLoan,
      archivableCopyId: archivableCopy ? archivableCopy.id : null,
    })
  }
  return views
}

export const DUE_DAYS: Record<ItemCategory, number> = { book: 30, equipment: 14 }

export type CheckoutResult =
  | { ok: true; loanId: string; copyId: string; dueAt: Date }
  | { ok: false; reason: 'unavailable' | 'not_found' }

export async function checkoutTitle(
  itemId: string,
  memberId: string,
  cond: { conditionOut?: Condition; noteOut?: string } = {},
  deps: { db?: typeof prisma; now?: Date } = {},
): Promise<CheckoutResult> {
  const db = deps.db ?? prisma
  const now = deps.now ?? new Date()
  const item = await db.loanableItem.findUnique({ where: { id: itemId } })
  if (!item) return { ok: false, reason: 'not_found' }
  const days = DUE_DAYS[item.category as ItemCategory] ?? 14
  const dueAt = new Date(now.getTime() + days * 86_400_000)
  const isEquip = item.category === 'equipment'

  const candidates = await db.copy.findMany({ where: { itemId, status: 'available' } })
  for (const c of candidates as any[]) {
    const result = await db.$transaction(async (tx: any) => {
      const claim = await tx.copy.updateMany({ where: { id: c.id, status: 'available' }, data: { status: 'out' } })
      if (claim.count !== 1) return null // lost this copy; try the next candidate
      const loan = await tx.loan.create({
        data: { copyId: c.id, memberId, dueAt, ...(isEquip && cond.conditionOut ? { conditionOut: cond.conditionOut, noteOut: cond.noteOut ?? null } : {}) },
      })
      return { loanId: loan.id, copyId: c.id }
    })
    if (result) return { ok: true, loanId: result.loanId, copyId: result.copyId, dueAt }
  }
  return { ok: false, reason: 'unavailable' }
}

export const RENEW_CAP = 2

// Holds seam: today any holder may renew. A future hold queue overrides this
// to return false when someone is waiting on the copy.
export function canRenew(_copy: { id: string }): boolean { return true }

export function canSetPhoto(opts: { isBoard: boolean; hasPhoto: boolean }): boolean {
  return opts.isBoard || !opts.hasPhoto
}

export function isBlobUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname.endsWith('.public.blob.vercel-storage.com')
  } catch {
    return false
  }
}

export type ReturnResult = { ok: true } | { ok: false; reason: 'not_found' | 'forbidden' | 'already_returned' }

export async function returnLoan(
  loanId: string, actingMemberId: string, isBoard: boolean,
  cond: { conditionIn?: Condition; noteIn?: string } = {},
  deps: { db?: typeof prisma; now?: Date } = {},
): Promise<ReturnResult> {
  const db = deps.db ?? prisma
  const now = deps.now ?? new Date()
  const loan = await db.loan.findUnique({ where: { id: loanId }, include: { copy: { include: { item: true } } } })
  if (!loan) return { ok: false, reason: 'not_found' }
  if (loan.returnedAt) return { ok: false, reason: 'already_returned' }
  if (!isBoard && loan.memberId !== actingMemberId) return { ok: false, reason: 'forbidden' }
  const isEquip = loan.copy?.item?.category === 'equipment'
  await db.$transaction(async (tx: any) => {
    await tx.loan.update({ where: { id: loanId }, data: { returnedAt: now, ...(isEquip && cond.conditionIn ? { conditionIn: cond.conditionIn, noteIn: cond.noteIn ?? null } : {}) } })
    await tx.copy.update({ where: { id: loan.copyId }, data: { status: 'available', ...(isEquip && cond.conditionIn ? { currentCondition: cond.conditionIn } : {}) } })
  })
  return { ok: true }
}

export type RenewResult =
  | { ok: true; dueAt: Date }
  | { ok: false; reason: 'not_found' | 'forbidden' | 'already_returned' | 'cap_reached' | 'blocked' }

export async function renewLoan(loanId: string, actingMemberId: string, deps: { db?: typeof prisma } = {}): Promise<RenewResult> {
  const db = deps.db ?? prisma
  const loan = await db.loan.findUnique({ where: { id: loanId }, include: { copy: { include: { item: true } } } })
  if (!loan) return { ok: false, reason: 'not_found' }
  if (loan.returnedAt) return { ok: false, reason: 'already_returned' }
  if (loan.memberId !== actingMemberId) return { ok: false, reason: 'forbidden' }
  if (loan.renewedCount >= RENEW_CAP) return { ok: false, reason: 'cap_reached' }
  if (!canRenew({ id: loan.copyId })) return { ok: false, reason: 'blocked' }
  const days = DUE_DAYS[(loan.copy?.item?.category as ItemCategory)] ?? 14
  const dueAt = new Date(loan.dueAt.getTime() + days * 86_400_000)
  await db.loan.update({ where: { id: loanId }, data: { dueAt, renewedCount: loan.renewedCount + 1 } })
  return { ok: true, dueAt }
}

export type HoldingLoan = {
  loanId: string
  itemTitle: string
  category: ItemCategory
  copyLabel: string | null
  checkedOutAt: Date
  dueAt: Date
  overdue: boolean
}
export type MemberHoldings = {
  memberId: string
  name: string | null
  email: string | null
  loans: HoldingLoan[]
  overdueCount: number
}
export type HistoryLoan = {
  loanId: string
  itemTitle: string
  category: ItemCategory
  copyLabel: string | null
  checkedOutAt: Date
  returnedAt: Date
  conditionIn: string | null
}

export async function listActiveHoldings(
  deps: { db?: typeof prisma; now?: Date } = {},
): Promise<MemberHoldings[]> {
  const db = deps.db ?? prisma
  const now = deps.now ?? new Date()
  const loans = await db.loan.findMany({
    where: { returnedAt: null },
    include: { copy: { include: { item: true } } },
    orderBy: { dueAt: 'asc' },
  })
  // Batch-load member details (memberId has no relation)
  const ids = [...new Set((loans as any[]).map((l) => l.memberId))]
  const members = ids.length
    ? await db.member.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, emailAddress: true } })
    : []
  const mMap = new Map((members as any[]).map((m) => [m.id, m]))
  const byMember = new Map<string, MemberHoldings>()
  for (const l of loans as any[]) {
    const overdue = l.dueAt.getTime() < now.getTime()
    const hl: HoldingLoan = {
      loanId: l.id,
      itemTitle: l.copy?.item?.title ?? '(unknown item)',
      category: (l.copy?.item?.category ?? 'equipment') as ItemCategory,
      copyLabel: l.copy?.label ?? null,
      checkedOutAt: l.checkedOutAt,
      dueAt: l.dueAt,
      overdue,
    }
    let mh = byMember.get(l.memberId)
    if (!mh) {
      const m = mMap.get(l.memberId)
      mh = { memberId: l.memberId, name: m?.name ?? null, email: m?.emailAddress ?? null, loans: [], overdueCount: 0 }
      byMember.set(l.memberId, mh)
    }
    mh.loans.push(hl) // loans arrive dueAt-asc from the query, preserved per member
    if (overdue) mh.overdueCount++
  }
  return [...byMember.values()].sort((a, b) => {
    // overdue members first, then by name (nulls last), then memberId for stability
    const ao = a.overdueCount > 0 ? 0 : 1
    const bo = b.overdueCount > 0 ? 0 : 1
    if (ao !== bo) return ao - bo
    const an = a.name ?? '￿'
    const bn = b.name ?? '￿'
    if (an !== bn) return an.localeCompare(bn)
    return a.memberId.localeCompare(b.memberId)
  })
}

export async function listMemberHistory(
  memberId: string,
  deps: { db?: typeof prisma } = {},
): Promise<HistoryLoan[]> {
  const db = deps.db ?? prisma
  const loans = await db.loan.findMany({
    where: { memberId, returnedAt: { not: null } },
    include: { copy: { include: { item: true } } },
    orderBy: { returnedAt: 'desc' },
  })
  const mapped = (loans as any[]).map((l) => ({
    loanId: l.id,
    itemTitle: l.copy?.item?.title ?? '(unknown item)',
    category: (l.copy?.item?.category ?? 'equipment') as ItemCategory,
    copyLabel: l.copy?.label ?? null,
    checkedOutAt: l.checkedOutAt,
    returnedAt: l.returnedAt as Date,
    conditionIn: l.conditionIn ?? null,
  }))
  mapped.sort((a, b) => b.returnedAt.getTime() - a.returnedAt.getTime())
  return mapped
}

export type NewTitleInput = {
  category: ItemCategory; title: string; description?: string
  author?: string; isbn?: string; notes?: string; subcategory?: string
  copies?: number; initialCondition?: Condition
}

export async function addTitle(input: NewTitleInput, addedById: string, deps: { db?: typeof prisma } = {}): Promise<{ id: string }> {
  const db = deps.db ?? prisma
  const title = await db.loanableItem.create({
    data: {
      category: input.category, title: input.title, description: input.description ?? null,
      author: input.author ?? null, isbn: input.isbn ?? null, notes: input.notes ?? null, subcategory: input.subcategory ?? null, addedById,
    },
  })
  const n = Math.max(1, input.copies ?? 1)
  const seed = input.category === 'equipment' ? (input.initialCondition ?? null) : null
  for (let i = 0; i < n; i++) {
    await db.copy.create({ data: { itemId: title.id, status: 'available', currentCondition: seed } })
  }
  return { id: title.id }
}

export async function addCopies(itemId: string, count: number, initialCondition: Condition | undefined, deps: { db?: typeof prisma } = {}): Promise<{ added: number }> {
  const db = deps.db ?? prisma
  const n = Math.max(1, count)
  for (let i = 0; i < n; i++) {
    await db.copy.create({ data: { itemId, status: 'available', currentCondition: initialCondition ?? null } })
  }
  return { added: n }
}

export async function editTitle(id: string, patch: Partial<Omit<NewTitleInput, 'category' | 'copies' | 'initialCondition'>>, deps: { db?: typeof prisma } = {}): Promise<void> {
  const db = deps.db ?? prisma
  await db.loanableItem.update({ where: { id }, data: { ...patch } })
}

export type ArchiveResult = { ok: true } | { ok: false; reason: 'not_found' | 'out' }

export async function archiveCopy(copyId: string, deps: { db?: typeof prisma } = {}): Promise<ArchiveResult> {
  const db = deps.db ?? prisma
  const copy = await db.copy.findUnique({ where: { id: copyId } })
  if (!copy) return { ok: false, reason: 'not_found' }
  if (copy.status === 'out') return { ok: false, reason: 'out' }
  await db.copy.update({ where: { id: copyId }, data: { status: 'archived' } })
  return { ok: true }
}

export function groupBySubcategory(
  titles: TitleView[],
): { subcategory: string; items: TitleView[] }[] {
  const known = new Set<string>(EQUIPMENT_SUBCATEGORIES)
  const buckets = new Map<string, TitleView[]>()
  for (const t of titles) {
    const key = t.subcategory && known.has(t.subcategory) ? t.subcategory : 'Other'
    const arr = buckets.get(key) ?? []
    arr.push(t)
    buckets.set(key, arr)
  }
  return EQUIPMENT_SUBCATEGORIES
    .map((cat) => ({ subcategory: cat, items: buckets.get(cat) ?? [] }))
    .filter((g) => g.items.length > 0)
}

// Stable DOM id for an equipment category section (shared by the equipment
// page's <section id> and the client jump-nav's anchor hrefs). Pure.
export function categorySlug(subcategory: string): string {
  return 'cat-' + subcategory.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
