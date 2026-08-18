'use client'

import { useState, useTransition } from 'react'
import { publishDraftAction, rejectDraftAction, reprocessDraftAction } from '@/app/members/admin/knowledge/_actions'
import { RichTextEditor } from '@/components/members/RichTextEditor'

export type InReviewDraft = {
  id: string
  processedTitle: string | null
  processedHtml: string | null
  excerpt: string | null
  meetingDate: string | null // ISO date string (RSC boundary — see wcb-rsc-date-boundary-trap)
}

export type ErrorDraft = {
  id: string
  sourceName: string
  errorText: string | null
}

export function KnowledgeQueue({ inReview, errored }: { inReview: InReviewDraft[]; errored: ErrorDraft[] }) {
  return (
    <div className="mt-6 space-y-8">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Awaiting review ({inReview.length})</h2>
        {inReview.length === 0 && <p className="text-foreground/50 text-sm">Nothing waiting on review.</p>}
        {inReview.map((d) => <ReviewRow key={d.id} draft={d} />)}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Failed processing ({errored.length})</h2>
        {errored.length === 0 && <p className="text-foreground/50 text-sm">No processing errors.</p>}
        {errored.map((d) => <ErrorRow key={d.id} draft={d} />)}
      </div>
    </div>
  )
}

function ReviewRow({ draft }: { draft: InReviewDraft }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [title, setTitle] = useState(draft.processedTitle ?? '')
  const [html, setHtml] = useState(draft.processedHtml ?? '')

  function publish() {
    setMsg(null)
    start(async () => {
      const r = await publishDraftAction(draft.id, html, title)
      setMsg(r.ok ? 'Published.' : (r.reason ?? 'Failed.'))
    })
  }

  function reject() {
    setMsg(null)
    start(async () => {
      const r = await rejectDraftAction(draft.id)
      setMsg(r.ok ? 'Rejected.' : (r.reason ?? 'Failed.'))
    })
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card-bg/30 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="font-semibold bg-transparent border-b border-border/40 focus:border-accent/60 outline-none flex-1 min-w-[200px]"
        />
        {draft.meetingDate && (
          <span className="text-xs text-foreground/40">meeting {draft.meetingDate.slice(0, 10)}</span>
        )}
      </div>
      {draft.excerpt && <p className="text-foreground/55 text-sm mt-2">{draft.excerpt}</p>}

      <div className="mt-3">
        <span className="text-xs uppercase tracking-wide text-foreground/45">Note (edit as needed before publishing)</span>
        <div className="mt-1">
          <RichTextEditor initialHtml={draft.processedHtml ?? ''} onChange={setHtml} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          disabled={pending || !title || !html}
          onClick={publish}
          className="border border-green-500/60 text-green-400 px-3 py-1 rounded-full text-sm disabled:opacity-50"
        >
          Publish
        </button>
        <button
          disabled={pending}
          onClick={reject}
          className="border border-red-500/60 text-red-400 px-3 py-1 rounded-full text-sm disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-foreground/70">{msg}</p>}
    </div>
  )
}

function ErrorRow({ draft }: { draft: ErrorDraft }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function reprocess() {
    setMsg(null)
    start(async () => {
      const r = await reprocessDraftAction(draft.id)
      setMsg(r.ok ? 'Queued for re-processing.' : (r.reason ?? 'Failed.'))
    })
  }

  return (
    <div className="rounded-xl border border-red-500/30 bg-card-bg/30 p-4">
      <div className="font-semibold">{draft.sourceName}</div>
      {draft.errorText && <p className="text-red-400/80 text-sm mt-1 whitespace-pre-wrap">{draft.errorText}</p>}
      <div className="mt-3">
        <button
          disabled={pending}
          onClick={reprocess}
          className="border border-accent/40 text-accent px-3 py-1 rounded-full text-sm disabled:opacity-50"
        >
          Re-process
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-foreground/70">{msg}</p>}
    </div>
  )
}
