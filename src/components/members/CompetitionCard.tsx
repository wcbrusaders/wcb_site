'use client'
import { useState, useTransition } from 'react'
import type { MemberCompView, EntryChannel } from '@/lib/competitions'
import { mapsUrl } from '@/lib/competitions'
import { addEntryAction, editEntryAction, deleteEntryAction, deleteCompetitionAction } from '@/app/members/_actions/competition-actions'

const CHANNELS: { v: EntryChannel; label: string }[] = [
  { v: 'club_ship', label: 'Club ships it' }, { v: 'self_ship', label: 'I ship it myself' }, { v: 'dropoff', label: 'I drop it off' },
]
const iso = (d: Date) => new Date(d).toISOString().slice(0, 10)

export function CompetitionCard({ comp, viewerIsBoard, viewerId }: { comp: MemberCompView; viewerIsBoard: boolean; viewerId: string }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ beerName: '', style: '', channel: 'club_ship' as EntryChannel, registered: false })
  const canEditComp = viewerIsBoard || comp.addedById === viewerId
  const hasClubShip = comp.myEntries.some((e) => e.channel === 'club_ship')

  function run(fn: () => Promise<{ ok: boolean }>) { setErr(null); start(async () => { const r = await fn(); if (!r.ok) setErr('Action failed — refresh.') }) }

  return (
    <div className="rounded-2xl border border-border/50 bg-card-bg/30 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <a href={comp.homepageUrl} target="_blank" rel="noreferrer" className="font-semibold hover:text-accent">{comp.name}</a>
          <p className="text-foreground/50 text-sm mt-1">Entry reg by {iso(comp.registrationDeadline)} · Beer arrives by {iso(comp.shippingDeadline)} · {comp.bottlesRequired} bottles/entry</p>
          <p className="text-sm mt-1">
            <a href={mapsUrl(comp.shippingAddress)} target="_blank" rel="noreferrer" className="text-accent/80 hover:text-accent">Ship-to map</a>
            {comp.dropoffAddress && <> · <a href={mapsUrl(comp.dropoffAddress)} target="_blank" rel="noreferrer" className="text-accent/80 hover:text-accent">Drop-off map</a></>}
          </p>
          {hasClubShip && <p className="text-foreground/60 text-sm mt-1">Club-ship: commit by {iso(comp.commitByDate)}, deliver to shipper by {iso(comp.deliverByDate)}</p>}
        </div>
        {canEditComp && viewerIsBoard && (
          <button disabled={pending} onClick={() => { if (confirm(`Delete "${comp.name}" and all its entries?`)) run(() => deleteCompetitionAction(comp.id)) }}
            className="border border-red-500/40 text-red-400 px-3 py-1 rounded-full text-xs">Delete comp</button>
        )}
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium mb-2">Your entries</p>
        <ul className="space-y-2">
          {comp.myEntries.map((e) => (
            <li key={e.id} className="rounded-lg border border-border/40 bg-background/40 px-4 py-2 text-sm flex items-center justify-between gap-3 flex-wrap">
              <span>{e.beerName} · {e.style} · {CHANNELS.find((c) => c.v === e.channel)?.label} · {e.registered ? 'registered' : 'not registered'}</span>
              <span className="flex gap-2">
                <button disabled={pending} onClick={() => run(() => editEntryAction(e.id, { registered: !e.registered }))} className="border border-border px-2 py-0.5 rounded-full text-xs">{e.registered ? 'Mark unregistered' : 'Mark registered'}</button>
                <button disabled={pending} onClick={() => run(() => deleteEntryAction(e.id))} className="border border-red-500/40 text-red-400 px-2 py-0.5 rounded-full text-xs">Remove</button>
              </span>
            </li>
          ))}
        </ul>
        {adding ? (
          <div className="mt-2 space-y-2">
            <input placeholder="Beer name" value={draft.beerName} onChange={(e) => setDraft({ ...draft, beerName: e.target.value })} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
            <input placeholder="Style" value={draft.style} onChange={(e) => setDraft({ ...draft, style: e.target.value })} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
            <select value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value as EntryChannel })} className="rounded-lg border border-border bg-background/60 px-2 py-1 text-sm">
              {CHANNELS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
            </select>
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
