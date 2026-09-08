import { describe, it, expect, vi } from 'vitest'
import { processPayment } from './process-payment'
import type { Ipn } from './paypal-ipn'

const baseIpn: Ipn = { txnId: 'T1', email: 'petehpray@yahoo.com', firstName: 'Peter', lastName: 'Pray', amount: 40, status: 'completed', txnType: 'web_accept', noteEmails: [] }
function deps(over: Partial<Parameters<typeof processPayment>[1]> = {}) {
  return {
    readMembers: async () => [{ rowNumber: 11, tab: 'current' as const, name: 'Peter Pray', emails: ['petehpray@gmail.com'], expires: null }],
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
    expect(d.queuePending).toHaveBeenCalledWith(baseIpn, [{ rowNumber: 11, tab: 'current' }])
    expect(d.appendNew).not.toHaveBeenCalled()   // the bug that was: NO new duplicate row
    expect(d.sendEmail).toHaveBeenCalled()         // soft finalizing ack
  })
  it('name-review candidate on the LAPSED tab -> queuePending carries tab: "lapsed" (not just a bare row number)', async () => {
    const d = deps({ readMembers: async () => [{ rowNumber: 11, tab: 'lapsed' as const, name: 'Peter Pray', emails: ['petehpray@gmail.com'], expires: null }] })
    const r = await processPayment(baseIpn, d)
    expect(r.outcome).toBe('review')
    expect(d.queuePending).toHaveBeenCalledWith(baseIpn, [{ rowNumber: 11, tab: 'lapsed' }])
  })
  it('exact email match -> renewal writes the existing row, resets reminders', async () => {
    const d = deps({ readMembers: async () => [{ rowNumber: 11, tab: 'current', name: 'Peter Pray', emails: ['petehpray@yahoo.com'], expires: null }] })
    const r = await processPayment(baseIpn, d)
    expect(r.outcome).toBe('renewed')
    expect(d.writeCells).toHaveBeenCalledWith('current', 11, expect.objectContaining({ 'Current': 'Yes', 'Last Reminder Sent': '', 'Reminder Count': '0' }))
  })
  it('early renewal (30 days still remaining) -> credits the remaining days onto the new Expires, and the email reflects the credit', async () => {
    const now = new Date('2026-09-08T00:00:00Z')
    const futureExpires = new Date(now.getTime() + 30 * 86400000) // 30 days out
    const expiresStr = `${futureExpires.getUTCMonth() + 1}/${futureExpires.getUTCDate()}/${futureExpires.getUTCFullYear()}`
    const d = deps({
      readMembers: async () => [{ rowNumber: 11, tab: 'current', name: 'Peter Pray', emails: ['petehpray@yahoo.com'], expires: expiresStr }],
      now,
    })
    const r = await processPayment(baseIpn, d)
    expect(r.outcome).toBe('renewed')

    const expectedNewExpires = new Date(now.getTime() + (365 + 30) * 86400000)
    const expectedStr = `${expectedNewExpires.getUTCMonth() + 1}/${expectedNewExpires.getUTCDate()}/${expectedNewExpires.getUTCFullYear()}`
    expect(d.writeCells).toHaveBeenCalledWith('current', 11, expect.objectContaining({ Expires: expectedStr }))

    // Renewal email must reflect the credited days (renderRenewal's daysCredited line).
    expect(d.sendEmail).toHaveBeenCalled()
    const [, , html] = (d.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(html).toContain('Days credited for renewing early: 30')
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
  it('$65 Couple new-member payment -> appends the primary row AND a partner placeholder row (NEEDS UPDATE sentinel)', async () => {
    const coupleIpn: Ipn = { ...baseIpn, amount: 65 }
    const d = deps({ readMembers: async () => [] }) // no existing rows -> 'none' match -> new member
    const r = await processPayment(coupleIpn, d)
    expect(r.outcome).toBe('new')
    expect(d.appendNew).toHaveBeenCalledTimes(2)
    // 1st call: the primary (paying) member's row.
    expect(d.appendNew).toHaveBeenNthCalledWith(1, expect.objectContaining({ Name: 'Peter Pray', Tier: 'Couple', 'Email Address': 'petehpray@yahoo.com' }))
    // 2nd call: the partner placeholder — findPartnerPlaceholders (roster.ts) keys ONLY on
    // 'Email Address' === 'NEEDS UPDATE', so that sentinel must match exactly.
    expect(d.appendNew).toHaveBeenNthCalledWith(2, expect.objectContaining({ Name: '[Partner of Peter Pray - UPDATE]', Tier: 'Couple', 'Email Address': 'NEEDS UPDATE' }))
  })
  it('$40 Single new-member payment -> appends only ONE row (no partner placeholder)', async () => {
    const d = deps({ readMembers: async () => [] })
    const r = await processPayment(baseIpn, d)
    expect(r.outcome).toBe('new')
    expect(d.appendNew).toHaveBeenCalledTimes(1)
  })
})
