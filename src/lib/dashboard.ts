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

import { prisma } from './db'
import { normalizeEmail } from './roster'

export type DashboardRecord = {
  name: string | null; tier: string | null; current: boolean; isBoard: boolean
  expires: Date | null; joinDate: Date | null; paymentDate: Date | null
  partnerEmail: string | null; resourceAccess: boolean | null
}

export async function getMemberDashboard(
  email: string,
  deps: { db?: typeof prisma } = {},
): Promise<DashboardRecord | null> {
  const db = deps.db ?? prisma
  const e = normalizeEmail(email)
  const m = await db.member.findFirst({
    where: { OR: [{ emailAddress: e }, { googleEmail: e }] },
    select: {
      name: true, tier: true, current: true, isBoard: true, expires: true,
      joinDate: true, paymentDate: true, partnerEmail: true, resourceAccess: true,
    },
  })
  return m ?? null
}
