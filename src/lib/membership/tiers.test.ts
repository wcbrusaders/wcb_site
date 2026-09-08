import { describe, it, expect } from 'vitest'
import { tierFromAmount, computeExpiration } from './tiers'

const NOW = new Date('2026-09-08T00:00:00Z')

describe('tierFromAmount', () => {
  it('maps exact amounts, tolerant of float noise', () => {
    expect(tierFromAmount(40)).toBe('Single')
    expect(tierFromAmount(40.001)).toBe('Single')
    expect(tierFromAmount(65)).toBe('Couple')
    expect(tierFromAmount(50)).toBeNull()
  })
})

describe('computeExpiration', () => {
  it('new member -> now + 365, 0 credited', () => {
    const r = computeExpiration(null, NOW)
    expect(r).toEqual({ expires: '9/8/2027', daysCredited: 0 })
  })
  it('early renewal credits remaining days', () => {
    // currently expires 30 days out -> new expiry = now + 365 + 30
    const r = computeExpiration('10/8/2026', NOW)
    expect(r.daysCredited).toBe(30)
    expect(r.expires).toBe('10/8/2027')
  })
  it('already-expired renewal credits 0', () => {
    const r = computeExpiration('1/1/2026', NOW)
    expect(r.daysCredited).toBe(0)
    expect(r.expires).toBe('9/8/2027')
  })
})
