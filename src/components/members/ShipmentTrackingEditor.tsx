'use client'
import { useState, useTransition } from 'react'
import { trackingUrl } from '@/lib/competitions'
import { setShipmentTrackingAction } from '@/app/members/_actions/competition-actions'

const iso = (d: Date) => new Date(d).toISOString().slice(0, 10)

// Officer-only control for the one club shipment per competition. Renders in
// the officer logistics view (OfficerCompetitions), which lists every comp —
// not just ones the officer personally entered. Members see the same tracking
// (read-only) on their own CompetitionCard.
export function ShipmentTrackingEditor({
  competitionId, carrier, tracking, shippedAt,
}: {
  competitionId: string
  carrier: string | null
  tracking: string | null
  shippedAt: Date | null
}) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ carrier: carrier ?? '', tracking: tracking ?? '' })
  const url = trackingUrl(carrier, tracking)
  const hasTracking = !!(carrier || tracking)

  function save() {
    setErr(null)
    start(async () => {
      const r = await setShipmentTrackingAction(competitionId, draft.carrier, draft.tracking)
      if (r.ok) setEditing(false)
      else setErr('Could not save — try again.')
    })
  }

  return (
    <div className="mt-3 rounded-xl border border-border/60 bg-background/40 p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-foreground/45">Club shipment tracking</p>
          {hasTracking ? (
            <div className="text-sm mt-0.5">
              {shippedAt && <span className="text-foreground/55">Shipped {iso(shippedAt)} · </span>}
              <span className="font-semibold">{carrier || 'Carrier'}</span>
              {tracking && (url
                ? <> · <a href={url} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover underline underline-offset-2">{tracking}</a></>
                : <> · <span className="font-mono">{tracking}</span></>
              )}
            </div>
          ) : (
            <p className="text-sm text-foreground/55 mt-0.5">Not shipped yet</p>
          )}
        </div>
        {!editing && (
          <button disabled={pending} onClick={() => { setDraft({ carrier: carrier ?? '', tracking: tracking ?? '' }); setEditing(true) }}
            className="border border-border px-2.5 py-0.5 rounded-full text-xs shrink-0">{hasTracking ? 'Edit tracking' : 'Add tracking'}</button>
        )}
      </div>
      {editing && (
        <div className="mt-3 space-y-2">
          <input placeholder="Carrier (UPS, FedEx)" value={draft.carrier} onChange={(e) => setDraft({ ...draft, carrier: e.target.value })} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
          <input placeholder="Tracking number" value={draft.tracking} onChange={(e) => setDraft({ ...draft, tracking: e.target.value })} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button disabled={pending} onClick={save} className="bg-accent hover:bg-accent-hover text-background px-3 py-1 rounded-full text-sm disabled:opacity-50">Save tracking</button>
            <button onClick={() => setEditing(false)} className="border border-border px-3 py-1 rounded-full text-sm">Cancel</button>
          </div>
          <p className="text-[11px] text-foreground/45">Leave both blank and save to clear. Every member can see this.</p>
        </div>
      )}
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
    </div>
  )
}
