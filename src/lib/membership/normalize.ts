export function normalizeEmailStrict(email: string): string {
  const e = email.trim().toLowerCase()
  const at = e.lastIndexOf('@')
  if (at < 0) return e
  let local = e.slice(0, at)
  const host = e.slice(at + 1)
  const plus = local.indexOf('+')
  if (plus >= 0) local = local.slice(0, plus)
  if (host === 'gmail.com' || host === 'googlemail.com') local = local.replace(/\./g, '')
  return `${local}@${host}`
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
