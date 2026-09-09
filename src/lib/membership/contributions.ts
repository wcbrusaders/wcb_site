// Competition contribution recording + the anti-spoof receiver guard.
// DI'd (db) so it's fully unit-testable with no live DB — matches the style
// in src/lib/competitions.ts / src/lib/shipping/poll-shipments.ts.

import { prisma } from '@/lib/db'

// Fail-open by design (Jordan's decision, see spec Security section): if
// CLUB_PAYPAL_RECEIVER_EMAIL is unset, we do NOT reject contributions —
// silently dropping real money on a missing env var is worse than the
// (mitigated-by-IPN-verification) spoof risk. Setting the env var in prod
// is the documented hardening step.
export function receiverIsClub(receiverEmail: string, deps: { clubEmail?: string | null } = {}): boolean {
  const clubEmail = deps.clubEmail ?? process.env.CLUB_PAYPAL_RECEIVER_EMAIL ?? null
  if (clubEmail === null || clubEmail.trim() === '') {
    // Per the spec: fail open, but leave a breadcrumb so a prod deploy that
    // forgot to set CLUB_PAYPAL_RECEIVER_EMAIL is discoverable in logs (the
    // anti-spoof check is a no-op until it's set).
    console.warn('receiverIsClub: CLUB_PAYPAL_RECEIVER_EMAIL unset — recording contribution without receiver verification')
    return true
  }
  return receiverEmail.trim().toLowerCase() === clubEmail.trim().toLowerCase()
}

export type ContributionInput = {
  compId: string
  txnId: string
  amount: number
  payerName: string | null
  payerEmail: string | null
}

export async function recordContribution(
  input: ContributionInput,
  deps: { db?: typeof prisma; now?: Date } = {},
): Promise<{ outcome: 'recorded' | 'duplicate' | 'unknown-comp' | 'invalid-amount' }> {
  const db = deps.db ?? prisma
  // The amount feeds the member-visible per-comp total, so reject anything that
  // isn't a positive, finite number: a $0.00 (payer zeroed the editable amount)
  // or a NaN (malformed mc_gross that parseFloat couldn't read) must not create
  // a row. This is pure input validation, so it runs before any DB round-trip.
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { outcome: 'invalid-amount' }
  }
  const existing = await db.contribution.findUnique({ where: { txnId: input.txnId } })
  if (existing) return { outcome: 'duplicate' }

  const comp = await db.competition.findUnique({ where: { id: input.compId } })
  if (!comp) return { outcome: 'unknown-comp' }

  await db.contribution.create({
    data: {
      competitionId: input.compId,
      txnId: input.txnId,
      amount: input.amount,
      payerName: input.payerName,
      payerEmail: input.payerEmail,
    },
  })
  return { outcome: 'recorded' }
}
