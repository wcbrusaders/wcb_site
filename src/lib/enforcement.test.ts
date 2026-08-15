import { describe, it, expect } from 'vitest'
import { computeEligibleBoard, tallyVotes, isExpired, decisionDueDate, isCaseResolvable, cooldownUntil, QUORUM_FLOOR } from './enforcement'

describe('computeEligibleBoard', () => {
  it('removes recused members from the board', () => {
    expect(computeEligibleBoard(['a', 'b', 'c', 'd'], ['b'])).toEqual(['a', 'c', 'd'])
  })
  it('dedups and ignores recused ids not on the board', () => {
    expect(computeEligibleBoard(['a', 'a', 'b'], ['x'])).toEqual(['a', 'b'])
  })
})

describe('tallyVotes', () => {
  it('fails when quorum not met (fewer than 3 votes) even if unanimous', () => {
    const t = tallyVotes(['approve', 'approve'])
    expect(t.quorumMet).toBe(false)
    expect(t.passes).toBe(false)
  })
  it('passes with 3 approvals (quorum + 100% >= two-thirds)', () => {
    const t = tallyVotes(['approve', 'approve', 'approve'])
    expect(t.quorumMet).toBe(true)
    expect(t.twoThirdsMet).toBe(true)
    expect(t.passes).toBe(true)
  })
  it('two-thirds excludes abstains from the ratio but abstains count toward quorum', () => {
    // 4 votes cast (quorum met); ratio over approve+reject = 2 approve / 1 reject = 2/3 -> ceil(3*2/3)=2, met
    const t = tallyVotes(['approve', 'approve', 'reject', 'abstain'])
    expect(t.cast).toBe(4)
    expect(t.quorumMet).toBe(true)
    expect(t.twoThirdsMet).toBe(true)
    expect(t.passes).toBe(true)
  })
  it('fails two-thirds when approvals fall short of ceil(2/3 of decisive votes)', () => {
    // 3 cast (quorum met), 2 approve / 1 reject? that's 2/3 -> passes. Use 3 approve 2 reject = 3/5, ceil(5*2/3)=4, 3<4 fail
    const t = tallyVotes(['approve', 'approve', 'approve', 'reject', 'reject'])
    expect(t.quorumMet).toBe(true)
    expect(t.twoThirdsMet).toBe(false)
    expect(t.passes).toBe(false)
  })
  it('fails when all abstain (no decisive votes) even at quorum', () => {
    const t = tallyVotes(['abstain', 'abstain', 'abstain'])
    expect(t.quorumMet).toBe(true)
    expect(t.twoThirdsMet).toBe(false)
    expect(t.passes).toBe(false)
  })
})

describe('window helpers', () => {
  it('decisionDueDate is 7 days after open', () => {
    const opened = new Date('2026-08-15T00:00:00Z')
    expect(decisionDueDate(opened).toISOString()).toBe('2026-08-22T00:00:00.000Z')
  })
  it('isExpired true only after the due date', () => {
    const due = new Date('2026-08-22T00:00:00Z')
    expect(isExpired(due, new Date('2026-08-21T23:00:00Z'))).toBe(false)
    expect(isExpired(due, new Date('2026-08-22T00:00:01Z'))).toBe(true)
  })
  it('QUORUM_FLOOR is 3', () => { expect(QUORUM_FLOOR).toBe(3) })
})

describe('isCaseResolvable', () => {
  it('is resolvable only when status is open', () => {
    expect(isCaseResolvable('open')).toBe(true)
  })
  it('is not resolvable once resolved/expired/anything else', () => {
    expect(isCaseResolvable('resolved')).toBe(false)
    expect(isCaseResolvable('expired')).toBe(false)
    expect(isCaseResolvable('')).toBe(false)
  })
})

describe('cooldownUntil', () => {
  it('adds N days to now', () => {
    const now = new Date('2026-08-15T00:00:00Z')
    expect(cooldownUntil(7, now).toISOString()).toBe('2026-08-22T00:00:00.000Z')
  })
  it('handles a single day', () => {
    const now = new Date('2026-08-15T12:00:00Z')
    expect(cooldownUntil(1, now).toISOString()).toBe('2026-08-16T12:00:00.000Z')
  })
})
