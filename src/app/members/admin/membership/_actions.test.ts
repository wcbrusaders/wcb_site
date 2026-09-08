import { describe, it, expect, vi } from 'vitest'
import { resolvePendingCore } from '@/app/members/admin/membership/_actions'

describe('resolvePendingCore', () => {
  it('rejects when actor is not board', async () => {
    const r = await resolvePendingCore(null as never, 'p1', { kind: 'new' }, {} as never)
    expect(r).toEqual({ ok: false, reason: 'forbidden' })
  })
  it('confirm renews the chosen row AND stores the payer email as an alias', async () => {
    const writeCells = vi.fn(async () => {})
    const deps = { getPending: async () => ({ payload: { email: 'petehpray@yahoo.com', amount: 40 }, candidateRows: [11] }), writeCells, appendNew: vi.fn(), sendEmail: vi.fn(), markResolved: vi.fn(async () => {}), now: new Date('2026-09-08T00:00:00Z'), readRow: async () => ({ expires: '10/8/2026', paymentEmails: '' }), moveRow: vi.fn() }
    const r = await resolvePendingCore({ memberId: 'm', email: 'o@x.com' }, 'p1', { kind: 'confirm', rowNumber: 11, tab: 'current', addAlias: 'petehpray@yahoo.com' }, deps as never)
    expect(r.ok).toBe(true)
    expect(writeCells).toHaveBeenCalledWith('current', 11, expect.objectContaining({ 'Current': 'Yes' }))
    expect(writeCells).toHaveBeenCalledWith('current', 11, expect.objectContaining({ 'Payment Emails': expect.stringContaining('petehpray@yahoo.com') }))
  })
  it('confirm on a LAPSED candidate REACTIVATES: moves the row to current first, then writes the MOVED row — never a current-tab row of the same number', async () => {
    const writeCells = vi.fn(async () => {})
    const moveRow = vi.fn(async () => 47) // the lapsed row (rowNumber 11) lands at current-tab row 47 after the move
    const readRow = vi.fn(async () => ({ expires: '10/8/2026', paymentEmails: '' }))
    const deps = {
      getPending: async () => ({ payload: { email: 'petehpray@yahoo.com', amount: 40 }, candidateRows: [11] }),
      writeCells, appendNew: vi.fn(), sendEmail: vi.fn(), markResolved: vi.fn(async () => {}),
      now: new Date('2026-09-08T00:00:00Z'), readRow, moveRow,
    }
    const r = await resolvePendingCore(
      { memberId: 'm', email: 'o@x.com' }, 'p1',
      { kind: 'confirm', rowNumber: 11, tab: 'lapsed', addAlias: 'petehpray@yahoo.com' },
      deps as never,
    )
    expect(r.ok).toBe(true)
    // Read must target the LAPSED tab/row (to get the pre-move expires for day-credit).
    expect(readRow).toHaveBeenCalledWith('lapsed', 11)
    // Move happens before any write.
    expect(moveRow).toHaveBeenCalledWith('lapsed', 11, 'current')
    // The write MUST land on the moved row (47), never on current-tab row 11 —
    // that would silently corrupt an unrelated member's row.
    expect(writeCells).toHaveBeenCalledWith('current', 47, expect.objectContaining({ 'Current': 'Yes' }))
    expect(writeCells).not.toHaveBeenCalledWith('current', 11, expect.anything())
  })
})
