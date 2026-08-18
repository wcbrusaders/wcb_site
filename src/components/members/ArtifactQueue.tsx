'use client'

import { useState, useTransition } from 'react'
import {
  publishArtifactAction,
  rejectArtifactAction,
  reprocessArtifactAction,
} from '@/app/members/admin/knowledge/_artifact-actions'
import { ARTIFACT_CATEGORIES } from '@/lib/artifacts/categories'

export type ArtifactDraftRow = {
  id: string
  sourceName: string
  blobUrl: string
  mimeType: string
  thumbnailUrl: string | null
  suggestedCategory: string | null
  status: string
  errorText: string | null
}

export function ArtifactQueue({ artifacts }: { artifacts: ArtifactDraftRow[] }) {
  const needsReview = artifacts.filter((a) => a.status === 'needs_review')
  const errored = artifacts.filter((a) => a.status === 'error')

  return (
    <div className="mt-6 space-y-8">
      <div className="space-y-4">
        {needsReview.length === 0 && errored.length === 0 && (
          <p className="text-foreground/50 text-sm">Nothing waiting on review.</p>
        )}
        {needsReview.map((a) => (
          <ArtifactReviewRow key={a.id} artifact={a} />
        ))}
        {errored.map((a) => (
          <ArtifactErrorRow key={a.id} artifact={a} />
        ))}
      </div>
    </div>
  )
}

function filetypeLabel(mimeType: string): string {
  if (mimeType.startsWith('image/')) return mimeType.replace('image/', '').toUpperCase()
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType.includes('presentation')) return 'Slides'
  if (mimeType.includes('spreadsheet')) return 'Sheet'
  if (mimeType.includes('word') || mimeType.includes('document')) return 'Doc'
  return mimeType
}

function ArtifactReviewRow({ artifact }: { artifact: ArtifactDraftRow }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [title, setTitle] = useState(artifact.sourceName)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(artifact.suggestedCategory ?? '')
  const [audience, setAudience] = useState('')

  const canPublish = Boolean(title && category && audience)

  function publish() {
    setMsg(null)
    start(async () => {
      const r = await publishArtifactAction(artifact.id, { title, description, category, audience })
      setMsg(r.ok ? 'Published.' : (r.reason ?? 'Failed.'))
    })
  }

  function reject() {
    setMsg(null)
    start(async () => {
      const r = await rejectArtifactAction(artifact.id)
      setMsg(r.ok ? 'Rejected.' : (r.reason ?? 'Failed.'))
    })
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card-bg/30 p-4">
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          {artifact.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={artifact.thumbnailUrl}
              alt=""
              className="w-16 h-16 object-cover rounded-lg border border-border/40"
            />
          ) : (
            <div className="w-16 h-16 flex items-center justify-center rounded-lg border border-border/40 text-xs font-medium text-foreground/50 text-center px-1">
              {filetypeLabel(artifact.mimeType)}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-xs text-foreground/45">
            {artifact.sourceName} &middot; {artifact.mimeType}
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            name="artifact-title"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            aria-label="Artifact title"
            className="mt-1 font-semibold bg-transparent border-b border-border/40 focus:border-accent/60 outline-none w-full"
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            name="artifact-description"
            aria-label="Artifact description"
            placeholder="Description (optional)"
            rows={2}
            className="mt-2 w-full bg-transparent border border-border/40 focus:border-accent/60 outline-none rounded-lg px-2 py-1 text-sm resize-y"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Artifact category"
              className="bg-transparent border border-border/40 focus:border-accent/60 outline-none rounded-full px-3 py-1 text-sm"
            >
              <option value="" disabled>
                — pick category —
              </option>
              {ARTIFACT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              aria-label="Artifact audience"
              className="bg-transparent border border-border/40 focus:border-accent/60 outline-none rounded-full px-3 py-1 text-sm"
            >
              <option value="" disabled>
                — pick audience —
              </option>
              <option value="members">All members</option>
              <option value="officers">Officers only</option>
            </select>

            <button
              disabled={pending || !canPublish}
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
      </div>
    </div>
  )
}

function ArtifactErrorRow({ artifact }: { artifact: ArtifactDraftRow }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function reprocess() {
    setMsg(null)
    start(async () => {
      const r = await reprocessArtifactAction(artifact.id)
      setMsg(r.ok ? 'Queued for re-processing.' : (r.reason ?? 'Failed.'))
    })
  }

  return (
    <div className="rounded-xl border border-red-500/30 bg-card-bg/30 p-4">
      <div className="font-semibold">{artifact.sourceName}</div>
      {artifact.errorText && <p className="text-red-400/80 text-sm mt-1 whitespace-pre-wrap">{artifact.errorText}</p>}
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
