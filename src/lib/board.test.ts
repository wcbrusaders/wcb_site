import { describe, it, expect } from 'vitest'
import { boardFromRoster, OMBUDSMAN } from './board'
import type { MemberRecord } from './roster'

function rec(p: Partial<MemberRecord>): MemberRecord {
  return {
    emailAddress: 'x@example.com', googleEmail: null, name: 'X', tier: null,
    current: true, isBoard: false, partnerEmail: null, expires: null,
    joinDate: null, paymentDate: null, referredBy: null, role: null, ...p,
  }
}

describe('boardFromRoster', () => {
  it('keeps only board members that have a role and name', () => {
    const rows = [
      rec({ name: 'Jordan', isBoard: true, role: 'President' }),
      rec({ name: 'NonBoard', isBoard: false, role: null }),
      rec({ name: 'BoardNoRole', isBoard: true, role: null }),
    ]
    const board = boardFromRoster(rows)
    expect(board.map(b => b.name)).toEqual(['Jordan'])
  })

  it('orders known officer roles first, then others alphabetically', () => {
    const rows = [
      rec({ name: 'Zoe', isBoard: true, role: 'Board Member' }),
      rec({ name: 'Val', isBoard: true, role: 'Treasurer' }),
      rec({ name: 'Jordan', isBoard: true, role: 'President' }),
    ]
    const board = boardFromRoster(rows)
    expect(board.map(b => b.role)).toEqual(['President', 'Treasurer', 'Board Member'])
  })

  it('exposes the Ombudsman Discord handle', () => {
    expect(OMBUDSMAN.discord).toBe('Arycella')
  })
})
