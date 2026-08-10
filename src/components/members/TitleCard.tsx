'use client'
import { useState, useTransition } from 'react'
import type { TitleView, Condition } from '@/lib/lending'
import { coverUrl } from '@/lib/lending'
import { checkoutAction, returnAction, renewAction } from '@/app/members/_actions/lending-actions'

const CONDITIONS = ['New', 'Good', 'Fair', 'Poor', 'Damaged'] as const

// `isBoard` is accepted for interface parity with the page (board-only affordances
// like per-copy archive are a later refinement per the v1 scope note); unused here.
export function TitleCard({ item }: { item: TitleView; isBoard: boolean }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [cond, setCond] = useState<string>('Good')
  const isEquip = item.category === 'equipment'
  const cover = coverUrl(item.isbn)
  // eslint-disable-next-line react-hooks/purity -- "overdue" is inherently time-dependent; a stale read here is harmless
  const overdue = item.myLoan && item.myLoan.dueAt.getTime() < Date.now()

  function run(fn: () => Promise<{ ok: boolean; reason?: string }>) {
    setErr(null)
    start(async () => { const r = await fn(); if (!r.ok) setErr(r.reason === 'unavailable' ? 'Just taken — refresh.' : (r.reason ?? 'Action failed.')) })
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card-bg/30 p-6 md:p-8">
      {item.category === 'book' && (cover
        // eslint-disable-next-line @next/next/no-img-element -- external Open Library covers; next/image not worth it here
        ? <img src={cover} alt="" className="w-20 h-28 object-cover rounded mb-3 bg-card-bg" />
        : <div className="w-20 h-28 rounded mb-3 bg-card-bg/60 border border-border/40" />)}
      <p className="font-semibold">{item.title}</p>
      {item.author && <p className="text-foreground/50 text-sm">{item.author}</p>}
      {item.description && <p className="text-foreground/60 text-sm mt-1">{item.description}</p>}
      <p className="text-foreground/50 text-sm mt-2">{item.availableCount} of {item.totalCount} available</p>
      {item.myLoan && <p className="text-foreground/70 text-sm mt-1">You have this · due {item.myLoan.dueAt.toISOString().slice(0, 10)}{overdue && <span className="ml-2 text-red-400">Overdue</span>}</p>}

      {isEquip && (item.availableCount > 0 || item.myLoan) && (
        <select value={cond} onChange={e => setCond(e.target.value)} className="mt-3 block rounded-lg border border-border bg-background/60 px-2 py-1 text-sm">
          {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {item.availableCount > 0 && !item.myLoan && (
          <button disabled={pending} onClick={() => run(() => checkoutAction(item.id, item.title, item.category, isEquip ? { conditionOut: cond as Condition } : undefined))}
            className="bg-accent hover:bg-accent-hover text-background font-medium px-4 py-1.5 rounded-full text-sm disabled:opacity-50">Check out</button>
        )}
        {item.myLoan && (
          <>
            <button disabled={pending} onClick={() => run(() => returnAction(item.myLoan!.loanId, isEquip ? { conditionIn: cond as Condition } : undefined))}
              className="border border-border px-4 py-1.5 rounded-full text-sm disabled:opacity-50">Return</button>
            <button disabled={pending} onClick={() => run(() => renewAction(item.myLoan!.loanId))}
              className="border border-border px-4 py-1.5 rounded-full text-sm disabled:opacity-50">Renew</button>
          </>
        )}
      </div>
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
    </div>
  )
}
