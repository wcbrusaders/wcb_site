import { describe, it, expect, vi } from 'vitest'
import { applyCastVote, applyExecuteRemoval } from './enforcement-actions'

const actor = { memberId: 'm-nate', email: 'nate@wcb.com' }
const caseMeta = { id: 'c1', eligibleBoardIds: ['m-jordan', 'm-nate', 'm-karl'] }

describe('applyCastVote', () => {
  it('rejects a non-board actor (null) without recording', async () => {
    const rec = vi.fn(async () => {})
    const r = await applyCastVote({ saveVote: rec }, null, caseMeta, 'approve')
    expect(r.ok).toBe(false)
    expect(rec).not.toHaveBeenCalled()
  })
  it('rejects a board member who is not eligible on this case (recused/not-on-board)', async () => {
    const rec = vi.fn(async () => {})
    const outsider = { memberId: 'm-outsider', email: 'x@wcb.com' }
    const r = await applyCastVote({ saveVote: rec }, outsider, caseMeta, 'approve')
    expect(r.ok).toBe(false)
    expect(rec).not.toHaveBeenCalled()
  })
  it('records the vote AS THE ACTOR (never a passed-in voter id)', async () => {
    const rec = vi.fn(async () => {})
    const r = await applyCastVote({ saveVote: rec }, actor, caseMeta, 'approve')
    expect(r.ok).toBe(true)
    expect(rec).toHaveBeenCalledWith('c1', 'm-nate', 'approve') // caseId, actor.memberId, vote
  })
})

describe('applyExecuteRemoval', () => {
  it('rejects when the tally has not passed (below quorum)', async () => {
    const ban = vi.fn(async () => {})
    const r = await applyExecuteRemoval({ banMember: ban }, actor, ['approve', 'approve'])
    expect(r.ok).toBe(false)
    expect(ban).not.toHaveBeenCalled()
  })
  it('bans when quorum + two-thirds pass', async () => {
    const ban = vi.fn(async () => {})
    const r = await applyExecuteRemoval({ banMember: ban }, actor, ['approve', 'approve', 'approve'])
    expect(r.ok).toBe(true)
    expect(ban).toHaveBeenCalledOnce()
  })
  it('rejects a null actor', async () => {
    const ban = vi.fn(async () => {})
    const r = await applyExecuteRemoval({ banMember: ban }, null, ['approve', 'approve', 'approve'])
    expect(r.ok).toBe(false)
    expect(ban).not.toHaveBeenCalled()
  })
})
