export function formatTenure(joinDate: Date | null, now: Date = new Date()): string {
  if (!joinDate || isNaN(joinDate.getTime()) || joinDate.getTime() > now.getTime()) return ''
  let months =
    (now.getUTCFullYear() - joinDate.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - joinDate.getUTCMonth())
  if (now.getUTCDate() < joinDate.getUTCDate()) months -= 1 // not yet reached this month's day
  if (months < 0) months = 0
  const years = Math.floor(months / 12)
  const rem = months % 12
  if (years === 0) return `${rem} mo`
  return rem === 0 ? `${years} yr` : `${years} yr ${rem} mo`
}
