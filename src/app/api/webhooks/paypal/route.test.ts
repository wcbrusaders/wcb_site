import { describe, it, expect } from 'vitest'
import { classifyIpn } from './route'
import type { Ipn } from '@/lib/membership/paypal-ipn'

// Minimal Ipn fixture builder — every field present, override just `custom`
// for these routing-decision tests.
function makeIpn(overrides: Partial<Ipn> = {}): Ipn {
  return {
    txnId: 'T1',
    email: 'payer@example.com',
    firstName: 'Peter',
    lastName: 'Pray',
    amount: 15,
    status: 'completed',
    txnType: 'web_accept',
    noteEmails: [],
    custom: '',
    receiverEmail: '',
    ...overrides,
  }
}

describe('classifyIpn', () => {
  it('routes custom=comp:<id> to contribution with the captured id', () => {
    expect(classifyIpn(makeIpn({ custom: 'comp:abc' }))).toEqual({ kind: 'contribution', compId: 'abc' })
  })

  it('trims whitespace around the captured id', () => {
    expect(classifyIpn(makeIpn({ custom: 'comp: abc ' }))).toEqual({ kind: 'contribution', compId: 'abc' })
  })

  it('treats an empty comp id (custom="comp:") as membership, not contribution', () => {
    expect(classifyIpn(makeIpn({ custom: 'comp:' }))).toEqual({ kind: 'membership' })
  })

  it('treats a whitespace-only comp id as membership', () => {
    expect(classifyIpn(makeIpn({ custom: 'comp:   ' }))).toEqual({ kind: 'membership' })
  })

  it('treats missing custom as membership', () => {
    expect(classifyIpn(makeIpn({ custom: '' }))).toEqual({ kind: 'membership' })
  })

  it('treats unrelated custom values as membership', () => {
    expect(classifyIpn(makeIpn({ custom: 'garbage' }))).toEqual({ kind: 'membership' })
  })
})
