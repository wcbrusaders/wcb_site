import { matchPayment, type MatchMember } from './match'
import { tierFromAmount, computeExpiration } from './tiers'
import { renderWelcome, renderRenewal } from './emails'
import type { Ipn } from './paypal-ipn'

export interface ProcessDeps {
  readMembers: () => Promise<MatchMember[]>
  writeCells: (tab: 'current' | 'lapsed', row: number, updates: Record<string, string>) => Promise<void>
  moveRow: (from: 'current' | 'lapsed', row: number, to: 'current' | 'lapsed') => Promise<number>
  appendNew: (row: Record<string, string>) => Promise<number>
  sendEmail: (to: string, subject: string, html: string) => Promise<void>
  queuePending: (payload: Ipn, candidateRows: number[]) => Promise<void>
  alreadyProcessed: (txnId: string) => Promise<boolean>
  markProcessed: (txnId: string) => Promise<void>
  now: Date
}

type Outcome = 'renewed' | 'new' | 'reactivated' | 'review' | 'skipped-tier' | 'duplicate'

function fmtDate(d: Date): string {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`
}

// Existing-row current->Lapsed date column is unavailable to us here beyond
// what MatchMember carries (rowNumber/tab/name/emails — no Expires), so the
// renewal/reactivation credit calc reads the row's Expires via writeCells'
// caller... actually MatchMember has no Expires field, so proration uses
// null (no prior expiry known at match time) unless a future task widens
// MatchMember. Documented in the report.
export async function processPayment(ipn: Ipn, deps: ProcessDeps): Promise<{ outcome: Outcome }> {
  if (await deps.alreadyProcessed(ipn.txnId)) {
    return { outcome: 'duplicate' }
  }

  const tier = tierFromAmount(ipn.amount)
  if (!tier) {
    return { outcome: 'skipped-tier' }
  }

  const members = await deps.readMembers()
  const result = matchPayment({ email: ipn.email, firstName: ipn.firstName, lastName: ipn.lastName }, members)

  if (result.kind === 'exact' || result.kind === 'normalized' || result.kind === 'alias') {
    const member = result.member
    const { expires, daysCredited } = computeExpiration(null, deps.now)
    const paymentDate = fmtDate(deps.now)

    if (member.tab === 'lapsed') {
      const newRow = await deps.moveRow('lapsed', member.rowNumber, 'current')
      await deps.writeCells('current', newRow, {
        Tier: tier,
        Expires: expires,
        'Payment Date': paymentDate,
        Current: 'Yes',
        'Last Reminder Sent': '',
        'Reminder Count': '0',
      })
      const { subject, html } = renderRenewal({ firstName: ipn.firstName, tier, expiration: expires, daysCredited })
      await deps.sendEmail(ipn.email, subject, html)
      await deps.markProcessed(ipn.txnId)
      return { outcome: 'reactivated' }
    }

    await deps.writeCells('current', member.rowNumber, {
      Tier: tier,
      Expires: expires,
      'Payment Date': paymentDate,
      Current: 'Yes',
      'Last Reminder Sent': '',
      'Reminder Count': '0',
    })
    const { subject, html } = renderRenewal({ firstName: ipn.firstName, tier, expiration: expires, daysCredited })
    await deps.sendEmail(ipn.email, subject, html)
    await deps.markProcessed(ipn.txnId)
    return { outcome: 'renewed' }
  }

  if (result.kind === 'name-review') {
    const candidateRows = result.candidates.map((c) => c.rowNumber)
    await deps.queuePending(ipn, candidateRows)
    const softAckHtml = `<p>Hi ${ipn.firstName},</p><p>We received your payment and are finalizing your membership. You'll get a confirmation email shortly.</p>`
    await deps.sendEmail(ipn.email, 'Payment received — finalizing your membership', softAckHtml)
    await deps.markProcessed(ipn.txnId)
    return { outcome: 'review' }
  }

  // none: brand-new member
  const { expires } = computeExpiration(null, deps.now)
  const paymentDate = fmtDate(deps.now)
  await deps.appendNew({
    Name: `${ipn.firstName} ${ipn.lastName}`.trim(),
    Tier: tier,
    'Email Address': ipn.email,
    'Payment Date': paymentDate,
    Expires: expires,
    Current: 'Yes',
    'Join Date': paymentDate,
  })
  const { subject, html } = renderWelcome({ firstName: ipn.firstName, tier, expiration: expires })
  await deps.sendEmail(ipn.email, subject, html)
  await deps.markProcessed(ipn.txnId)
  return { outcome: 'new' }
}
