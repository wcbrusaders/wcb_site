'use client'

import { useState, useTransition } from 'react'
import type { MemberHoldings, HistoryLoan } from '@/lib/lending'
import { boardReturnLoanAction, listMemberHistoryAction } from '@/app/members/_actions/lending-actions'

const CONDITIONS = ['New', 'Good', 'Fair', 'Poor', 'Damaged'] as const
const iso = (d: Date) => new Date(d).toISOString().slice(0, 10)

export function HoldingsMemberCard({ member }: { member: MemberHoldings }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [confirmingLoan, setConfirmingLoan] = useState<string | null>(null)
  const [cond, setCond] = useState<string>('Good')
  const [history, setHistory] = useState<HistoryLoan[] | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  function doReturn(loanId: string, isEquip: boolean) {
    setErr(null)
    start(async () => {
      const r = await boardReturnLoanAction(loanId, isEquip ? { conditionIn: cond as (typeof CONDITIONS)[number] } : undefined)
      if (!r.ok) setErr(r.reason === 'already_returned' ? 'Already returned — refresh.' : 'Could not return — refresh.')
      else setConfirmingLoan(null)
    })
  }

  function toggleHistory() {
    setErr(null)
    if (showHistory) { setShowHistory(false); return }
    if (history) { setShowHistory(true); return }
    start(async () => {
      try { setHistory(await listMemberHistoryAction(member.memberId)); setShowHistory(true) }
      catch { setErr('Could not load history.') }
    })
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card-bg/30 p-6 md:p-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="font-semibold">{member.name ?? 'Unknown member'}</p>
          {member.email
            ? <a href={`mailto:${member.email}`} className="text-accent/80 hover:text-accent text-sm">{member.email}</a>
            : <p className="text-foreground/40 text-sm">no email on file</p>}
        </div>
        <span className="text-sm text-foreground/60">
          {member.loans.length} item{member.loans.length === 1 ? '' : 's'}
          {member.overdueCount > 0 && <span className="ml-2 text-red-400">· {member.overdueCount} overdue</span>}
        </span>
      </div>

      <ul className="mt-4 space-y-2">
        {member.loans.map((l) => {
          const isEquip = l.category === 'equipment'
          return (
            <li key={l.loanId} className="rounded-lg border border-border/40 bg-background/40 px-4 py-2 text-sm">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span>
                  <span className="font-medium">{l.itemTitle}</span>
                  {l.copyLabel && <span className="text-foreground/50"> ({l.copyLabel})</span>}
                  <span className="ml-2 text-xs text-foreground/40 border border-border/40 rounded-full px-2 py-0.5">{l.category}</span>
                </span>
                <span className="text-foreground/60">
                  out {iso(l.checkedOutAt)} · due <span className={l.overdue ? 'text-red-400' : ''}>{iso(l.dueAt)}</span>
                </span>
              </div>
              {confirmingLoan === l.loanId ? (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="text-foreground/70">Return “{l.itemTitle}” for {member.name ?? 'this member'}?</span>
                  {isEquip && (
                    <select value={cond} onChange={(e) => setCond(e.target.value)} className="rounded-lg border border-border bg-background/60 px-2 py-1 text-sm">
                      {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                  <button disabled={pending} onClick={() => doReturn(l.loanId, isEquip)} className="bg-accent hover:bg-accent-hover text-background px-3 py-1 rounded-full text-sm disabled:opacity-50">Confirm return</button>
                  <button disabled={pending} onClick={() => setConfirmingLoan(null)} className="border border-border px-3 py-1 rounded-full text-sm">Cancel</button>
                </div>
              ) : (
                <button disabled={pending} onClick={() => { setCond('Good'); setConfirmingLoan(l.loanId) }} className="mt-2 border border-border px-3 py-1 rounded-full text-xs disabled:opacity-50">Mark returned</button>
              )}
            </li>
          )
        })}
      </ul>

      <button disabled={pending} onClick={toggleHistory} className="mt-4 text-sm text-foreground/50 hover:text-foreground disabled:opacity-50">
        {showHistory ? 'Hide past loans' : 'Show past loans'}
      </button>
      {showHistory && history && (
        history.length === 0
          ? <p className="mt-2 text-sm text-foreground/40">No past loans.</p>
          : <ul className="mt-2 space-y-1 text-sm text-foreground/60">
              {history.map((h) => (
                <li key={h.loanId}>
                  {h.itemTitle}{h.copyLabel ? ` (${h.copyLabel})` : ''} · {iso(h.checkedOutAt)} → {iso(h.returnedAt)}
                  {h.category === 'equipment' && h.conditionIn && <span className="ml-1 text-foreground/40">[{h.conditionIn}]</span>}
                </li>
              ))}
            </ul>
      )}
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
    </div>
  )
}
