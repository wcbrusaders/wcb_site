const hits = new Map<string, number[]>()

export function _resetRateLimit() {
  hits.clear()
}

export function checkRateLimit(key: string, opts: { max?: number; windowMs?: number } = {}): { ok: boolean } {
  const max = opts.max ?? 5
  const windowMs = opts.windowMs ?? 15 * 60_000
  const now = Date.now()
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (arr.length >= max) {
    hits.set(key, arr)
    return { ok: false }
  }
  arr.push(now)
  hits.set(key, arr)
  return { ok: true }
}
