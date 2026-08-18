'use client'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { useCallback } from 'react'

// WYSIWYG editor for the meeting-notes review queue. Officers edit formatted
// text (never HTML tags); output is HTML that the publish action re-sanitizes
// to the article allowlist (h2/h3/p/ul/li/strong/em/a). Structure matches what
// the notes actually contain — headings, bold/italic, bullet lists, links.
export function RichTextEditor({
  initialHtml,
  onChange,
}: {
  initialHtml: string
  onChange: (html: string) => void
}) {
  const editor = useEditor({
    immediatelyRender: false, // avoid SSR hydration mismatch in Next
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({ openOnClick: false, autolink: false }),
    ],
    content: initialHtml || '<p></p>',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          'min-h-[200px] rounded-b-lg border border-t-0 border-border bg-background/60 px-3 py-2 outline-none ' +
          '[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1 ' +
          '[&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 ' +
          '[&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_li]:my-0.5 ' +
          '[&_a]:text-accent [&_a]:underline [&_strong]:font-semibold [&_em]:italic',
      },
    },
  })

  if (!editor) return null
  return (
    <div>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const setLink = useCallback(() => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link URL', prev ?? 'https://')
    if (url === null) return // cancelled
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  const Btn = ({ on, active, label }: { on: () => void; active?: boolean; label: string }) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); on() }}
      className={`px-2 py-1 text-xs rounded border ${active ? 'border-accent text-accent bg-accent/10' : 'border-border text-foreground/70'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-wrap gap-1 rounded-t-lg border border-border bg-background/40 px-2 py-1.5">
      <Btn label="H2" active={editor.isActive('heading', { level: 2 })} on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <Btn label="H3" active={editor.isActive('heading', { level: 3 })} on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
      <Btn label="Bold" active={editor.isActive('bold')} on={() => editor.chain().focus().toggleBold().run()} />
      <Btn label="Italic" active={editor.isActive('italic')} on={() => editor.chain().focus().toggleItalic().run()} />
      <Btn label="• List" active={editor.isActive('bulletList')} on={() => editor.chain().focus().toggleBulletList().run()} />
      <Btn label="Link" active={editor.isActive('link')} on={setLink} />
    </div>
  )
}
