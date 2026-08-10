'use client'
import { useState, useTransition, type ChangeEvent } from 'react'
import { addTitleAction } from '@/app/members/_actions/lending-actions'
import type { Condition } from '@/lib/lending'

type FormState = {
  title: string
  author: string
  isbn: string
  description: string
  notes: string
  copies: number
  initialCondition: Condition
}

const INITIAL: FormState = { title: '', author: '', isbn: '', description: '', notes: '', copies: 1, initialCondition: 'New' }

export function AddTitleForm({ category }: { category: 'book' | 'equipment' }) {
  const [pending, start] = useTransition()
  const [f, setF] = useState<FormState>(INITIAL)
  const set = (k: keyof FormState) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <form className="rounded-2xl border border-border/50 bg-card-bg/20 p-6 mb-8 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          await addTitleAction({
            category, title: f.title, description: f.description || undefined,
            author: category === 'book' ? (f.author || undefined) : undefined,
            isbn: category === 'book' ? (f.isbn || undefined) : undefined,
            notes: category === 'equipment' ? (f.notes || undefined) : undefined,
            copies: Number(f.copies) || 1,
            initialCondition: category === 'equipment' ? f.initialCondition : undefined,
          })
          setF({ ...f, title: '', author: '', isbn: '', description: '', notes: '' })
        })
      }}>
      <p className="text-accent uppercase text-sm font-medium">Add {category}</p>
      <input required placeholder="Title" value={f.title} onChange={set('title')} className="w-full rounded-xl border border-border bg-background/60 px-4 py-2" />
      {category === 'book' && <input placeholder="Author" value={f.author} onChange={set('author')} className="w-full rounded-xl border border-border bg-background/60 px-4 py-2" />}
      {category === 'book' && <input placeholder="ISBN (for cover)" value={f.isbn} onChange={set('isbn')} className="w-full rounded-xl border border-border bg-background/60 px-4 py-2" />}
      <input placeholder="Description" value={f.description} onChange={set('description')} className="w-full rounded-xl border border-border bg-background/60 px-4 py-2" />
      {category === 'equipment' && <input placeholder="Notes" value={f.notes} onChange={set('notes')} className="w-full rounded-xl border border-border bg-background/60 px-4 py-2" />}
      <div className="flex gap-3 items-center">
        <label className="text-sm text-foreground/60"># copies <input type="number" min={1} value={f.copies} onChange={set('copies')} className="w-16 ml-2 rounded-lg border border-border bg-background/60 px-2 py-1" /></label>
        {category === 'equipment' && (
          <select value={f.initialCondition} onChange={set('initialCondition')} className="rounded-lg border border-border bg-background/60 px-2 py-1 text-sm">
            {(['New', 'Good', 'Fair', 'Poor', 'Damaged'] as const).map(c => <option key={c}>{c}</option>)}
          </select>
        )}
      </div>
      <button disabled={pending} className="bg-accent hover:bg-accent-hover text-background font-medium px-5 py-2 rounded-full text-sm disabled:opacity-50">Add</button>
    </form>
  )
}
