'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui'
import { sendSampleEmailsAction } from '@/app/members/admin/membership/_actions'

// Board-only button that emails every membership email (rendered with sample
// data) to club@wcbrusaders.com so the board can review the real rendered copy
// in an inbox. Writes nothing to the roster; sends only to the club address.
// The page is already board-gated; the action re-checks server-side.
export function SendSampleEmailsButton() {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<
    | { ok: true; sent: number; to: string }
    | { ok: false; reason: string }
    | null
  >(null)

  function onSend() {
    startTransition(async () => {
      const r = await sendSampleEmailsAction()
      setResult(r)
    })
  }

  return (
    <div
      className="rounded-2xl border p-5 md:p-6 bg-[linear-gradient(#1c1c1c,#161616)]"
      style={{ borderColor: '#2c2c2c' }}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-accent font-semibold tracking-widest uppercase text-[11px] flex items-center gap-2">
            <span aria-hidden>✉️</span> Email preview
          </p>
          <p className="text-sm text-foreground/60 mt-1">
            Sends one of each membership email (welcome, renewal, reminders, re-engagement, Discord nudge) to
            <span className="text-foreground/80"> club@wcbrusaders.com</span> for copy review. Sends nothing to members.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onSend} disabled={isPending}>
          {isPending ? 'Sending…' : 'Send samples to club@'}
        </Button>
      </div>

      {result?.ok && (
        <p className="mt-3 text-sm text-[#4ade80]">✓ Sent {result.sent} sample emails to {result.to}. Check the inbox.</p>
      )}
      {result && !result.ok && (
        <p className="mt-3 text-sm text-red-400">Couldn&apos;t send: {result.reason}</p>
      )}
    </div>
  )
}
