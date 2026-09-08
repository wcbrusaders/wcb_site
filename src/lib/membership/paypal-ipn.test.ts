import { describe, it, expect, vi } from 'vitest'
import { parseIpn, isProcessablePayment, verifyIpn } from './paypal-ipn'

describe('parseIpn', () => {
  it('pulls the fields we need', () => {
    const f = new URLSearchParams({ txn_id: 'T1', payer_email: 'A@B.com', first_name: 'Peter', last_name: 'Pray', mc_gross: '65.00', payment_status: 'Completed', txn_type: 'web_accept' })
    const p = parseIpn(f)
    expect(p).toMatchObject({ txnId: 'T1', email: 'a@b.com', firstName: 'Peter', lastName: 'Pray', amount: 65, status: 'completed', txnType: 'web_accept' })
  })
})
describe('isProcessablePayment', () => {
  it('true only for completed web_accept/cart/express_checkout', () => {
    expect(isProcessablePayment({ status: 'completed', txnType: 'web_accept' } as never)).toBe(true)
    expect(isProcessablePayment({ status: 'pending', txnType: 'web_accept' } as never)).toBe(false)
    expect(isProcessablePayment({ status: 'completed', txnType: 'refund' } as never)).toBe(false)
  })
})
describe('verifyIpn', () => {
  it('posts back _notify-validate and requires VERIFIED', async () => {
    const fetch = vi.fn().mockResolvedValue({ text: async () => 'VERIFIED' })
    const ok = await verifyIpn('txn_id=T1', { fetch, paypalUrl: 'https://ipnpb.paypal.com/cgi-bin/webscr' })
    expect(ok).toBe(true)
    expect(fetch.mock.calls[0][1].body).toMatch(/^cmd=_notify-validate&txn_id=T1/)
  })
  it('false when PayPal says INVALID', async () => {
    const fetch = vi.fn().mockResolvedValue({ text: async () => 'INVALID' })
    expect(await verifyIpn('x=1', { fetch, paypalUrl: 'https://x' })).toBe(false)
  })
})
