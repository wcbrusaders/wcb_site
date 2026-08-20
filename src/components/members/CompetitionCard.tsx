'use client'
import { useState, useTransition } from 'react'
import type { MemberCompView, EntryChannel } from '@/lib/competitions'
import { mapsUrl, trackingUrl } from '@/lib/competitions'
import { channelBadge, isUrgent, deliverBannerState, humanDate, relDays, compTimeline, type BadgeVariant } from '@/lib/comp-format'
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
const field = 'w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-accent/60'

// Colors + labels for the 3-step timeline states.
const DOT: Record<string, { color: string; ring: string }> = {
  done: { color: '#4ade80', ring: 'rgba(74,222,128,.5)' },
  upcoming: { color: '#ff9500', ring: 'rgba(255,149,0,.5)' },
  future: { color: '#5a5a5a', ring: 'transparent' },
  pending: { color: '#5a5a5a', ring: 'transparent' },
}

export function CompetitionCard({ comp, viewerIsBoard, viewerId }: { comp: MemberCompView; viewerIsBoard: boolean; viewerId: string }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editingShip, setEditingShip] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [shipDraft, setShipDraft] = useState({ carrier: comp.shipmentCarrier ?? '', tracking: comp.shipmentTracking ?? '' })
  const [draft, setDraft] = useState({ beerName: '', style: '', channel: 'club_ship' as EntryChannel, registered: false })
  const canEditComp = viewerIsBoard || comp.addedById === viewerId
  const hasClubShip = comp.myEntries.some((e) => e.channel === 'club_ship')
  const myCount = comp.myEntries.length
  const timeline = compTimeline(comp)

  function run(fn: () => Promise<{ ok: boolean }>) { setErr(null); start(async () => { const r = await fn(); if (!r.ok) setErr('Action failed — refresh.') }) }

  return (
    <div className="rounded-2xl border p-5 md:p-6 bg-[linear-gradient(#1c1c1c,#161616)]" style={{ borderColor: '#2c2c2c' }}>
      {/* --- Status-first header --- */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <a href={comp.homepageUrl} target="_blank" rel="noreferrer" className="text-lg font-bold hover:text-accent">{comp.name} <span className="text-foreground/30 font-normal text-sm">↗</span></a>
          <div className="text-xs text-foreground/50 mt-0.5">{comp.bottlesRequired} bottles/entry</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {myCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-[#4ade80]" style={{ background: 'rgba(74,222,128,.13)' }}>
              ✓ You&apos;re in · {myCount} entr{myCount === 1 ? 'y' : 'ies'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-foreground/50 border border-border/60">Not entered yet</span>
          )}
          {canEditComp && viewerIsBoard && (
            <div className="relative">
              <button aria-label="Competition actions" disabled={pending} onClick={() => setMenuOpen((o) => !o)}
                className="text-foreground/40 hover:text-foreground px-2 py-1 rounded-lg border border-border/50 text-sm leading-none">⋯</button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 z-10 rounded-lg border border-border bg-card-bg shadow-lg py-1 min-w-[9rem]">
                  <button disabled={pending} onClick={() => { setMenuOpen(false); if (confirm(`Delete "${comp.name}" and all its entries?`)) run(() => deleteCompetitionAction(comp.id)) }}
                    className="block w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10">Delete competition</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* --- Visual timeline: Register -> Beer arrives -> Delivered --- */}
      <div className="mt-4 flex items-start">
        {timeline.map((step, i) => {
          const d = DOT[step.state] ?? DOT.future
          const isLast = i === timeline.length - 1
          const active = step.state === 'upcoming'
          return (
            <div key={step.key} className="flex-1 flex flex-col items-center relative">
              {/* connector to next */}
              {!isLast && <span className="absolute top-[7px] left-1/2 w-full h-0.5" style={{ background: '#2c2c2c' }} />}
              <span className="relative z-[1] w-3.5 h-3.5 rounded-full" style={{ background: d.color, boxShadow: d.ring !== 'transparent' ? `0 0 0 3px ${d.ring}` : undefined }} />
              <span className={`mt-1.5 text-[10px] uppercase tracking-wide ${active ? 'text-accent' : 'text-foreground/45'}`}>{step.label}</span>
              <span className={`text-xs font-semibold ${step.state === 'done' ? 'text-[#4ade80]' : active ? 'text-accent' : 'text-foreground/70'}`}>
                {step.key === 'delivered' && step.state !== 'done' ? '—' : humanDate(step.date)}
              </span>
              {active && step.date && <span className="text-[10px] text-foreground/40">{relDays(step.date)}</span>}
            </div>
          )
        })}
      </div>

      {/* ship-to / drop-off quick links */}
      <div className="flex gap-2 mt-4">
        <a href={mapsUrl(comp.shippingAddress)} target="_blank" rel="noreferrer" className="rounded-lg border border-accent/30 text-accent hover:bg-accent/10 px-2.5 py-1 text-xs">📍 Ship-to</a>
        {comp.dropoffAddress && <a href={mapsUrl(comp.dropoffAddress)} target="_blank" rel="noreferrer" className="rounded-lg border border-accent/30 text-accent hover:bg-accent/10 px-2.5 py-1 text-xs">📍 Drop-off</a>}
      </div>

      {/* --- Deliver-by nudge (unchanged logic, System-B styling) --- */}
      {hasClubShip && (() => {
        const state = deliverBannerState(comp.deliverByDate, comp.shippedAt)
        if (state === 'hidden') return null
        const clubCount = comp.myEntries.filter((e) => e.channel === 'club_ship').length
        const subtext = `${clubCount} club-ship entr${clubCount === 1 ? 'y' : 'ies'} · club covers shipping`
        if (state === 'passed') {
          return (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-border/50 bg-background/40 p-3.5">
              <span className="text-xl">📦</span>
              <div>
                <div className="font-semibold text-sm text-foreground/70">Deliver-by deadline was {humanDate(comp.deliverByDate)}</div>
                <div className="text-xs text-foreground/55">{subtext}</div>
              </div>
            </div>
          )
        }
        const urgent = isUrgent(comp.deliverByDate)
        return (
          <div className={`mt-4 flex items-center gap-3 rounded-xl border p-3.5 ${urgent ? 'border-red-400/55 bg-red-400/[0.08]' : 'border-accent/45 bg-accent/[0.08]'}`}>
            <span className="text-xl">{urgent ? '⏰' : '📦'}</span>
            <div>
              <div className="font-bold text-sm">Get your bottles to the shipper by{' '}
                <span className={urgent ? 'text-red-400' : 'text-accent'}>{humanDate(comp.deliverByDate)} · {relDays(comp.deliverByDate)}</span>
              </div>
              <div className="text-xs text-foreground/55">{subtext}</div>
            </div>
          </div>
        )
      })()}

      {/* --- Club shipment status (unchanged logic, System-B styling) --- */}
      {(() => {
        const url = trackingUrl(comp.shipmentCarrier, comp.shipmentTracking)
        const hasTracking = !!(comp.shipmentCarrier || comp.shipmentTracking)
        if (!hasTracking && !viewerIsBoard) return null
        return (
          <div className="mt-4 rounded-xl border border-border/60 bg-background/40 p-3.5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-foreground/45">Club shipment</p>
                {hasTracking ? (
                  <div className="text-sm mt-0.5">
                    {comp.deliveryStatus === 'delivered' && comp.deliveredAt ? (
                      <span className="font-semibold text-[#4ade80]">Delivered {humanDate(comp.deliveredAt)} · </span>
                    ) : comp.shippedAt ? (
                      <span className="text-foreground/55">
                        Shipped {humanDate(comp.shippedAt)}
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
                <input placeholder="Carrier (UPS, FedEx)" value={shipDraft.carrier} onChange={(e) => setShipDraft({ ...shipDraft, carrier: e.target.value })} className={field} />
                <input placeholder="Tracking number" value={shipDraft.tracking} onChange={(e) => setShipDraft({ ...shipDraft, tracking: e.target.value })} className={field} />
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

      {/* --- Your entries --- */}
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/45 mb-2">Your entries · {myCount}</p>
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
            <input placeholder="Beer name" value={draft.beerName} onChange={(e) => setDraft({ ...draft, beerName: e.target.value })} className={field} />
            <input placeholder="Style" value={draft.style} onChange={(e) => setDraft({ ...draft, style: e.target.value })} className={field} />
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
          <button disabled={pending} onClick={() => setAdding(true)} className="mt-2 border border-border px-3 py-1 rounded-full text-xs">+ Add entry</button>
        )}
      </div>
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
    </div>
  )
}
