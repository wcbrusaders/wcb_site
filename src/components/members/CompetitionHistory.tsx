import type { PastCompView, MyEntryView } from '@/lib/competitions'
import { humanDate } from '@/lib/comp-format'
import { SectionLabel, Badge } from '@/components/ui'

// Competition history (server component). Two views of the same data:
//  - "My entries": everything the viewer has entered, across active AND past comps, grouped by comp.
//  - "Past competitions": every archived comp with the club's full "who entered what".
// Past comps used to collapse into a bare list of names, so entries vanished after the awards.

const yearOf = (d: Date | string) => new Date(d).getUTCFullYear()

export function CompetitionHistory({ past, mine }: { past: PastCompView[]; mine: MyEntryView[] }) {
  // group my entries by comp, preserving the newest-first order
  const myGroups: { compId: string; first: MyEntryView; beers: MyEntryView[] }[] = []
  for (const e of mine) {
    const g = myGroups.find((x) => x.compId === e.compId)
    if (g) g.beers.push(e); else myGroups.push({ compId: e.compId, first: e, beers: [e] })
  }
  const years = [...new Set(mine.map((e) => yearOf(e.resultsDate ?? e.shippingDeadline)))]

  return (
    <div className="mt-10">
      <SectionLabel icon="🍺">My entries</SectionLabel>
      {mine.length === 0 ? (
        <p className="text-sm text-foreground/50">You haven&apos;t logged any entries yet.</p>
      ) : (
        <details open className="rounded-xl border border-border/60 bg-background/40 p-4">
          <summary className="cursor-pointer text-sm text-foreground/70">
            {mine.length} entr{mine.length === 1 ? 'y' : 'ies'} across {myGroups.length} competition{myGroups.length === 1 ? '' : 's'}
            {years.length > 0 && <span className="text-foreground/40"> · {years.join(', ')}</span>}
          </summary>
          <ul className="mt-3 space-y-3">
            {myGroups.map((g) => (
              <li key={g.compId}>
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <a href={g.first.homepageUrl} target="_blank" rel="noreferrer" className="font-semibold hover:text-accent">{g.first.compName}</a>
                  <span className="text-foreground/40">· awards {g.first.resultsDate ? humanDate(g.first.resultsDate) : 'TBD'}</span>
                  {!g.first.isPast && <Badge color="#4ade80">Active</Badge>}
                </div>
                <ul className="mt-1 ml-3 space-y-0.5">
                  {g.beers.map((b) => (
                    <li key={b.entryId} className="text-sm"><span className="font-medium">{b.beerName}</span> <span className="text-foreground/50">· {b.style}</span></li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      )}

      {past.length > 0 && (
        <>
          <SectionLabel icon="🏅">Past competitions ({past.length})</SectionLabel>
          <div className="space-y-2">
            {past.map((c) => (
              <details key={c.id} className="rounded-xl border border-border/60 bg-background/40 px-4 py-3">
                <summary className="cursor-pointer text-sm flex items-baseline gap-2 flex-wrap">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-foreground/40">· awards {c.resultsDate ? humanDate(c.resultsDate) : '—'}</span>
                  <span className="text-foreground/40">· {c.allEntries.length} entr{c.allEntries.length === 1 ? 'y' : 'ies'}</span>
                </summary>
                {c.allEntries.length === 0 ? (
                  <p className="mt-2 text-sm text-foreground/50">No club entries were logged for this one.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {[...c.allEntries].sort((a, b) => (a.memberName ?? '').localeCompare(b.memberName ?? '')).map((e) => (
                      <li key={e.id} className="text-sm flex items-baseline gap-2 flex-wrap">
                        <span className="text-foreground/50 min-w-[8rem]">{e.memberName ?? 'Member'}</span>
                        <span className="font-medium">{e.beerName}</span>
                        <span className="text-foreground/50">· {e.style}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <a href={c.homepageUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-accent hover:underline">Competition site ↗</a>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
