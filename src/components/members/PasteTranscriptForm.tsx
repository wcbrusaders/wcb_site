'use client'

import { useState, useTransition } from 'react'
import { ingestTranscriptAction } from '@/app/members/admin/knowledge/_actions'
import { Button, Input, Textarea, Field } from '@/components/ui'

// Board-only: paste a raw meeting transcript (no Google Doc needed). Creates a
// needs_processing draft and runs the AI extractor, so it lands in the review
// queue below. Collapsed by default to keep the queue the focus.
export function PasteTranscriptForm() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    setMsg(null)
    start(async () => {
      const r = await ingestTranscriptAction(title, text)
      if (r.ok) {
        setTitle('')
        setText('')
        setMsg('✓ Ingested — processing now; it will appear in the review queue below.')
        setOpen(false)
      } else {
        setMsg(r.reason ?? 'Ingest failed.')
      }
    })
  }

  if (!open) {
    return (
      <div className="mb-2">
        <Button variant="secondary" onClick={() => { setOpen(true); setMsg(null) }}>
          ＋ Paste a transcript
        </Button>
        {msg && <p className="text-sm text-foreground/60 mt-2">{msg}</p>}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border p-4 md:p-5 mb-4 bg-[linear-gradient(#1c1c1c,#161616)]" style={{ borderColor: '#2c2c2c' }}>
      <p className="font-semibold mb-3">Paste a meeting transcript</p>
      <div className="space-y-3">
        <Field label="Title">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="WCB Monthly Meeting Notes — Aug 20, 2026"
            autoComplete="off"
          />
        </Field>
        <Field label="Raw transcript">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the full raw transcript here — the AI will turn it into a clean note for review."
            rows={10}
          />
        </Field>
        <p className="text-[11px] text-foreground/45">
          The transcript is processed by AI into a structured note, then waits here for your review before anything
          publishes. Include the date in the title so notes sort correctly.
        </p>
        <div className="flex gap-2 items-center">
          <Button onClick={submit} disabled={pending || !title.trim() || !text.trim()}>
            {pending ? 'Ingesting…' : 'Ingest & process'}
          </Button>
          <Button variant="ghost" onClick={() => { setOpen(false); setMsg(null) }} disabled={pending}>
            Cancel
          </Button>
        </div>
        {msg && <p className="text-sm text-foreground/70">{msg}</p>}
      </div>
    </div>
  )
}
