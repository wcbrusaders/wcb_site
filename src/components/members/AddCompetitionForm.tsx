'use client'
import { useState, useTransition } from 'react'
import { addCompetitionAction } from '@/app/members/_actions/competition-actions'

const EMPTY = { name: '', homepageUrl: '', registrationDeadline: '', shippingDeadline: '', bottlesRequired: '', shippingAddress: '', dropoffAddress: '' }

export function AddCompetitionForm() {
  const [pending, start] = useTransition()
  const [f, setF] = useState({ ...EMPTY })
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  if (!open) return <button onClick={() => setOpen(true)} className="mb-6 border border-border px-4 py-1.5 rounded-full text-sm">Add a competition</button>

  return (
    <form className="rounded-2xl border border-border/50 bg-card-bg/20 p-6 mb-8 space-y-3"
      onSubmit={(e) => {
        e.preventDefault(); setErr(null)
        if (!f.name || !f.homepageUrl || !f.registrationDeadline || !f.shippingDeadline || !f.shippingAddress || Number(f.bottlesRequired) < 1) {
          setErr('Name, homepage, both deadlines, bottles (≥1), and a shipping address are required.'); return
        }
        start(async () => {
          const r = await addCompetitionAction({
            name: f.name, homepageUrl: f.homepageUrl,
            registrationDeadline: new Date(f.registrationDeadline), shippingDeadline: new Date(f.shippingDeadline),
            bottlesRequired: Number(f.bottlesRequired), shippingAddress: f.shippingAddress,
            dropoffAddress: f.dropoffAddress || null,
          })
          if (!r.ok) setErr('Could not add — check the fields.')
          else { setF({ ...EMPTY }); setOpen(false) }
        })
      }}>
      <p className="text-[11px] uppercase tracking-wide text-foreground/40 mb-1">The comp</p>
      <div>
        <label className="block text-xs text-foreground/50 mb-1">Name</label>
        <input required placeholder="SHA Open 2026" value={f.name} onChange={set('name')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-foreground/50 mb-1">Homepage URL</label>
        <input required placeholder="https://…" value={f.homepageUrl} onChange={set('homepageUrl')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-foreground/50 mb-1">Entry reg <span className="text-foreground/35">by</span></label>
          <input required type="date" value={f.registrationDeadline} onChange={set('registrationDeadline')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-foreground/50 mb-1">Beer arrival <span className="text-foreground/35">by</span></label>
          <input required type="date" value={f.shippingDeadline} onChange={set('shippingDeadline')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-foreground/50 mb-1">Bottles/entry</label>
          <input required type="number" min={1} placeholder="2 or 3" value={f.bottlesRequired} onChange={set('bottlesRequired')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
        </div>
      </div>
      <p className="text-[11px] uppercase tracking-wide text-foreground/40 mb-1 mt-2">Where to send beer</p>
      <div>
        <label className="block text-xs text-foreground/50 mb-1">Shipping address</label>
        <input required placeholder="Required" value={f.shippingAddress} onChange={set('shippingAddress')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-foreground/50 mb-1">Drop-off address <span className="text-foreground/35">optional</span></label>
        <input placeholder="e.g. Holly Springs" value={f.dropoffAddress} onChange={set('dropoffAddress')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}
      <div className="flex gap-2">
        <button disabled={pending} type="submit" className="bg-accent hover:bg-accent-hover text-background px-4 py-1.5 rounded-full text-sm disabled:opacity-50">Add</button>
        <button type="button" onClick={() => { setOpen(false); setErr(null) }} className="border border-border px-4 py-1.5 rounded-full text-sm">Cancel</button>
      </div>
    </form>
  )
}
