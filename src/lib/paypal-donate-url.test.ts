import { describe, it, expect } from 'vitest'
import { buildDonateUrl } from './paypal-donate-url'

describe('buildDonateUrl', () => {
  it('builds a classic PayPal donation link with the expected params', () => {
    const url = buildDonateUrl({ merchantId: '9D725X3PMN4FW', compId: 'abc', compName: 'Winter Fest' })
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://www.paypal.com/cgi-bin/webscr')
    const p = parsed.searchParams
    expect(p.get('cmd')).toBe('_donations')
    expect(p.get('business')).toBe('9D725X3PMN4FW')
    expect(p.get('currency_code')).toBe('USD')
    expect(p.get('custom')).toBe('comp:abc')
    expect(p.get('item_name')).toContain('Winter Fest')
    expect(p.get('no_note')).toBe('0')
  })

  // The whole point of this fix: NO preset `amount`. On a classic _donations
  // link, sending an amount LOCKS it (non-editable). Omitting it lets the donor
  // type whatever they want — which is the intended "suggested $15, pay what you
  // want" behavior (the $15 suggestion lives in on-page copy, not the URL).
  it('does NOT send an amount param (so the donor can choose the amount)', () => {
    const url = buildDonateUrl({ merchantId: '9D725X3PMN4FW', compId: 'abc', compName: 'Winter Fest' })
    expect(new URL(url).searchParams.has('amount')).toBe(false)
  })

  it('round-trips a comp name containing spaces and an ampersand safely', () => {
    const url = buildDonateUrl({ merchantId: '9D725X3PMN4FW', compId: 'xyz', compName: 'Blue Ridge Brew & Off' })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('item_name')).toContain('Blue Ridge Brew & Off')
    expect(parsed.searchParams.get('custom')).toBe('comp:xyz')
  })

  it('includes return and cancel_return when returnUrl is given', () => {
    const url = buildDonateUrl({
      merchantId: '9D725X3PMN4FW',
      compId: 'abc',
      compName: 'Winter Fest',
      returnUrl: 'https://www.wcbrusaders.com/members/competitions',
    })
    const p = new URL(url).searchParams
    expect(p.get('return')).toBe('https://www.wcbrusaders.com/members/competitions')
    expect(p.get('cancel_return')).toBe('https://www.wcbrusaders.com/members/competitions')
  })

  it('omits return/cancel_return when returnUrl is not given', () => {
    const url = buildDonateUrl({ merchantId: '9D725X3PMN4FW', compId: 'abc', compName: 'Winter Fest' })
    const p = new URL(url).searchParams
    expect(p.has('return')).toBe(false)
    expect(p.has('cancel_return')).toBe(false)
  })
})
