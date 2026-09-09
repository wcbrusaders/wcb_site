import { describe, it, expect, vi } from 'vitest'
import { receiverIsClub, recordContribution } from './contributions'

describe('receiverIsClub', () => {
  it('fails open (returns true) when the club email is unset (null)', () => {
    expect(receiverIsClub('anyone@example.com', { clubEmail: null })).toBe(true)
  })

  it('fails open (returns true) when the club email is an empty string', () => {
    expect(receiverIsClub('anyone@example.com', { clubEmail: '' })).toBe(true)
  })

  it('matches case-insensitively when the club email is set', () => {
    expect(receiverIsClub('CLUB@X.COM', { clubEmail: 'club@x.com' })).toBe(true)
  })

  it('rejects a mismatched receiver when the club email is set', () => {
    expect(receiverIsClub('evil@y.com', { clubEmail: 'club@x.com' })).toBe(false)
  })

  it('rejects an empty receiver when the club email is set', () => {
    expect(receiverIsClub('', { clubEmail: 'club@x.com' })).toBe(false)
  })
})

// Fake db exposing just the two models/methods recordContribution touches,
// mirroring the fakeDb pattern in poll-shipments.test.ts.
function fakeDb(opts: { existingTxn?: any; comp?: any } = {}) {
  const created: any[] = []
  return {
    created,
    contribution: {
      findUnique: vi.fn(async () => opts.existingTxn ?? null),
      create: vi.fn(async (args: any) => {
        created.push(args)
        return { id: 'c1', ...args.data }
      }),
    },
    competition: {
      findUnique: vi.fn(async () => opts.comp ?? null),
    },
  }
}

describe('recordContribution', () => {
  const input = {
    compId: 'comp1',
    txnId: 'txn1',
    amount: 15,
    payerName: 'Jane Doe',
    payerEmail: 'jane@example.com',
  }

  it('creates a Contribution row and returns recorded for a new txn + known comp', async () => {
    const db = fakeDb({ comp: { id: 'comp1' } })
    const result = await recordContribution(input, { db: db as any })
    expect(db.contribution.create).toHaveBeenCalledTimes(1)
    expect(db.created[0].data).toEqual({
      competitionId: 'comp1',
      txnId: 'txn1',
      amount: 15,
      payerName: 'Jane Doe',
      payerEmail: 'jane@example.com',
    })
    expect(result).toEqual({ outcome: 'recorded' })
  })

  it('does not create a row and returns duplicate when the txnId already exists', async () => {
    const db = fakeDb({ existingTxn: { id: 'existing', txnId: 'txn1' }, comp: { id: 'comp1' } })
    const result = await recordContribution(input, { db: db as any })
    expect(db.contribution.create).not.toHaveBeenCalled()
    expect(result).toEqual({ outcome: 'duplicate' })
  })

  it('does not create a row and returns unknown-comp when the competition does not exist', async () => {
    const db = fakeDb({ comp: null })
    const result = await recordContribution(input, { db: db as any })
    expect(db.contribution.create).not.toHaveBeenCalled()
    expect(result).toEqual({ outcome: 'unknown-comp' })
  })

  // A contribution's amount feeds the member-visible "Chipped in so far" total,
  // so a $0.00 (payer edited the amount to zero) or NaN (malformed mc_gross that
  // parseFloat couldn't read) payment must NOT be recorded — it would pollute
  // the total with a no-op / garbage row.
  it.each([
    ['zero', 0],
    ['negative', -5],
    ['NaN', NaN],
  ])('does not create a row and returns invalid-amount for a %s amount', async (_label, amount) => {
    const db = fakeDb({ comp: { id: 'comp1' } })
    const result = await recordContribution({ ...input, amount }, { db: db as any })
    expect(db.contribution.create).not.toHaveBeenCalled()
    expect(result).toEqual({ outcome: 'invalid-amount' })
  })
})
