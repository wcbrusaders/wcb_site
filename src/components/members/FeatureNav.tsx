import Link from 'next/link'

const LIVE = [
  { name: 'Book Library', desc: 'Browse and borrow the club library.', href: '/members/library' },
  { name: 'Equipment', desc: 'Check out shared brewing equipment.', href: '/members/equipment' },
]

export function FeatureNav() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {LIVE.map((f) => (
        <Link key={f.name} href={f.href} className="rounded-2xl border border-border/40 bg-card-bg/20 p-6 hover:bg-card-bg/40 transition-colors">
          <p className="font-semibold mb-2">{f.name}</p>
          <p className="text-foreground/50 text-sm">{f.desc}</p>
        </Link>
      ))}
      <div className="rounded-2xl border border-border/40 bg-card-bg/20 p-6 opacity-60">
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold">Shop</p>
          <span className="text-xs text-accent/70 border border-accent/30 rounded-full px-2 py-0.5">Coming soon</span>
        </div>
        <p className="text-foreground/50 text-sm">Member gear and club fundraisers.</p>
      </div>
    </div>
  )
}
