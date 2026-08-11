'use client'
import { useState, useTransition } from 'react'
import { addCompetitionAction } from '@/app/members/_actions/competition-actions'

const EMPTY = { name: '', homepageUrl: '', registrationDeadline: '', shippingDeadline: '', bottlesRequired: 3, shippingAddress: '', dropoffAddress: '' }

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
      <input required placeholder="Competition name" value={f.name} onChange={set('name')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
      <input required placeholder="Homepage URL" value={f.homepageUrl} onChange={set('homepageUrl')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
      <label className="block text-xs text-foreground/50">Registration deadline
        <input required type="date" value={f.registrationDeadline} onChange={set('registrationDeadline')} className="mt-1 w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" /></label>
      <label className="block text-xs text-foreground/50">Shipping deadline
        <input required type="date" value={f.shippingDeadline} onChange={set('shippingDeadline')} className="mt-1 w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" /></label>
      <input required type="number" min={1} placeholder="Bottles required" value={f.bottlesRequired} onChange={set('bottlesRequired')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
      <input required placeholder="Shipping address" value={f.shippingAddress} onChange={set('shippingAddress')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
      <input placeholder="Drop-off address (optional)" value={f.dropoffAddress} onChange={set('dropoffAddress')} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm" />
      {err && <p className="text-sm text-red-400">{err}</p>}
      <div className="flex gap-2">
        <button disabled={pending} type="submit" className="bg-accent hover:bg-accent-hover text-background px-4 py-1.5 rounded-full text-sm disabled:opacity-50">Add</button>
        <button type="button" onClick={() => { setOpen(false); setErr(null) }} className="border border-border px-4 py-1.5 rounded-full text-sm">Cancel</button>
      </div>
    </form>
  )
}
