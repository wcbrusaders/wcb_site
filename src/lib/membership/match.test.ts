import { describe, it, expect } from 'vitest'
import { matchPayment, type MatchMember } from './match'

const m = (over: Partial<MatchMember>): MatchMember =>
  ({ rowNumber: 1, tab: 'current', name: 'X', emails: [], ...over })

describe('matchPayment', () => {
  const members: MatchMember[] = [
    m({ rowNumber: 11, name: 'Peter Pray', emails: ['petehpray@gmail.com'] }),
    m({ rowNumber: 12, name: 'Jane Roe', emails: ['jane@roe.com'] }),
    m({ rowNumber: 40, tab: 'lapsed', name: 'Gus Gone', emails: ['gus@old.com'] }),
  ]
  it('exact email match (any known email)', () => {
    const r = matchPayment({ email: 'jane@roe.com', firstName: 'Jane', lastName: 'Roe' }, members)
    expect(r).toEqual({ kind: 'exact', member: members[1] })
  })
  it('normalized email match (gmail dots/plus) — Peter case', () => {
    const r = matchPayment({ email: 'Pete.H.Pray+x@gmail.com', firstName: 'Peter', lastName: 'Pray' }, members)
    expect(r.kind).toBe('normalized')
  })
  it('name match with NO email match -> review, never auto', () => {
    const r = matchPayment({ email: 'brand-new@nowhere.com', firstName: 'Peter', lastName: 'Pray' }, members)
    expect(r.kind).toBe('name-review')
    if (r.kind === 'name-review') expect(r.candidates.map((c) => c.rowNumber)).toEqual([11])
  })
  it('searches the Lapsed tab (rejoin)', () => {
    const r = matchPayment({ email: 'gus@old.com', firstName: 'Gus', lastName: 'Gone' }, members)
    expect(r.kind).toBe('exact')
    if (r.kind === 'exact') expect(r.member.tab).toBe('lapsed')
  })
  it('no match at all -> none', () => {
    const r = matchPayment({ email: 'nobody@x.com', firstName: 'No', lastName: 'Body' }, members)
    expect(r).toEqual({ kind: 'none' })
  })
})
