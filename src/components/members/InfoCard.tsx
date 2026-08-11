export function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card-bg/30 p-6 md:p-8">
      <p className="text-accent font-medium tracking-wide uppercase text-sm mb-4">{title}</p>
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
