import type { ReactNode } from 'react'
import { PageHeader } from '@/components/ui'

const DEST = {
  site: { icon: '🌐', label: 'On the site' },
  discord: { icon: '💬', label: 'In Discord' },
  academy: { icon: '🎓', label: 'Brusaders Academy' },
} as const

export function DestTag({ kind }: { kind: keyof typeof DEST }) {
  const d = DEST[kind]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs text-foreground/70">
      <span aria-hidden>{d.icon}</span> {d.label}
    </span>
  )
}

export function GuideTodo({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 rounded-xl border border-amber-400/40 bg-amber-400/[0.06] p-3.5 text-sm">
      <span className="font-semibold text-amber-300">Check with the board:</span> {children}
    </div>
  )
}

export function GuidePage({
  title,
  dest,
  children,
}: {
  title: string
  dest?: keyof typeof DEST
  children: ReactNode
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <PageHeader back={{ href: '/members/resources', label: 'Resources' }} title={title} />
      {dest && <div className="-mt-4 mb-6"><DestTag kind={dest} /></div>}
      <div
        className="max-w-none [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:my-3 [&_p]:text-foreground/80 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-3 [&_ul]:text-foreground/80 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-3 [&_ol]:text-foreground/80 [&_li]:my-1 [&_a]:text-accent [&_a:hover]:underline [&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic [&_code]:rounded [&_code]:border [&_code]:border-border [&_code]:bg-card-bg [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_hr]:my-6 [&_hr]:border-border"
      >
        {children}
      </div>
    </div>
  )
}
