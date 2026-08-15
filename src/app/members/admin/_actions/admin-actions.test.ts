import { describe, it, expect, vi } from 'vitest'
import { applySecondaryEmail, applyPartner } from './admin-actions'
import type { AuditEntry } from '@/lib/audit'

const actor = { memberId: 'm-actor', email: 'jordan@wcb.com' }

function deps() {
  return {
    setRosterField: vi.fn(async () => ({ ok: true as const })),
    recordAudit: vi.fn(async (_e: AuditEntry) => {}),
  }
}

describe('applySecondaryEmail', () => {
  it('rejects when actor is not board (null actor)', async () => {
    const d = deps()
    const r = await applySecondaryEmail(d, null, 'jane@x.com', 'Jane', 'jane2@x.com')
    expect(r.ok).toBe(false)
    expect(d.setRosterField).not.toHaveBeenCalled()
    expect(d.recordAudit).not.toHaveBeenCalled()
  })
  it('rejects an invalid email without writing', async () => {
    const d = deps()
    const r = await applySecondaryEmail(d, actor, 'jane@x.com', 'Jane', 'notanemail')
    expect(r.ok).toBe(false)
    expect(d.setRosterField).not.toHaveBeenCalled()
  })
  it('writes the normalized email and records an audit entry when board', async () => {
    const d = deps()
    const r = await applySecondaryEmail(d, actor, 'jane@x.com', 'Jane', ' Jane2@X.com ')
    expect(r.ok).toBe(true)
    expect(d.setRosterField).toHaveBeenCalledWith('jane@x.com', 'Google Email', 'jane2@x.com')
    expect(d.recordAudit).toHaveBeenCalledOnce()
    const entry = d.recordAudit.mock.calls[0][0]
    expect(entry.action).toBe('set-secondary-email')
    expect(entry.actorEmail).toBe('jordan@wcb.com')
    expect(entry.targetLabel).toBe('Jane')
  })
})

describe('applyPartner', () => {
  it('rejects when actor is not board (null actor)', async () => {
    const d = deps()
    const r = await applyPartner(d, null, 'jane@x.com', 'Jane', 'partner@x.com')
    expect(r.ok).toBe(false)
    expect(d.setRosterField).not.toHaveBeenCalled()
    expect(d.recordAudit).not.toHaveBeenCalled()
  })
  it('rejects an invalid email without writing', async () => {
    const d = deps()
    const r = await applyPartner(d, actor, 'jane@x.com', 'Jane', 'notanemail')
    expect(r.ok).toBe(false)
    expect(d.setRosterField).not.toHaveBeenCalled()
  })
  it('writes the normalized partner email and records an audit entry when board', async () => {
    const d = deps()
    const r = await applyPartner(d, actor, 'jane@x.com', 'Jane', ' Partner2@X.com ')
    expect(r.ok).toBe(true)
    expect(d.setRosterField).toHaveBeenCalledWith('jane@x.com', 'Partner Email', 'partner2@x.com')
    expect(d.recordAudit).toHaveBeenCalledOnce()
    const entry = d.recordAudit.mock.calls[0][0]
    expect(entry.action).toBe('set-partner')
    expect(entry.actorEmail).toBe('jordan@wcb.com')
    expect(entry.targetLabel).toBe('Jane')
  })
})
