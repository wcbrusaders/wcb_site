import { describe, it, expect } from 'vitest'
import { normalizeEmailStrict, normalizeName } from './normalize'

describe('normalizeEmailStrict', () => {
  it('lowercases + trims', () => {
    expect(normalizeEmailStrict('  Pete.H.Pray@Yahoo.com ')).toBe('pete.h.pray@yahoo.com')
  })
  it('strips gmail dots and +tags in the local part only', () => {
    expect(normalizeEmailStrict('pete.h.pray+comp@gmail.com')).toBe('petehpray@gmail.com')
    expect(normalizeEmailStrict('a.b.c@googlemail.com')).toBe('abc@googlemail.com')
  })
  it('leaves non-gmail dots intact', () => {
    expect(normalizeEmailStrict('first.last@sas.com')).toBe('first.last@sas.com')
  })
})

describe('normalizeName', () => {
  it('lowercases, collapses whitespace, strips punctuation', () => {
    expect(normalizeName("  Peter  H.  Pray-Jones  ")).toBe('peter h pray jones')
  })
})
