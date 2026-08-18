'use client'
import { useState, useTransition } from 'react'
import type { MemberCompView, EntryChannel } from '@/lib/competitions'
import { mapsUrl, trackingUrl } from '@/lib/competitions'
import { channelBadge, daysUntil, isUrgent, type BadgeVariant } from '@/lib/comp-format'
import { addEntryAction, editEntryAction, deleteEntryAction, deleteCompetitionAction, setShipmentTrackingAction } from '@/app/members/_actions/competition-actions'

const BADGE_CLASS: Record<BadgeVariant, string> = {
  club: 'bg-accent/15 text-accent border border-accent/30',
  self: 'bg-[#93c5fd]/12 text-[#93c5fd] border border-[#93c5fd]/30',
  drop: 'bg-white/[0.06] text-foreground/70 border border-border',
  reg: 'bg-[#4ade80]/12 text-[#4ade80] border border-[#4ade80]/30',
  unreg: 'bg-white/[0.04] text-foreground/50 border border-border',
  neutral: 'bg-white/[0.06] text-foreground/60 border border-border',
}
const SEG_CHANNELS: { v: EntryChannel; label: string }[] = [
  { v: 'club_ship', label: 'Club ships' }, { v: 'self_ship', label: 'I ship it' }, { v: 'dropoff', label: 'I drop off' },
]
const iso = (d: Date) => new Date(d).toISOString().slice(0, 10)

export function CompetitionCard({ comp, viewerIsBoard, viewerId }: { comp: MemberCompView; viewerIsBoard: boolean; viewerId: string }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editingShip, setEditingShip] = useState(false)
  const [shipDraft, setShipDraft] = useState({ carrier: comp.shipmentCarrier ?? '', tracking: comp.shipmentTracking ?? '' })
  const [draft, setDraft] = useState({ beerName: '', style: '', channel: 'club_ship' as EntryChannel, registered: false })
  const canEditComp = viewerIsBoard || comp.addedById === viewerId
  const hasClubShip = comp.myEntries.some((e) => e.channel === 'club_ship')

  function run(fn: () => Promise<{ ok: boolean }>) { setErr(null); start(async () => { const r = await fn(); if (!r.ok) setErr('Action failed — refresh.') }) }

  return (
    <div className="rounded-2xl border border-border/50 bg-card-bg/30 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <a href={comp.homepageUrl} target="_blank" rel="noreferrer" className="text-lg font-bold hover:text-accent">{comp.name}</a>
          <div className="flex gap-2 flex-wrap mt-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 py-1 text-xs">
              <span className="text-foreground/45 uppercase text-[10px] tracking-wide">Entry reg</span>
              <span className="font-semibold">{iso(comp.registrationDeadline)}</span>
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${isUrgent(comp.shippingDeadline) ? 'border-red-400/50' : 'border-border'} bg-background/60`}>
              <span className="text-foreground/45 uppercase text-[10px] tracking-wide">Beer arrives</span>
              <span className={`font-semibold ${isUrgent(comp.shippingDeadline) ? 'text-red-400' : ''}`}>{iso(comp.shippingDeadline)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 py-1 text-xs">
              <span className="text-foreground/45 uppercase text-[10px] tracking-wide">Bottles/entry</span>
              <span className="font-semibold">{comp.bottlesRequired}</span>
            </span>
          </div>
          <div className="flex gap-2 mt-2">
            <a href={mapsUrl(comp.shippingAddress)} target="_blank" rel="noreferrer" className="rounded-lg border border-accent/30 text-accent hover:bg-accent/10 px-2.5 py-1 text-xs">📍 Ship-to</a>
            {comp.dropoffAddress && <a href={mapsUrl(comp.dropoffAddress)} target="_blank" rel="noreferrer" className="rounded-lg border border-accent/30 text-accent hover:bg-accent/10 px-2.5 py-1 text-xs">📍 Drop-off</a>}
          </div>
        </div>
        {canEditComp && viewerIsBoard && (
          <button disabled={pending} onClick={() => { if (confirm(`Delete "${comp.name}" and all its entries?`)) run(() => deleteCompetitionAction(comp.id)) }}
            className="border border-red-500/40 text-red-400 px-3 py-1 rounded-full text-xs shrink-0">Delete comp</button>
        )}
      </div>

      {hasClubShip && (() => {
        const clubCount = comp.myEntries.filter((e) => e.channel === 'club_ship').length
        const urgent = isUrgent(comp.deliverByDate)
        const days = daysUntil(comp.deliverByDate)
        return (
          <div className={`mt-4 flex items-center gap-3 rounded-xl border p-3.5 ${urgent ? 'border-red-400/55 bg-red-400/[0.08]' : 'border-accent/45 bg-accent/[0.08]'}`}>
            <span className="text-xl">{urgent ? '⏰' : '📦'}</span>
            <div>
              <div className="font-bold text-sm">Get your bottles to the shipper by{' '}
                <span className={urgent ? 'text-red-400' : 'text-accent'}>{iso(comp.deliverByDate)} · {days} day{days === 1 ? '' : 's'}</span>
              </div>
              <div className="text-xs text-foreground/55">{clubCount} club-ship entr{clubCount === 1 ? 'y' : 'ies'} · club covers shipping for this comp</div>
            </div>
          </div>
        )
      })()}

      {(() => {
        const url = trackingUrl(comp.shipmentCarrier, comp.shipmentTracking)
        const hasTracking = !!(comp.shipmentCarrier || comp.shipmentTracking)
        // Every member sees the club shipment status; only board can set/edit it.
        if (!hasTracking && !viewerIsBoard) return null
        return (
          <div className="mt-4 rounded-xl border border-border/60 bg-background/40 p-3.5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-foreground/45">Club shipment</p>
                {hasTracking ? (
                  <div className="text-sm mt-0.5">
                    {comp.deliveryStatus === 'delivered' && comp.deliveredAt ? (
                      <span className="font-semibold text-[#4ade80]">Delivered {iso(comp.deliveredAt)} · </span>
                    ) : comp.shippedAt ? (
                      <span className="text-foreground/55">
                        Shipped {iso(comp.shippedAt)}
                        {comp.deliveryStatus === 'in_transit' && ' · In transit'} ·{' '}
                      </span>
                    ) : null}
                    <span className="font-semibold">{comp.shipmentCarrier || 'Carrier'}</span>
                    {comp.shipmentTracking && (url
                      ? <> · <a href={url} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover underline underline-offset-2">{comp.shipmentTracking}</a></>
                      : <> · <span className="font-mono">{comp.shipmentTracking}</span></>
                    )}
                    {comp.deliveryStatus === 'exception' && (
                      <span className="text-amber-400/80"> · Delivery exception — check tracking</span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-foreground/55 mt-0.5">Not shipped yet</p>
                )}
              </div>
              {viewerIsBoard && !editingShip && (
                <button disabled={pending} onClick={() => { setShipDraft({ carrier: comp.shipmentCarrier ?? '', tracking: comp.shipmentTracking ?? '' }); setEditingShip(true) }}
                  className="border border-border px-2.5 py-0.5 rounded-full text-xs shrink-0">{hasTracking ? 'Edit tracking' : 'Add tracking'}</button>
              )}
            </div>
            {viewerIsBoard && editingShip && (
              <div className="mt-3 space-y-2">
                <input placeholder="Carrier (UPS, FedEx)" value={shipDraft.carrier} onChange={(e) => setShipDraft({ ...shipDraft, carrier: e.target.value })} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
                <input placeholder="Tracking number" value={shipDraft.tracking} onChange={(e) => setShipDraft({ ...shipDraft, tracking: e.target.value })} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
                <div className="flex gap-2">
                  <button disabled={pending} onClick={() => run(async () => { const r = await setShipmentTrackingAction(comp.id, shipDraft.carrier, shipDraft.tracking); if (r.ok) setEditingShip(false); return r })} className="bg-accent hover:bg-accent-hover text-background px-3 py-1 rounded-full text-sm disabled:opacity-50">Save tracking</button>
                  <button onClick={() => setEditingShip(false)} className="border border-border px-3 py-1 rounded-full text-sm">Cancel</button>
                </div>
                <p className="text-[11px] text-foreground/45">Leave both blank and save to clear. Any member can see this.</p>
              </div>
            )}
          </div>
        )
      })()}

      <div className="mt-4">
        <p className="text-sm font-medium mb-2">Your entries · {comp.myEntries.length}</p>
        <ul className="space-y-2">
          {comp.myEntries.map((e) => {
            const cb = channelBadge(e.channel)
            return (
              <li key={e.id} className="rounded-xl border border-border/60 bg-background/40 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-semibold">{e.beerName} <span className="text-foreground/50 font-normal text-sm">· {e.style}</span></div>
                  <div className="flex gap-1.5 mt-1.5">
                    <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${BADGE_CLASS[cb.variant]}`}>{cb.label}</span>
                    <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${e.registered ? BADGE_CLASS.reg : BADGE_CLASS.unreg}`}>{e.registered ? 'Registered' : 'Not registered'}</span>
                  </div>
                </div>
                <span className="flex gap-2 shrink-0">
                  <button disabled={pending} onClick={() => run(() => editEntryAction(e.id, { registered: !e.registered }))} className="border border-border px-2.5 py-0.5 rounded-full text-xs">{e.registered ? 'Unregister' : 'Register'}</button>
                  <button disabled={pending} onClick={() => run(() => deleteEntryAction(e.id))} className="border border-red-500/40 text-red-400 px-2.5 py-0.5 rounded-full text-xs">Remove</button>
                </span>
              </li>
            )
          })}
        </ul>
        {comp.allEntries.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-foreground/50 hover:text-foreground">
              Who entered · {comp.allEntries.length} entr{comp.allEntries.length === 1 ? 'y' : 'ies'} from the club
            </summary>
            <ul className="mt-2 space-y-1">
              {comp.allEntries.map((e) => (
                <li key={e.id} className="text-sm flex items-baseline gap-2 flex-wrap">
                  <span className="text-foreground/50 min-w-[8rem]">{e.memberName ?? 'Member'}</span>
                  <span className="font-medium">{e.beerName}</span>
                  <span className="text-foreground/50">· {e.style}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] text-foreground/40">Handy at the award ceremony — see what the club entered.</p>
          </details>
        )}

        {adding ? (
          <div className="mt-2 space-y-2">
            <input placeholder="Beer name" value={draft.beerName} onChange={(e) => setDraft({ ...draft, beerName: e.target.value })} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
            <input placeholder="Style" value={draft.style} onChange={(e) => setDraft({ ...draft, style: e.target.value })} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-foreground/45 mb-1.5">How it gets there</p>
              <div className="flex gap-1.5">
                {SEG_CHANNELS.map((c) => (
                  <button key={c.v} type="button" onClick={() => setDraft({ ...draft, channel: c.v })}
                    className={`flex-1 rounded-lg border px-2 py-2 text-xs ${draft.channel === c.v ? 'border-accent text-accent bg-accent/10' : 'border-border text-foreground/60 bg-background/60'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.registered} onChange={(e) => setDraft({ ...draft, registered: e.target.checked })} /> Already registered</label>
            <div className="flex gap-2">
              <button disabled={pending || !draft.beerName || !draft.style} onClick={() => run(async () => { const r = await addEntryAction(comp.id, draft); if (r.ok) { setDraft({ beerName: '', style: '', channel: 'club_ship', registered: false }); setAdding(false) } return r })} className="bg-accent hover:bg-accent-hover text-background px-3 py-1 rounded-full text-sm disabled:opacity-50">Add entry</button>
              <button onClick={() => setAdding(false)} className="border border-border px-3 py-1 rounded-full text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <button disabled={pending} onClick={() => setAdding(true)} className="mt-2 border border-border px-3 py-1 rounded-full text-xs">Add entry</button>
        )}
      </div>
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
    </div>
  )
}
