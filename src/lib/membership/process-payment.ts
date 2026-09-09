import { matchPayment, type MatchMember } from './match'
import { tierFromAmount, computeExpiration } from './tiers'
import { renderWelcome, renderRenewal } from './emails'
import { normalizeEmail } from '@/lib/roster'
import type { Ipn } from './paypal-ipn'

export type PendingCandidate = { rowNumber: number; tab: 'current' | 'lapsed' }

export interface ProcessDeps {
  readMembers: () => Promise<MatchMember[]>
  writeCells: (tab: 'current' | 'lapsed', row: number, updates: Record<string, string>) => Promise<void>
  moveRow: (from: 'current' | 'lapsed', row: number, to: 'current' | 'lapsed') => Promise<number>
  appendNew: (row: Record<string, string>) => Promise<number>
  sendEmail: (to: string, subject: string, html: string) => Promise<void>
  // Carries each candidate's TAB alongside its rowNumber — a name-review
  // candidate can live on EITHER tab (matchPayment scans both), and row
  // numbers are only unique WITHIN a tab. Losing the tab here was the root
  // of a data-corruption bug: a board confirm on a lapsed-tab candidate
  // would silently read/write an unrelated current-tab row sharing that
  // same physical row number.
  queuePending: (payload: Ipn, candidates: PendingCandidate[]) => Promise<void>
  alreadyProcessed: (txnId: string) => Promise<boolean>
  markProcessed: (txnId: string) => Promise<void>
  now: Date
}

type Outcome = 'renewed' | 'new' | 'reactivated' | 'review' | 'skipped-tier' | 'duplicate'

function fmtDate(d: Date): string {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`
}

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
    // Credit remaining days on the member's CURRENT expiry (renewal or
    // reactivation) rather than resetting to a flat 365 days — an early
    // renewer keeps the time they already paid for.
    const { expires, daysCredited } = computeExpiration(member.expires, deps.now)
    const paymentDate = fmtDate(deps.now)

    // Auto-catalog: if this payer email isn't already one of the member's known
    // emails, append it to their 'Payment Emails' alias column so a future
    // payment from the same address exact-matches. member.emails already holds
    // every known address (incl. existing aliases); member.paymentEmails is the
    // raw alias-column cell we append to so we don't clobber existing aliases.
    const payer = normalizeEmail(ipn.email)
    const knownEmails = new Set(member.emails.map((e) => normalizeEmail(e)))
    const aliasWrite: Record<string, string> = {}
    if (payer && !knownEmails.has(payer)) {
      const existing = (member.paymentEmails ?? '').split(',').map((e) => e.trim()).filter(Boolean)
      aliasWrite['Payment Emails'] = [...existing, payer].join(', ')
    }

    // Claim the txn BEFORE the first mutation: from here on we're committed
    // to mutating the roster, so a crash/timeout after this point but before
    // completion must make a PayPal retry short-circuit at the
    // `alreadyProcessed` guard above rather than double-renew (which would
    // jump Expires by another ~year, compounded by day-credit).
    await deps.markProcessed(ipn.txnId)

    if (member.tab === 'lapsed') {
      const newRow = await deps.moveRow('lapsed', member.rowNumber, 'current')
      await deps.writeCells('current', newRow, {
        Tier: tier,
        Expires: expires,
        'Payment Date': paymentDate,
        Current: 'Yes',
        'Last Reminder Sent': '',
        'Reminder Count': '0',
        ...aliasWrite,
      })
      const { subject, html } = renderRenewal({ firstName: ipn.firstName, tier, expiration: expires, daysCredited })
      await deps.sendEmail(ipn.email, subject, html)
      return { outcome: 'reactivated' }
    }

    await deps.writeCells('current', member.rowNumber, {
      Tier: tier,
      Expires: expires,
      'Payment Date': paymentDate,
      Current: 'Yes',
      'Last Reminder Sent': '',
      'Reminder Count': '0',
      ...aliasWrite,
    })
    const { subject, html } = renderRenewal({ firstName: ipn.firstName, tier, expiration: expires, daysCredited })
    await deps.sendEmail(ipn.email, subject, html)
    return { outcome: 'renewed' }
  }

  if (result.kind === 'name-review') {
    const candidates = result.candidates.map((c) => ({ rowNumber: c.rowNumber, tab: c.tab }))
    // Claim before the first mutation (queuePending), same reasoning as above.
    await deps.markProcessed(ipn.txnId)
    await deps.queuePending(ipn, candidates)
    const softAckHtml = `<p>Hi ${ipn.firstName},</p><p>We received your payment and are finalizing your membership. You'll get a confirmation email shortly.</p>`
    await deps.sendEmail(ipn.email, 'Payment received — finalizing your membership', softAckHtml)
    return { outcome: 'review' }
  }

  // none: brand-new member
  const { expires } = computeExpiration(null, deps.now)
  const paymentDate = fmtDate(deps.now)
  // Claim before the first mutation (appendNew), same reasoning as above.
  await deps.markProcessed(ipn.txnId)
  await deps.appendNew({
    Name: `${ipn.firstName} ${ipn.lastName}`.trim(),
    Tier: tier,
    'Email Address': ipn.email,
    'Payment Date': paymentDate,
    Expires: expires,
    Current: 'Yes',
    'Join Date': paymentDate,
  })
  // A Couple/Dual signup is really two people, but PayPal only tells us
  // about the one who paid. Append a placeholder row for the unnamed
  // partner (unchanged behavior from the old bot, per the design doc §5) so
  // the board can complete it with the partner's real name/email later
  // (Task 8's completePartnerAction) — findPartnerPlaceholders (roster.ts)
  // is the consumer this must agree with: it keys ONLY on 'Email Address'
  // === 'NEEDS UPDATE', so that sentinel is load-bearing here.
  if (tier === 'Couple') {
    await deps.appendNew({
      Name: `[Partner of ${ipn.firstName} ${ipn.lastName} - UPDATE]`.trim(),
      Tier: tier,
      'Email Address': 'NEEDS UPDATE',
      'Payment Date': paymentDate,
      Expires: expires,
      Current: 'Yes',
    })
  }
  const { subject, html } = renderWelcome({ firstName: ipn.firstName, tier, expiration: expires })
  await deps.sendEmail(ipn.email, subject, html)
  return { outcome: 'new' }
}
