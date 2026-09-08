const DAY = 86400000
const TIERS: { name: 'Single' | 'Couple'; amount: number }[] = [
  { name: 'Single', amount: 40 },
  { name: 'Couple', amount: 65 },
]

export function tierFromAmount(amount: number): 'Single' | 'Couple' | null {
  for (const t of TIERS) if (Math.abs(amount - t.amount) < 0.01) return t.name
  return null
}

function fmt(d: Date): string {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`
}
function parse(s: string): Date | null {
  const p = s.split('/')
  if (p.length !== 3) return null
  const [mo, da, yr] = p.map((x) => parseInt(x, 10))
  if (!mo || !da || !yr) return null
  return new Date(Date.UTC(yr, mo - 1, da))
}

export function computeExpiration(currentExpires: string | null, now: Date): { expires: string; daysCredited: number } {
  let credited = 0
  if (currentExpires) {
    const cur = parse(currentExpires)
    if (cur && cur.getTime() > now.getTime()) credited = Math.floor((cur.getTime() - now.getTime()) / DAY)
  }
  const exp = new Date(now.getTime() + (365 + credited) * DAY)
  return { expires: fmt(exp), daysCredited: credited }
}
