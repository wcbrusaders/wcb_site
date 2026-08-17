import type { OfficerCompView } from '@/lib/competitions'
import { ShipmentTrackingEditor } from './ShipmentTrackingEditor'

const iso = (d: Date) => new Date(d).toISOString().slice(0, 10)

export function OfficerCompetitions({ comps }: { comps: OfficerCompView[] }) {
  if (comps.length === 0) return null
  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold">Club shipping (officers)</h2>
      <p className="text-foreground/50 text-sm mt-1">All entries across the club. Pod total = club-ship entries × bottles required.</p>
      <div className="mt-4 space-y-4">
        {comps.map((c) => (
          <div key={c.id} className="rounded-2xl border border-border/50 bg-card-bg/30 p-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="font-semibold">{c.name}</p>
              <span className="text-sm">Beer arrives by {iso(c.shippingDeadline)} · <span className="text-accent">~{c.podTotal} bottles to pack</span></span>
            </div>
            <div className="mt-3">
              <p className="text-sm font-medium">Per member</p>
              <ul className="mt-1 text-sm text-foreground/70 space-y-0.5">
                {c.perMember.map((p) => (
                  <li key={p.memberId}>{p.memberName ?? 'Unknown member'} — {p.entryCount} entr{p.entryCount === 1 ? 'y' : 'ies'} ({p.clubShipCount} club-ship, {p.registeredCount} registered)</li>
                ))}
              </ul>
            </div>
            <ShipmentTrackingEditor competitionId={c.id} carrier={c.shipmentCarrier} tracking={c.shipmentTracking} shippedAt={c.shippedAt} />
            <details className="mt-3">
              <summary className="cursor-pointer text-foreground/50 text-sm">All entries ({c.entries.length})</summary>
              <ul className="mt-1 text-sm text-foreground/60 space-y-0.5">
                {c.entries.map((e) => (
                  <li key={e.id}>{e.memberName ?? 'Unknown'} — {e.beerName} ({e.style}) · {e.channel} · {e.registered ? 'registered' : 'not registered'}</li>
                ))}
              </ul>
            </details>
          </div>
        ))}
      </div>
    </section>
  )
}
