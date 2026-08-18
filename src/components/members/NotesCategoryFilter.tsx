'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CATEGORY_LABELS, type NoteCategory } from '@/lib/knowledge/categories'
import { categoryVisual } from '@/lib/ui/category-visuals'
import { Badge, OfficersBadge, EmptyState } from '@/components/ui'

export interface NotesListItem {
  slug: string
  title: string
  excerpt: string | null
  meetingDate: string | null // ISO yyyy-mm-dd, pre-formatted server-side
  category: NoteCategory | null
  officersOnly: boolean
}

// Client-side filter over a list the server already restricted to the
// viewer's allowed categories (categoriesForViewer). This component only
// narrows the rendered subset further — it never has access to notes the
// viewer isn't already permitted to see.
export function NotesCategoryFilter({
  notes,
  categories,
}: {
  notes: NotesListItem[]
  categories: NoteCategory[]
}) {
  const [active, setActive] = useState<NoteCategory | 'all'>('all')

  const visible = active === 'all' ? notes : notes.filter((n) => n.category === active)

  const pill = (isActive: boolean) =>
    `text-xs rounded-full px-3 py-1 border transition-colors ${
      isActive
        ? 'border-accent/60 bg-accent/10 text-accent'
        : 'border-border/50 text-foreground/70 hover:border-accent/40'
    }`

  return (
    <div>
      {categories.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-6">
          <button type="button" onClick={() => setActive('all')} className={pill(active === 'all')}>
            All
          </button>
          {categories.map((c) => (
            <button key={c} type="button" onClick={() => setActive(c)} className={pill(active === c)}>
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState icon="📝">No notes in this category.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {visible.map((n) => {
            const v = categoryVisual(n.category)
            return (
              <li key={n.slug}>
                <Link
                  href={`/members/resources/notes/${n.slug}`}
                  className="group block rounded-2xl border p-4 md:p-5 transition-all duration-150 bg-[linear-gradient(#1c1c1c,#161616)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
                  style={{ borderColor: '#2c2c2c', borderLeft: `3px solid ${v.color}` }}
                >
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <span className="font-semibold flex items-center gap-2">
                      <span aria-hidden>{v.icon}</span>
                      {n.title}
                    </span>
                    {n.meetingDate && <span className="text-xs text-foreground/40">{n.meetingDate}</span>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    {n.category && <Badge color={v.color}>{CATEGORY_LABELS[n.category]}</Badge>}
                    {n.officersOnly && <OfficersBadge />}
                  </div>
                  {n.excerpt && <p className="text-sm text-foreground/55 mt-2">{n.excerpt}</p>}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
