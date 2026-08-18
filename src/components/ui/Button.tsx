import Link from 'next/link'

// Shared pill button (design "System B"). Replaces the primary/secondary/ghost
// pill buttons hand-rolled across the members components.
//
//   primary   — accent-filled, for the main action
//   secondary — bordered pill, for secondary actions
//   ghost     — text-only, for low-emphasis actions
//
// Renders as a real <button> by default; pass `href` to render a <Link>
// (internal) or <a> (external) styled identically.

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent hover:bg-accent-hover text-background font-medium disabled:opacity-50',
  secondary:
    'border border-border/60 text-foreground/80 hover:text-foreground hover:border-accent/50 disabled:opacity-50',
  ghost: 'text-foreground/60 hover:text-foreground disabled:opacity-50',
}

const SIZE: Record<Size, string> = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-5 py-2 text-sm',
}

function classesFor(variant: Variant, size: Size, className: string) {
  return `inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors ${VARIANT[variant]} ${SIZE[size]} ${className}`
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  return <button className={classesFor(variant, size, className)} {...props} />
}

export function ButtonLink({
  href,
  external,
  variant = 'primary',
  size = 'md',
  className = '',
  children,
}: {
  href: string
  external?: boolean
  variant?: Variant
  size?: Size
  className?: string
  children: React.ReactNode
}) {
  const cls = classesFor(variant, size, className)
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  )
}
