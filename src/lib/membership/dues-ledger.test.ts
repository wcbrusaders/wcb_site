import { describe, it, expect } from 'vitest'
import { duesLedgerRow } from './dues-ledger'
import { appendPaymentRow } from '../roster'
import type { Ipn } from './paypal-ipn'

const ipn = (over: Partial<Ipn> = {}): Ipn => ({
  txnId: 'T1', email: 'a@b.com', firstName: 'A', lastName: 'B', amount: 40, fee: 1.89, status: 'completed',
  txnType: 'web_accept', noteEmails: [], custom: '', receiverEmail: 'club@wcbrusaders.com', ...over,
})
// 2026-11-22 18:50 UTC = 1:50pm Eastern
const NOW = new Date('2026-11-22T18:50:00Z')

describe('duesLedgerRow — the Payments-tab row for a dues payment', () => {
  it('renewal: Eastern date, net of the PayPal fee, source PayPal', () => {
    expect(duesLedgerRow(ipn(), 'renewed', NOW)).toEqual({ Date: '2026-11-22', 'Net Dues': '38.11', Source: 'PayPal' })
  })

  it('logs every outcome where money was actually received', () => {
    for (const o of ['renewed', 'reactivated', 'new', 'review'] as const) expect(duesLedgerRow(ipn(), o, NOW)).not.toBeNull()
  })

  it('never logs a duplicate re-delivery (would double-count) or a non-dues amount', () => {
    expect(duesLedgerRow(ipn(), 'duplicate', NOW)).toBeNull()
    expect(duesLedgerRow(ipn({ amount: 25 }), 'skipped-tier', NOW)).toBeNull()
  })

  it('couple tier nets correctly', () => {
    expect(duesLedgerRow(ipn({ amount: 65, fee: 2.76 }), 'new', NOW)?.['Net Dues']).toBe('62.24')
  })

  it('uses the Eastern calendar date (late-evening ET payment is still that day)', () => {
    // 2026-11-23 03:30 UTC = 10:30pm Eastern on Nov 22
    expect(duesLedgerRow(ipn(), 'renewed', new Date('2026-11-23T03:30:00Z'))?.Date).toBe('2026-11-22')
  })

  it('missing fee → records the gross (never inflates beyond what PayPal reported)', () => {
    expect(duesLedgerRow(ipn({ fee: 0 }), 'renewed', NOW)?.['Net Dues']).toBe('40.00')
  })
})

describe('appendPaymentRow', () => {
  it('appends to the Payments tab in that tab\'s own column order', async () => {
    const appended: { tab: string; values: string[] }[] = []
    await appendPaymentRow({ Date: '2026-11-22', 'Net Dues': '38.11', Source: 'PayPal' }, {
      getTab: async () => [['Date', 'Net Dues', 'Source']],
      appendRow: async (tab, values) => { appended.push({ tab, values }); return 58 },
    })
    expect(appended).toEqual([{ tab: 'Payments', values: ['2026-11-22', '38.11', 'PayPal'] }])
  })

  it('follows a reordered header row', async () => {
    const appended: string[][] = []
    await appendPaymentRow({ Date: '2026-11-22', 'Net Dues': '38.11', Source: 'PayPal' }, {
      getTab: async () => [['Source', 'Date', 'Net Dues']],
      appendRow: async (_t, v) => { appended.push(v); return 2 },
    })
    expect(appended[0]).toEqual(['PayPal', '2026-11-22', '38.11'])
  })
})
