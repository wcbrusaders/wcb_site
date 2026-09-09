import { describe, it, expect } from 'vitest'
import { buildDonateUrl } from './paypal-donate-url'

describe('buildDonateUrl', () => {
  it('builds a classic PayPal donation link with the expected params', () => {
    const url = buildDonateUrl({ merchantId: '9D725X3PMN4FW', compId: 'abc', compName: 'Winter Fest', amount: 15 })
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://www.paypal.com/cgi-bin/webscr')
    const p = parsed.searchParams
    expect(p.get('cmd')).toBe('_donations')
    expect(p.get('business')).toBe('9D725X3PMN4FW')
    expect(p.get('currency_code')).toBe('USD')
    expect(p.get('amount')).toBe('15')
    expect(p.get('custom')).toBe('comp:abc')
    expect(p.get('item_name')).toContain('Winter Fest')
    expect(p.get('no_note')).toBe('0')
  })

  it('round-trips a comp name containing spaces and an ampersand safely', () => {
    const url = buildDonateUrl({ merchantId: '9D725X3PMN4FW', compId: 'xyz', compName: 'Blue Ridge Brew & Off', amount: 15 })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('item_name')).toContain('Blue Ridge Brew & Off')
    expect(parsed.searchParams.get('custom')).toBe('comp:xyz')
  })

  it('includes return and cancel_return when returnUrl is given', () => {
    const url = buildDonateUrl({
      merchantId: '9D725X3PMN4FW',
      compId: 'abc',
      compName: 'Winter Fest',
      amount: 15,
      returnUrl: 'https://www.wcbrusaders.com/members/competitions',
    })
    const p = new URL(url).searchParams
    expect(p.get('return')).toBe('https://www.wcbrusaders.com/members/competitions')
    expect(p.get('cancel_return')).toBe('https://www.wcbrusaders.com/members/competitions')
  })

  it('omits return/cancel_return when returnUrl is not given', () => {
    const url = buildDonateUrl({ merchantId: '9D725X3PMN4FW', compId: 'abc', compName: 'Winter Fest', amount: 15 })
    const p = new URL(url).searchParams
    expect(p.has('return')).toBe(false)
    expect(p.has('cancel_return')).toBe(false)
  })

  it('stringifies a non-integer amount safely', () => {
    const url = buildDonateUrl({ merchantId: '9D725X3PMN4FW', compId: 'abc', compName: 'Winter Fest', amount: 12.5 })
    expect(new URL(url).searchParams.get('amount')).toBe('12.5')
  })
})
