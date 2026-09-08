'use client'

import { useState, useTransition } from 'react'
import { completePartnerAction } from '@/app/members/admin/membership/_actions'
import { EmptyState } from '@/components/ui'

export type PartnerPlaceholderRow = {
  rowNumber: number
  tier: string | null
}

// Board-only completion form for a Couple/Dual membership's second person.
// The primary member already paid for the Dual tier; the roster carries a
// placeholder row (blank Name/Email Address) until someone tells us who the
// partner actually is. Filling this in writes those two cells and sends the
// partner their own welcome email.
export function PartnerComplete({ placeholders }: { placeholders: PartnerPlaceholderRow[] }) {
  if (placeholders.length === 0) {
    return <EmptyState icon="💑">No partner rows waiting on a name.</EmptyState>
  }
  return (
    <div className="grid gap-3">
      {placeholders.map((p) => (
        <PartnerRow key={p.rowNumber} placeholder={p} />
      ))}
    </div>
  )
}

function PartnerRow({ placeholder }: { placeholder: PartnerPlaceholderRow }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function save() {
    setMsg(null)
    start(async () => {
      const r = await completePartnerAction(placeholder.rowNumber, name, email)
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
        Added {name} ✓ — welcome email sent.
      </div>
    )
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: '#242424', background: '#191919' }}>
      <p className="text-sm text-foreground/70 mb-3">
        {placeholder.tier ?? 'Dual'} membership row {placeholder.rowNumber} — who&apos;s the partner?
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
          placeholder="Partner's name"
          className="flex-1 min-w-[10rem] rounded-lg border bg-[#141414] text-sm text-foreground px-2.5 py-1.5 placeholder:text-foreground/30"
          style={{ borderColor: '#2c2c2c' }}
          aria-label="Partner's name"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
          placeholder="Partner's email"
          className="flex-1 min-w-[12rem] rounded-lg border bg-[#141414] text-sm text-foreground px-2.5 py-1.5 placeholder:text-foreground/30"
          style={{ borderColor: '#2c2c2c' }}
          aria-label="Partner's email"
        />
        <button
          type="button"
          disabled={pending || !name.trim() || !email.trim()}
          onClick={save}
          className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-40"
          style={{ borderColor: '#3a3a3a', color: '#ff9500' }}
        >
          {pending ? 'Saving…' : 'Add partner + send welcome'}
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-red-400">{msg}</p>}
    </div>
  )
}
