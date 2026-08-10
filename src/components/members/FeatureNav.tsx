const FEATURES = [
  { name: 'Book Library', desc: 'Browse and borrow the club library.' },
  { name: 'Equipment', desc: 'Check out shared brewing equipment.' },
  { name: 'Shop', desc: 'Member gear and club fundraisers.' },
]

export function FeatureNav() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {FEATURES.map((f) => (
        <div key={f.name} className="rounded-2xl border border-border/40 bg-card-bg/20 p-6 opacity-60">
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold">{f.name}</p>
            <span className="text-xs text-accent/70 border border-accent/30 rounded-full px-2 py-0.5">Coming soon</span>
          </div>
          <p className="text-foreground/50 text-sm">{f.desc}</p>
        </div>
      ))}
    </div>
  )
}
