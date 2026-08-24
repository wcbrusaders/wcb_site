import { prisma } from '../db'
import type { MemberLite, PaymentLite } from './types'

/**
 * Read-only fetch layer for the membership metrics engine. Isolates Prisma
 * so the compute functions (kpis.ts, trends.ts, ...) stay pure and testable
 * on plain arrays. Used by Phase 3 (admin reports UI) and Phase 4 (snapshot
 * job) callers via `getMembershipReports()` (Task 5).
 */
export async function fetchMetricsData(
  db: Pick<typeof prisma, 'member' | 'payment'> = prisma
): Promise<{ members: MemberLite[]; payments: PaymentLite[] }> {
  const [memberRows, paymentRows] = await Promise.all([
    db.member.findMany({
      select: {
        name: true,
        tier: true,
        current: true,
        membershipState: true,
        joinDate: true,
        expires: true,
      },
    }),
    db.payment.findMany({
      select: {
        date: true,
        netDues: true,
        source: true,
      },
    }),
  ])

  const members: MemberLite[] = memberRows.map((m) => ({
    name: m.name,
    tier: m.tier,
    current: m.current,
    membershipState: m.membershipState,
    joinDate: m.joinDate,
    expires: m.expires,
  }))

  const payments: PaymentLite[] = paymentRows.map((p) => ({
    date: p.date,
    netDues: p.netDues,
    source: p.source,
  }))

  return { members, payments }
}
