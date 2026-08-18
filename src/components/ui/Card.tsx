import Link from 'next/link'
import type { CategoryVisual } from '@/lib/ui/category-visuals'

// Shared card surface for the members area (design "System B").
//
// - A left-accent stripe + soft depth + hover lift replace the flat gray box.
// - When `visual` is provided, the card is category-accented: the stripe takes
//   the category color and an icon chip appears. Without it, the card is a
//   neutral surface (amber accent on hover only).
// - Renders as an internal <Link>, external <a>, or a plain <div> depending on
//   which of href/external is given.
//
// This is presentational only — every caller has already done its own auth /
// audience filtering before choosing what to render.

export function Card({
  href,
  external,
  visual,
  className = '',
  children,
}: {
  href?: string
  external?: boolean
  visual?: CategoryVisual
  className?: string
  children: React.ReactNode
}) {
  const accent = visual?.color
  const base =
    'group block rounded-2xl border p-4 md:p-5 transition-all duration-150 ' +
    'bg-[linear-gradient(#1c1c1c,#161616)] ' +
    'hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)]'

  const style: React.CSSProperties = accent
    ? {
        borderColor: '#2c2c2c',
        borderLeft: `3px solid ${accent}`,
      }
    : { borderColor: 'color-mix(in srgb, var(--border) 70%, transparent)' }

  const inner = <div className={`${base} ${accent ? '' : 'hover:border-accent/40'} ${className}`} style={style}>{children}</div>

  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {inner}
      </a>
    )
  }
  if (href) {
    return <Link href={href}>{inner}</Link>
  }
  return inner
}

// The rounded icon chip tinted with the category color — used at the top of a
// category-accented card.
export function CardIcon({ visual }: { visual: CategoryVisual }) {
  return (
    <span
      aria-hidden
      className="w-8 h-8 rounded-lg grid place-items-center text-base mb-2.5"
      style={{ background: `color-mix(in srgb, ${visual.color} 20%, transparent)` }}
    >
      {visual.icon}
    </span>
  )
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <div className="font-semibold leading-snug">{children}</div>
}

export function CardMeta({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-foreground/50 mt-1">{children}</div>
}

export function CardBody({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-foreground/55 mt-1.5">{children}</p>
}
