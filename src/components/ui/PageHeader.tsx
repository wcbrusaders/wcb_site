import Link from 'next/link'

// Consistent page header across the members area: an amber eyebrow, a bold
// title, and an optional one-line lead. Replaces the ad-hoc
// "<h1> + <p>" blocks each page hand-rolled.
export function PageHeader({
  eyebrow,
  title,
  lead,
  back,
}: {
  eyebrow?: string
  title: string
  lead?: string
  back?: { href: string; label: string }
}) {
  return (
    <header className="mb-8">
      {back && (
        <Link href={back.href} className="text-sm text-foreground/50 hover:text-accent">
          ← {back.label}
        </Link>
      )}
      {eyebrow && (
        <p className={`text-accent font-semibold tracking-widest uppercase text-[11px] ${back ? 'mt-3' : ''}`}>
          {eyebrow}
        </p>
      )}
      <h1 className={`text-2xl md:text-3xl font-bold ${eyebrow ? 'mt-1' : back ? 'mt-3' : ''}`}>{title}</h1>
      {lead && <p className="text-foreground/55 mt-2 max-w-2xl">{lead}</p>}
    </header>
  )
}
