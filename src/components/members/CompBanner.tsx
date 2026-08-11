import type { BannerItem } from '@/lib/competitions'

export function CompBanner({ items }: { items: BannerItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="rounded-2xl border border-accent/40 bg-accent/10 p-4 mb-8">
      <p className="text-sm font-medium text-accent mb-1">Competition deadlines</p>
      <ul className="text-sm text-foreground/80 space-y-0.5">
        {items.map((b, i) => (
          <li key={`${b.competitionId}-${b.kind}-${i}`}>
            <span className="font-medium">{b.competitionName}</span>: {b.detail} — {b.daysAway === 0 ? 'today' : `${b.daysAway} day${b.daysAway === 1 ? '' : 's'}`} ({b.date.toISOString().slice(0, 10)})
          </li>
        ))}
      </ul>
    </div>
  )
}
