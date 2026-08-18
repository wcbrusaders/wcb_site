'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CATEGORY_LABELS, type NoteCategory } from '@/lib/knowledge/categories'

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

  return (
    <div>
      {categories.length > 1 && (
        <div className="flex gap-2 flex-wrap mt-6">
          <button
            type="button"
            onClick={() => setActive('all')}
            className={`text-xs rounded-full px-3 py-1 border transition-colors ${
              active === 'all'
                ? 'border-accent/60 bg-accent/10 text-accent'
                : 'border-border/50 text-foreground/70 hover:border-accent/40'
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setActive(c)}
              className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                active === c
                  ? 'border-accent/60 bg-accent/10 text-accent'
                  : 'border-border/50 text-foreground/70 hover:border-accent/40'
              }`}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-foreground/50 mt-6">No notes in this category.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {visible.map((n) => (
            <li key={n.slug}>
              <Link
                href={`/members/resources/notes/${n.slug}`}
                className="block rounded-xl border border-border/60 bg-card-bg/30 hover:border-accent/40 px-4 py-3"
              >
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <span className="font-semibold">{n.title}</span>
                  {n.meetingDate && <span className="text-xs text-foreground/40">{n.meetingDate}</span>}
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  {n.category && (
                    <span className="text-[11px] uppercase tracking-wide text-foreground/45">
                      {CATEGORY_LABELS[n.category]}
                    </span>
                  )}
                  {n.officersOnly && (
                    <span className="text-[11px] font-medium text-amber-600 border border-amber-600/40 rounded-full px-2 py-0.5">
                      Officers only
                    </span>
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
