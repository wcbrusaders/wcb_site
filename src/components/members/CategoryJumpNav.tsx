'use client'

import { categorySlug } from '@/lib/lending'

// Sticky chip row that jump-scrolls to each equipment category section.
// Anchors target the section ids produced by `categorySlug` (shared with the page,
// which lives in the framework-free lib so a server component can also call it).
export function CategoryJumpNav({ categories }: { categories: string[] }) {
  if (categories.length <= 1) return null
  return (
    <nav className="sticky top-14 z-30 -mx-6 px-6 py-3 mb-6 bg-background/85 backdrop-blur border-b border-border/40 overflow-x-auto">
      <div className="flex gap-2 w-max">
        {categories.map((c) => (
          <a
            key={c}
            href={`#${categorySlug(c)}`}
            className="whitespace-nowrap text-xs text-foreground/70 hover:text-foreground border border-border/50 hover:border-accent/50 rounded-full px-3 py-1 transition-colors"
          >
            {c}
          </a>
        ))}
      </div>
    </nav>
  )
}
