import type { Ipn } from './paypal-ipn'

// The roster sheet's Payments tab is the dues ledger: one row per dues payment (Date, Net Dues,
// Source). The sheet's Revenue tab and the site's revenue report both sum it. Before the site took
// over PayPal processing (2026-09-08) an Apps Script appended these rows; the site only left a $0
// idempotency marker in the Payment table, so every renewal since then was missing from revenue.
// This builds the row the webhook appends for each payment that actually brought money in.

/** processPayment outcomes where dues were received (and haven't been logged before). */
const RECEIVED = new Set(['renewed', 'reactivated', 'new', 'review'])

export type DuesLedgerRow = { Date: string; 'Net Dues': string; Source: 'PayPal' }

/** Calendar date in the club's timezone (US Eastern), YYYY-MM-DD — matches existing Payments rows. */
function easternDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export function duesLedgerRow(ipn: Ipn, outcome: string, now: Date): DuesLedgerRow | null {
  if (!RECEIVED.has(outcome)) return null
  const net = Math.round((ipn.amount - (ipn.fee || 0)) * 100) / 100
  return { Date: easternDate(now), 'Net Dues': net.toFixed(2), Source: 'PayPal' }
}
