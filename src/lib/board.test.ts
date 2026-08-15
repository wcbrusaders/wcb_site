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

  it('orders by the leadership name list (Jordan, Nate, Karl, Marcella), then others alphabetically', () => {
    const rows = [
      rec({ name: 'Zoe', isBoard: true, role: 'Board Member' }),
      rec({ name: 'Marcella', isBoard: true, role: 'Ombudsman' }),
      rec({ name: 'Nate', isBoard: true, role: 'Vice President' }),
      rec({ name: 'Adam', isBoard: true, role: 'Board Member' }),
      rec({ name: 'Karl', isBoard: true, role: 'Secretary' }),
      rec({ name: 'Jordan', isBoard: true, role: 'President' }),
    ]
    const board = boardFromRoster(rows)
    // leadership list first in the given order, then unlisted names alphabetically
    expect(board.map(b => b.name)).toEqual(['Jordan', 'Nate', 'Karl', 'Marcella', 'Adam', 'Zoe'])
  })

  it('orders by name case-insensitively (roster spelling variance safe)', () => {
    const rows = [
      rec({ name: 'marcella', isBoard: true, role: 'Ombudsman' }),
      rec({ name: 'JORDAN', isBoard: true, role: 'President' }),
    ]
    const board = boardFromRoster(rows)
    expect(board.map(b => b.name)).toEqual(['JORDAN', 'marcella'])
  })

  it('exposes the Ombudsman Discord handle', () => {
    expect(OMBUDSMAN.discord).toBe('Arycella')
  })
})
