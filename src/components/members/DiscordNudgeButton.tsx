'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui'
import { sendDiscordNudgeAction } from '@/app/members/admin/membership/_actions'

// Board-only "Discord nudge" blast button for the membership admin page. The
// page itself is already board-gated (server component redirect); the action
// this calls re-checks board status server-side regardless. `unlinkedCount`
// is computed server-side (current + not-opted-out + not-yet-linked) and
// passed in purely for the button label — the actual send re-derives the
// live recipient list itself rather than trusting this prop.
export function DiscordNudgeButton({ unlinkedCount }: { unlinkedCount: number }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<
    | { ok: true; sent: number; skippedOptOut: number; skippedLinked: number; linkTableRead: 'ok' | 'failed' }
    | { ok: false; reason: string }
    | null
  >(null)

  function onSend() {
    setResult(null)
    startTransition(async () => {
      const r = await sendDiscordNudgeAction()
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
            <span aria-hidden>💬</span> Discord join/link nudge
          </p>
          <p className="mt-1 text-sm text-foreground/60">
            {unlinkedCount} current member{unlinkedCount === 1 ? '' : 's'} not yet linked to Discord.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onSend} disabled={isPending || unlinkedCount === 0}>
          {isPending ? 'Sending…' : `Send Discord nudge (${unlinkedCount})`}
        </Button>
      </div>

      {result && (
        <div className="mt-4 text-sm">
          {result.ok ? (
            <>
              <p className="text-foreground/85">
                Sent {result.sent} · skipped {result.skippedOptOut} opted-out · skipped {result.skippedLinked} already-linked
              </p>
              {result.linkTableRead === 'failed' && (
                <p className="mt-1 text-amber-400">
                  Discord link table read failed — treated everyone as unlinked (may have over-nudged already-linked members).
                </p>
              )}
            </>
          ) : (
            <p className="text-red-400">Failed: {result.reason}</p>
          )}
        </div>
      )}

      <p className="mt-4 text-[11px] text-foreground/40">
        Emails every current, unlinked, not-opted-out member · board-only
      </p>
    </div>
  )
}
