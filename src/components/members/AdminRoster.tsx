'use client'
import { useState, useTransition } from 'react'
import { setSecondaryEmailAction, setPartnerAction } from '@/app/members/admin/_actions/admin-actions'
import { recordStrikeAction } from '@/app/members/admin/_actions/enforcement-actions'

const STRIKE_LEVELS: { label: string; value: string }[] = [
  { label: 'Correction', value: 'correction' },
  { label: 'Warning', value: 'warning' },
  { label: 'Board decides', value: 'board-decides' },
]

type Row = {
  id: string; name: string; email: string; googleEmail: string | null; tier: string | null
  current: boolean; isBoard: boolean; role: string | null; partnerEmail: string | null; expires: string | null
}

export function AdminRoster({ members }: { members: Row[] }) {
  return (
    <div className="mt-6 space-y-3">
      {members.map((m) => <MemberRow key={m.id} m={m} />)}
    </div>
  )
}

function MemberRow({ m }: { m: Row }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [secondary, setSecondary] = useState('')
  const [partner, setPartner] = useState('')
  const [strikeLevel, setStrikeLevel] = useState('correction')
  const [strikeReason, setStrikeReason] = useState('')

  function run(fn: () => Promise<{ ok: boolean; reason?: string }>, okMsg: string) {
    setMsg(null)
    start(async () => {
      const r = await fn()
      setMsg(r.ok ? okMsg : (r.reason ?? 'Failed.'))
    })
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card-bg/30 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-semibold">{m.name}</span>
        {m.isBoard && <span className="text-xs text-accent border border-accent/40 rounded-full px-2 py-0.5">{m.role ?? 'Board'}</span>}
        <span className={`text-xs ${m.current ? 'text-green-400' : 'text-foreground/40'}`}>{m.current ? 'current' : 'lapsed'}</span>
        {m.tier && <span className="text-xs text-foreground/50">{m.tier}</span>}
        {m.expires && <span className="text-xs text-foreground/40">expires {m.expires}</span>}
      </div>
      <p className="text-foreground/60 text-sm mt-1">{m.email}{m.googleEmail && ` · 2nd: ${m.googleEmail}`}{m.partnerEmail && ` · partner: ${m.partnerEmail}`}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input value={secondary} onChange={(e) => setSecondary(e.target.value)} placeholder="secondary email"
          className="rounded-lg border border-border bg-background/60 px-3 py-1 text-sm" />
        <button disabled={pending || !secondary} onClick={() => run(() => setSecondaryEmailAction(m.email, m.name, secondary), 'Secondary email saved.')}
          className="border border-border px-3 py-1 rounded-full text-sm disabled:opacity-50">Set 2nd email</button>
        <input value={partner} onChange={(e) => setPartner(e.target.value)} placeholder="partner email"
          className="rounded-lg border border-border bg-background/60 px-3 py-1 text-sm" />
        <button disabled={pending || !partner} onClick={() => run(() => setPartnerAction(m.email, m.name, partner), 'Partner linked.')}
          className="border border-border px-3 py-1 rounded-full text-sm disabled:opacity-50">Link partner</button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
        <select value={strikeLevel} onChange={(e) => setStrikeLevel(e.target.value)}
          className="rounded-lg border border-border bg-background/60 px-2 py-1 text-sm">
          {STRIKE_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <input value={strikeReason} onChange={(e) => setStrikeReason(e.target.value)} placeholder="reason"
          className="rounded-lg border border-border bg-background/60 px-3 py-1 text-sm" />
        <button disabled={pending || !strikeReason}
          onClick={() => run(async () => {
            const r = await recordStrikeAction(m.id, m.name, strikeLevel, strikeReason)
            if (r.ok) setStrikeReason('')
            return r
          }, 'Strike recorded.')}
          className="border border-accent/40 text-accent px-3 py-1 rounded-full text-sm disabled:opacity-50">Record strike</button>
      </div>
      {msg && <p className="mt-2 text-sm text-foreground/70">{msg}</p>}
    </div>
  )
}
