import { describe, it, expect, vi } from 'vitest'
import { resolvePendingCore } from '@/app/members/admin/membership/_actions'

describe('resolvePendingCore', () => {
  it('rejects when actor is not board', async () => {
    const r = await resolvePendingCore(null as never, 'p1', { kind: 'new' }, {} as never)
    expect(r).toEqual({ ok: false, reason: 'forbidden' })
  })
  it('confirm renews the chosen row AND stores the payer email as an alias', async () => {
    const writeCells = vi.fn(async () => {})
    const deps = { getPending: async () => ({ payload: { email: 'petehpray@yahoo.com', amount: 40 }, candidateRows: [11] }), writeCells, appendNew: vi.fn(), sendEmail: vi.fn(), markResolved: vi.fn(async () => {}), now: new Date('2026-09-08T00:00:00Z'), readRow: async () => ({ expires: '10/8/2026', paymentEmails: '' }) }
    const r = await resolvePendingCore({ memberId: 'm', email: 'o@x.com' }, 'p1', { kind: 'confirm', rowNumber: 11, addAlias: 'petehpray@yahoo.com' }, deps as never)
    expect(r.ok).toBe(true)
    expect(writeCells).toHaveBeenCalledWith('current', 11, expect.objectContaining({ 'Current': 'Yes' }))
    expect(writeCells).toHaveBeenCalledWith('current', 11, expect.objectContaining({ 'Payment Emails': expect.stringContaining('petehpray@yahoo.com') }))
  })
})
