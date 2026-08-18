// A labelled key/value card for the members dashboard. Uses the System-B
// surface (soft gradient + depth) with an amber section label.
export function InfoCard({
  title,
  icon,
  children,
}: {
  title: string
  icon?: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-2xl border p-5 md:p-6 bg-[linear-gradient(#1c1c1c,#161616)]"
      style={{ borderColor: '#2c2c2c' }}
    >
      <p className="text-accent font-semibold tracking-widest uppercase text-[11px] mb-4 flex items-center gap-2">
        {icon && <span aria-hidden>{icon}</span>}
        {title}
      </p>
      <dl className="space-y-2">{children}</dl>
    </div>
  )
}

export function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null // graceful blank: hide the line entirely
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-foreground/50">{label}</dt>
      <dd className="text-foreground text-right">{value}</dd>
    </div>
  )
}
