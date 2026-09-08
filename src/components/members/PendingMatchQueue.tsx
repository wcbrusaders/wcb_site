'use client'

import { useState, useTransition } from 'react'
import { resolvePendingMatchAction } from '@/app/members/admin/membership/_actions'
import { EmptyState } from '@/components/ui'

export type PendingMatchRow = {
  id: string
  amount: number
  email: string
  name: string
  candidates: { rowNumber: number; name: string | null }[]
  createdAt: string // ISO date string (RSC boundary — see wcb-rsc-date-boundary-trap)
}

// Board-only review queue for payments the matcher (T2) couldn't auto-resolve
// — the "Peter case": full name matches an existing roster row, but the
// payer's email doesn't. An officer either confirms it's that member (renews
// the row + records the payer email as a new alias so it auto-matches next
// time) or flags it as a genuinely new member (appended as a fresh row).
export function PendingMatchQueue({ items }: { items: PendingMatchRow[] }) {
  if (items.length === 0) {
    return <EmptyState icon="✅">No payments waiting on review.</EmptyState>
  }
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <PendingMatchCard key={item.id} item={item} />
      ))}
    </div>
  )
}

function PendingMatchCard({ item }: { item: PendingMatchRow }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const candidate = item.candidates[0]

  function confirm(rowNumber: number) {
    setMsg(null)
    start(async () => {
      const r = await resolvePendingMatchAction(item.id, { kind: 'confirm', rowNumber, addAlias: item.email })
      if (r.ok) {
        setDone(true)
      } else {
        setMsg(r.reason ?? 'Failed.')
      }
    })
  }

  function markNew() {
    setMsg(null)
    start(async () => {
      const r = await resolvePendingMatchAction(item.id, { kind: 'new' })
      if (r.ok) {
        setDone(true)
      } else {
        setMsg(r.reason ?? 'Failed.')
      }
    })
  }

  if (done) {
    return (
      <div className="rounded-xl border p-4 text-sm text-foreground/50" style={{ borderColor: '#242424', background: '#191919' }}>
        Resolved ✓ — {item.name} (${item.amount})
      </div>
    )
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: '#242424', background: '#191919' }}>
      <p className="text-sm text-foreground/85">
        <span className="font-semibold">${item.amount}</span> from{' '}
        <span className="text-foreground/70">{item.email}</span>
        {item.name && <> ({item.name})</>}
        {candidate && (
          <>
            {' '}— looks like <span className="font-semibold">{candidate.name ?? `row ${candidate.rowNumber}`}</span>?
          </>
        )}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {item.candidates.map((c) => (
          <button
            key={c.rowNumber}
            type="button"
            disabled={pending}
            onClick={() => confirm(c.rowNumber)}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-40"
            style={{ borderColor: '#3a3a3a', color: '#0ca30c' }}
          >
            Confirm renewal{item.candidates.length > 1 ? ` (${c.name ?? c.rowNumber})` : ''}
          </button>
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={markNew}
          className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-40"
          style={{ borderColor: '#3a3a3a', color: '#898781' }}
        >
          It&apos;s someone new
        </button>
      </div>

      {msg && <p className="mt-2 text-xs text-red-400">{msg}</p>}
      <p className="mt-2 text-[11px] text-foreground/35">Queued {item.createdAt.slice(0, 10)}</p>
    </div>
  )
}
