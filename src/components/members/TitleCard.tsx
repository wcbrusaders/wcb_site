'use client'
import { useState, useTransition } from 'react'
import type { TitleView, Condition } from '@/lib/lending'
import { coverUrl, EQUIPMENT_SUBCATEGORIES } from '@/lib/lending'
import {
  checkoutAction, returnAction, renewAction,
  addCopiesAction, editTitleAction, archiveCopyAction,
} from '@/app/members/_actions/lending-actions'

const CONDITIONS = ['New', 'Good', 'Fair', 'Poor', 'Damaged'] as const

type EditFields = { title: string; author: string; isbn: string; description: string; notes: string; subcategory: string }

export function TitleCard({ item, isBoard }: { item: TitleView; isBoard: boolean }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [cond, setCond] = useState<string>('Good')
  const [editing, setEditing] = useState(false)
  const [edit, setEdit] = useState<EditFields>({
    title: item.title, author: item.author ?? '', isbn: item.isbn ?? '',
    description: item.description ?? '', notes: item.notes ?? '', subcategory: item.subcategory ?? 'Other',
  })
  const isEquip = item.category === 'equipment'
  const cover = coverUrl(item.isbn)
  // eslint-disable-next-line react-hooks/purity -- "overdue" is inherently time-dependent; a stale read here is harmless
  const overdue = item.myLoan && item.myLoan.dueAt.getTime() < Date.now()

  function run(fn: () => Promise<{ ok: boolean; reason?: string }>) {
    setErr(null)
    start(async () => { const r = await fn(); if (!r.ok) setErr(r.reason === 'unavailable' ? 'Just taken — refresh.' : (r.reason ?? 'Action failed.')) })
  }

  function saveEdit() {
    setErr(null)
    start(async () => {
      await editTitleAction(item.id, {
        title: edit.title,
        description: edit.description || undefined,
        author: !isEquip ? (edit.author || undefined) : undefined,
        isbn: !isEquip ? (edit.isbn || undefined) : undefined,
        notes: isEquip ? (edit.notes || undefined) : undefined,
        ...(isEquip ? { subcategory: edit.subcategory } : {}),
      })
      setEditing(false)
    })
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

      {isBoard && (
        <div className="mt-4 pt-4 border-t border-border/40 flex flex-wrap gap-2">
          <button disabled={pending} onClick={() => run(() => addCopiesAction(item.id, 1, isEquip ? (cond as Condition) : undefined))}
            className="border border-border px-4 py-1.5 rounded-full text-sm disabled:opacity-50">Add copy</button>
          <button disabled={pending} onClick={() => setEditing(v => !v)}
            className="border border-border px-4 py-1.5 rounded-full text-sm disabled:opacity-50">Edit</button>
          <button disabled={pending || !item.archivableCopyId}
            onClick={() => item.archivableCopyId && run(() => archiveCopyAction(item.archivableCopyId!))}
            className="border border-border px-4 py-1.5 rounded-full text-sm disabled:opacity-50">Archive a copy</button>
        </div>
      )}

      {isBoard && editing && (
        <div className="mt-3 space-y-2">
          <input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} placeholder="Title"
            className="w-full rounded-xl border border-border bg-background/60 px-4 py-2 text-sm" />
          {!isEquip && (
            <>
              <input value={edit.author} onChange={e => setEdit({ ...edit, author: e.target.value })} placeholder="Author"
                className="w-full rounded-xl border border-border bg-background/60 px-4 py-2 text-sm" />
              <input value={edit.isbn} onChange={e => setEdit({ ...edit, isbn: e.target.value })} placeholder="ISBN"
                className="w-full rounded-xl border border-border bg-background/60 px-4 py-2 text-sm" />
            </>
          )}
          <input value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} placeholder="Description"
            className="w-full rounded-xl border border-border bg-background/60 px-4 py-2 text-sm" />
          {isEquip && (
            <input value={edit.notes} onChange={e => setEdit({ ...edit, notes: e.target.value })} placeholder="Notes"
              className="w-full rounded-xl border border-border bg-background/60 px-4 py-2 text-sm" />
          )}
          {isEquip && (
            <select value={edit.subcategory} onChange={e => setEdit({ ...edit, subcategory: e.target.value })} className="rounded-lg border border-border bg-background/60 px-2 py-1 text-sm">
              {EQUIPMENT_SUBCATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <div className="flex gap-2">
            <button disabled={pending} onClick={saveEdit}
              className="bg-accent hover:bg-accent-hover text-background font-medium px-4 py-1.5 rounded-full text-sm disabled:opacity-50">Save</button>
            <button disabled={pending} onClick={() => setEditing(false)}
              className="border border-border px-4 py-1.5 rounded-full text-sm disabled:opacity-50">Cancel</button>
          </div>
        </div>
      )}

      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
    </div>
  )
}
