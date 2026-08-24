'use client'

import { useState, useTransition } from 'react'
import { setLapseReason } from '@/app/members/admin/membership/_actions'
import { LAPSE_REASONS } from '@/lib/metrics/lapsed'
import type { LapsedMemberRow } from '@/lib/metrics/lapsed'

// Board-only editor: record WHY each lapsed/former member left. One row per
// member; edits save the two site-owned fields via the setLapseReason action.
// The page is already board-gated and the action re-checks server-side.

function ReasonSummary({ members }: { members: LapsedMemberRow[] }) {
  // Roll-up of recorded reasons — the payoff of filling these in. Members with
  // no reason yet are counted as "not recorded".
  const counts = new Map<string, number>()
  for (const m of members) {
    const key = m.lapseReason ?? 'not recorded'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const parts = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  return (
    <p className="text-xs text-foreground/50 mb-4">
      {parts.map(([reason, n], i) => (
        <span key={reason}>
          {i > 0 && ' · '}
          <span className="text-foreground/75">{n}</span> {reason}
        </span>
      ))}
    </p>
  )
}

function LapsedRow({ member }: { member: LapsedMemberRow }) {
  const [reason, setReason] = useState(member.lapseReason ?? '')
  const [note, setNote] = useState(member.lapseNote ?? '')
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dirty = the current inputs differ from what's persisted on the member.
  const dirty = reason !== (member.lapseReason ?? '') || note !== (member.lapseNote ?? '')

  function onSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await setLapseReason(member.id, reason, note)
      if (res.ok) {
        setSaved(true)
      } else {
        setError(res.error)
      }
    })
  }

  const tenure = member.tenureMonths != null ? `${member.tenureMonths} mo` : '—'

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: '#242424', background: '#191919' }}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <p className="font-semibold text-foreground">
          {member.name}
          {member.tier && <span className="text-foreground/45 font-normal"> · {member.tier}</span>}
        </p>
        <p className="text-xs text-foreground/45">
          {tenure} member{member.expires ? ` · left ${member.expires}` : ''}
          {member.state === 'former' && <span className="text-foreground/30"> · former</span>}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={isPending}
          className="rounded-lg border bg-[#141414] text-sm text-foreground px-2.5 py-1.5"
          style={{ borderColor: '#2c2c2c' }}
          aria-label={`Reason ${member.name} left`}
        >
          <option value="">— reason —</option>
          {LAPSE_REASONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={isPending}
          placeholder="note (optional)"
          maxLength={500}
          className="flex-1 min-w-[10rem] rounded-lg border bg-[#141414] text-sm text-foreground px-2.5 py-1.5 placeholder:text-foreground/30"
          style={{ borderColor: '#2c2c2c' }}
          aria-label={`Note about ${member.name}`}
        />

        <button
          type="button"
          onClick={onSave}
          disabled={isPending || !dirty}
          className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-opacity disabled:opacity-40"
          style={{ borderColor: '#3a3a3a', color: dirty ? '#ff9500' : '#898781' }}
        >
          {isPending ? 'Saving…' : dirty ? 'Save' : saved ? 'Saved ✓' : 'Saved'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  )
}

export function LapsedMembersEditor({ members }: { members: LapsedMemberRow[] }) {
  if (members.length === 0) {
    return (
      <div className="rounded-2xl border p-6 text-center text-sm text-foreground/50" style={{ borderColor: '#2c2c2c' }}>
        No lapsed members. 🎉
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl border p-4 md:p-6 bg-[linear-gradient(#1c1c1c,#161616)]"
      style={{ borderColor: '#2c2c2c' }}
    >
      <p className="text-xs text-foreground/55 mb-1">
        Record why each member left when you find out — reach out personally, then log it here. Builds the &ldquo;why they leave&rdquo; picture over time.
      </p>
      <ReasonSummary members={members} />
      <div className="grid gap-2.5">
        {members.map((m) => (
          <LapsedRow key={m.id} member={m} />
        ))}
      </div>
    </div>
  )
}
