// A dashed placeholder for an empty category/section, so "nothing here yet"
// reads as intentional rather than a broken/blank page (System B).
export function EmptyState({ icon = '📭', children }: { icon?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 px-6 py-8 text-center">
      <div aria-hidden className="text-2xl opacity-50">
        {icon}
      </div>
      <p className="text-sm text-foreground/50 mt-2">{children}</p>
    </div>
  )
}
