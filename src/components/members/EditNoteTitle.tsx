'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { editArticleTitleAction } from '@/app/members/admin/knowledge/_actions'

// Board-only inline title editor for a published meeting note. Fixes a note
// whose title came out wrong (e.g. an AI title on a pre-carry-through note).
// Editing the title re-slugs the note, so on success we navigate to the new URL.
export function EditNoteTitle({ articleId, currentTitle }: { articleId: string; currentTitle: string }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(currentTitle)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function save() {
    setMsg(null)
    start(async () => {
      const r = await editArticleTitleAction(articleId, title)
      if (r.ok && r.slug) {
        setEditing(false)
        router.replace(`/members/resources/notes/${r.slug}`)
        router.refresh()
      } else {
        setMsg(r.reason ?? 'Failed to save.')
      }
    })
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setTitle(currentTitle); setEditing(true); setMsg(null) }}
        className="text-xs text-foreground/40 hover:text-accent border border-border/40 rounded-full px-2.5 py-0.5 mt-2"
      >
        ✎ Edit title
      </button>
    )
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        name="note-title"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        aria-label="Note title"
        className="flex-1 min-w-[240px] bg-transparent border-b border-accent/50 focus:border-accent outline-none text-lg font-semibold"
      />
      <button
        onClick={save}
        disabled={pending || !title.trim() || title.trim() === currentTitle}
        className="border border-green-500/60 text-green-400 px-3 py-1 rounded-full text-sm disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
      <button onClick={() => { setEditing(false); setMsg(null) }} disabled={pending} className="text-foreground/50 hover:text-foreground px-3 py-1 rounded-full border border-border/50 text-sm">
        Cancel
      </button>
      {msg && <span className="text-sm text-red-400 w-full">{msg}</span>}
    </div>
  )
}
