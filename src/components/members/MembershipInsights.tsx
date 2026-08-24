'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui'
import { generateInsightsAction } from '@/app/members/admin/membership/_actions'

// Board-only "Generate insights" button for the membership reports page. The
// page itself is already board-gated (server component redirect); the action
// this calls re-checks board status server-side regardless, so this button
// is safe even if somehow rendered without the page's own gate. On-demand:
// no AI cost until clicked.
export function MembershipInsights() {
  const [isPending, startTransition] = useTransition()
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function onGenerate() {
    setError(null)
    startTransition(async () => {
      const result = await generateInsightsAction()
      if (result.ok) {
        setText(result.text)
      } else {
        // Keep any prior insight on screen; surface the error separately rather
        // than wiping the panel back to a blank "Generate insights" state.
        setError(result.error)
      }
    })
  }

  return (
    <div
      className="rounded-2xl border p-5 md:p-6 bg-[linear-gradient(#1c1c1c,#161616)]"
      style={{ borderColor: '#2c2c2c' }}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-accent font-semibold tracking-widest uppercase text-[11px] flex items-center gap-2">
          <span aria-hidden>✨</span> AI insights
        </p>
        <Button variant="secondary" size="sm" onClick={onGenerate} disabled={isPending}>
          {isPending ? 'Generating…' : text ? 'Regenerate insights' : 'Generate insights'}
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {text && (
        <p className="mt-4 text-sm text-foreground/85 whitespace-pre-wrap leading-relaxed">{text}</p>
      )}

      <p className="mt-4 text-[11px] text-foreground/40">Uses AI · on-demand · board-only</p>
    </div>
  )
}
