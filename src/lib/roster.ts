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
