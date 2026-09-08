import { describe, it, expect, vi } from 'vitest'
import { processPayment } from './process-payment'
import type { Ipn } from './paypal-ipn'

const baseIpn: Ipn = { txnId: 'T1', email: 'petehpray@yahoo.com', firstName: 'Peter', lastName: 'Pray', amount: 40, status: 'completed', txnType: 'web_accept', noteEmails: [] }
function deps(over: Partial<Parameters<typeof processPayment>[1]> = {}) {
  return {
    readMembers: async () => [{ rowNumber: 11, tab: 'current' as const, name: 'Peter Pray', emails: ['petehpray@gmail.com'] }],
    writeCells: vi.fn(async () => {}), moveRow: vi.fn(async () => 11), appendNew: vi.fn(async () => 99),
    sendEmail: vi.fn(async () => {}), queuePending: vi.fn(async () => {}),
    alreadyProcessed: async () => false, markProcessed: vi.fn(async () => {}), now: new Date('2026-09-08T00:00:00Z'),
    ...over,
  }
}
describe('processPayment', () => {
  it('Peter (yahoo pay, gmail row) -> NAME REVIEW, not a duplicate, sends soft ack', async () => {
    const d = deps()
    const r = await processPayment(baseIpn, d)
    expect(r.outcome).toBe('review')
    expect(d.queuePending).toHaveBeenCalledWith(baseIpn, [11])
    expect(d.appendNew).not.toHaveBeenCalled()   // the bug that was: NO new duplicate row
    expect(d.sendEmail).toHaveBeenCalled()         // soft finalizing ack
  })
  it('exact email match -> renewal writes the existing row, resets reminders', async () => {
    const d = deps({ readMembers: async () => [{ rowNumber: 11, tab: 'current', name: 'Peter Pray', emails: ['petehpray@yahoo.com'] }] })
    const r = await processPayment(baseIpn, d)
    expect(r.outcome).toBe('renewed')
    expect(d.writeCells).toHaveBeenCalledWith('current', 11, expect.objectContaining({ 'Current': 'Yes', 'Last Reminder Sent': '', 'Reminder Count': '0' }))
  })
  it('duplicate txn -> skipped, no writes/emails', async () => {
    const d = deps({ alreadyProcessed: async () => true })
    const r = await processPayment(baseIpn, d)
    expect(r.outcome).toBe('duplicate')
    expect(d.writeCells).not.toHaveBeenCalled(); expect(d.sendEmail).not.toHaveBeenCalled()
  })
  it('unknown amount -> skipped-tier', async () => {
    const r = await processPayment({ ...baseIpn, amount: 12 }, deps())
    expect(r.outcome).toBe('skipped-tier')
  })
})
