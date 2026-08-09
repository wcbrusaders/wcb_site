export type MemberRecord = {
  emailAddress: string
  googleEmail: string | null
  name: string | null
  tier: string | null
  current: boolean
  isBoard: boolean
  partnerEmail: string | null
  expires: Date | null
}

export type GateResult = { ok: false } | { ok: true; member: MemberRecord }

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function truthy(v: string | undefined): boolean {
  if (!v) return false
  return ['true','yes','y','1','x','current'].includes(v.trim().toLowerCase())
}

function cell(headers: string[], row: string[], name: string): string {
  const i = headers.indexOf(name)
  return i >= 0 ? (row[i] ?? '').trim() : ''
}

export function mapSheetRow(headers: string[], row: string[]): MemberRecord | null {
  const email = cell(headers, row, 'Email Address')
  if (!email) return null
  const g = cell(headers, row, 'Google Email')
  const p = cell(headers, row, 'Partner Email')
  const exp = cell(headers, row, 'Expires')
  const expires = exp ? new Date(exp) : null
  return {
    emailAddress: normalizeEmail(email),
    googleEmail: g ? normalizeEmail(g) : null,
    name: cell(headers, row, 'Name') || null,
    tier: cell(headers, row, 'Tier') || null,
    current: truthy(cell(headers, row, 'Current')),
    isBoard: truthy(cell(headers, row, 'Board Member')),
    partnerEmail: p ? normalizeEmail(p) : null,
    expires: expires && !isNaN(expires.getTime()) ? expires : null,
  }
}
