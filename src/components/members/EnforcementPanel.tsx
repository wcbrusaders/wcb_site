'use client'
import { useState, useTransition } from 'react'
import {
  interimFreezeAction,
  openRemovalCaseAction,
  castVoteAction,
  executeRemovalAction,
  liftCaseAction,
} from '@/app/members/admin/_actions/enforcement-actions'

type VoteValue = 'approve' | 'reject' | 'abstain'

type Tally = {
  cast: number; approve: number; reject: number; abstain: number
  quorumMet: boolean; twoThirdsMet: boolean; passes: boolean
}

type CaseView = {
  id: string; kind: string; subjectLabel: string; subjectMemberId: string
  eligibleBoardCount: number; decisionDueAt: string
  expired: boolean; tally: Tally; myVote: string | null
}

type MemberOption = { id: string; name: string; status: string }

export function EnforcementPanel({ cases, members }: { cases: CaseView[]; members: MemberOption[] }) {
  return (
    <div className="mt-6 space-y-8">
      <OpenCaseForm members={members} />
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Open cases</h2>
        {cases.length === 0 && <p className="text-foreground/50 text-sm">No open cases.</p>}
        {cases.map((c) => <CaseRow key={c.id} c={c} />)}
      </div>
    </div>
  )
}

function CaseRow({ c }: { c: CaseView }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function run(fn: () => Promise<{ ok: boolean; reason?: string }>, okMsg: string) {
    setMsg(null)
    start(async () => {
      const r = await fn()
      setMsg(r.ok ? okMsg : (r.reason ?? 'Failed.'))
    })
  }

  const { tally } = c
  const dueDate = new Date(c.decisionDueAt)

  return (
    <div className="rounded-xl border border-border/50 bg-card-bg/30 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-semibold">{c.subjectLabel}</span>
        <span className="text-xs text-accent border border-accent/40 rounded-full px-2 py-0.5">{c.kind}</span>
        <span className={`text-xs ${c.expired ? 'text-red-400' : 'text-foreground/40'}`}>
          due {dueDate.toISOString().slice(0, 10)}{c.expired ? ' (expired)' : ''}
        </span>
      </div>

      <p className="text-foreground/60 text-sm mt-2">
        Votes: {tally.cast} cast ({tally.approve} approve / {tally.reject} reject / {tally.abstain} abstain) of {c.eligibleBoardCount} eligible.{' '}
        Quorum {tally.quorumMet ? 'met' : 'not met'}, two-thirds {tally.twoThirdsMet ? 'met' : 'not met'}.
      </p>
      <p className={`text-sm mt-1 font-semibold ${tally.passes ? 'text-green-400' : 'text-foreground/40'}`}>
        {tally.passes ? 'Vote passes' : 'Vote does not pass yet'}
      </p>
      {c.myVote && <p className="text-foreground/50 text-xs mt-1">Your vote: {c.myVote}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={pending} onClick={() => run(() => castVoteAction(c.id, 'approve'), 'Vote recorded: approve.')}
          className="border border-border px-3 py-1 rounded-full text-sm disabled:opacity-50">Approve</button>
        <button disabled={pending} onClick={() => run(() => castVoteAction(c.id, 'reject'), 'Vote recorded: reject.')}
          className="border border-border px-3 py-1 rounded-full text-sm disabled:opacity-50">Reject</button>
        <button disabled={pending} onClick={() => run(() => castVoteAction(c.id, 'abstain'), 'Vote recorded: abstain.')}
          className="border border-border px-3 py-1 rounded-full text-sm disabled:opacity-50">Abstain</button>
        <button disabled={pending || !tally.passes} onClick={() => run(() => executeRemovalAction(c.id), 'Removal executed.')}
          className="border border-red-500/60 text-red-400 px-3 py-1 rounded-full text-sm disabled:opacity-50">Execute removal</button>
        <button disabled={pending} onClick={() => run(() => liftCaseAction(c.id), 'Case lifted.')}
          className="border border-border px-3 py-1 rounded-full text-sm disabled:opacity-50">Lift</button>
      </div>
      {msg && <p className="mt-2 text-sm text-foreground/70">{msg}</p>}
    </div>
  )
}

function OpenCaseForm({ members }: { members: MemberOption[] }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [memberId, setMemberId] = useState('')
  const [reason, setReason] = useState('')

  const selected = members.find((m) => m.id === memberId)

  function run(fn: () => Promise<{ ok: boolean; reason?: string; caseId?: string }>, okMsg: string) {
    setMsg(null)
    start(async () => {
      const r = await fn()
      setMsg(r.ok ? okMsg : (r.reason ?? 'Failed.'))
    })
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card-bg/30 p-4">
      <h2 className="text-lg font-semibold">Open a case</h2>
      <p className="text-foreground/50 text-sm mt-1">Select a member, then interim-freeze (immediate) or open a removal vote.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)}
          className="rounded-lg border border-border bg-background/60 px-3 py-1 text-sm">
          <option value="">Select member...</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.status})</option>)}
        </select>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reason (for interim freeze)"
          className="rounded-lg border border-border bg-background/60 px-3 py-1 text-sm flex-1 min-w-[200px]" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          disabled={pending || !memberId || !reason}
          onClick={() => selected && run(
            () => interimFreezeAction(selected.id, selected.name, reason),
            `Interim freeze applied to ${selected.name}.`,
          )}
          className="border border-amber-500/60 text-amber-400 px-3 py-1 rounded-full text-sm disabled:opacity-50"
        >
          Interim freeze
        </button>
        <button
          disabled={pending || !memberId}
          onClick={() => selected && run(
            () => openRemovalCaseAction(selected.id, selected.name, []),
            `Removal vote opened for ${selected.name}.`,
          )}
          className="border border-red-500/60 text-red-400 px-3 py-1 rounded-full text-sm disabled:opacity-50"
        >
          Open removal vote
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-foreground/70">{msg}</p>}
      <p className="text-foreground/40 text-xs mt-2">
        Note: it isn&apos;t possible to recuse specific board members from this form yet — removal votes include all board members except the subject.
      </p>
    </div>
  )
}
