import { describe, it, expect, vi } from 'vitest'
import { resolvePendingCore, sendDiscordNudgeCore } from '@/app/members/admin/membership/_actions'

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

// sendDiscordNudgeCore: board-gated, pure-core (deps-injected) blast that
// emails every current/unlinked/not-opted-out member the join/link nudge.

describe('sendDiscordNudgeCore', () => {
  const row = (o: Partial<{ name: string; email: string; optOut: string; googleEmail: string; partnerEmail: string }> = {}) => ({
    rowNumber: 2, name: 'Jane', email: 'jane@x.com', expires: '', lastReminder: '', reminderCount: 0, optOut: '',
    googleEmail: '', partnerEmail: '', ...o,
  })

  it('rejects when actor is not board (never reads the roster or sends anything)', async () => {
    const readRows = vi.fn(async () => [row()])
    const readLinked = vi.fn(async () => ({ linked: new Set<string>(), ok: true }))
    const sendEmail = vi.fn(async () => {})
    const r = await sendDiscordNudgeCore(null, { readRows, readLinked, sendEmail })
    expect(r).toEqual({ ok: false, reason: 'forbidden' })
    expect(readRows).not.toHaveBeenCalled()
    expect(readLinked).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('sends one email per eligible recipient and returns correct counts', async () => {
    const rows = [
      row({ email: 'unlinked@x.com' }),
      row({ email: 'linked@x.com', name: 'Linked' }),
      row({ email: 'optout@x.com', name: 'Optout', optOut: 'STOP' }),
    ]
    const readRows = vi.fn(async () => rows)
    const readLinked = vi.fn(async () => ({ linked: new Set(['linked@x.com']), ok: true }))
    const sendEmail = vi.fn(async () => {})
    const r = await sendDiscordNudgeCore({ memberId: 'm', email: 'board@x.com' }, { readRows, readLinked, sendEmail })
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unreachable')
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail).toHaveBeenCalledWith('unlinked@x.com', expect.stringMatching(/discord/i), expect.stringContaining('discord.gg'))
    expect(r.sent).toBe(1)
    expect(r.skippedLinked).toBe(1)
    expect(r.skippedOptOut).toBe(1)
    expect(r.linkTableRead).toBe('ok')
  })

  it('is fail-soft per recipient: one bad send does not abort the rest', async () => {
    const rows = [row({ email: 'bad@x.com' }), row({ email: 'good@x.com' })]
    const readRows = vi.fn(async () => rows)
    const readLinked = vi.fn(async () => ({ linked: new Set<string>(), ok: true }))
    const sendEmail = vi.fn(async (to: string) => {
      if (to === 'bad@x.com') throw new Error('resend down')
    })
    const r = await sendDiscordNudgeCore({ memberId: 'm', email: 'board@x.com' }, { readRows, readLinked, sendEmail })
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unreachable')
    expect(sendEmail).toHaveBeenCalledTimes(2)
    expect(r.sent).toBe(1) // only the good one counted as sent
  })

  it('reports linkTableRead: "failed" when the link-table dep signals failure (treating all as unlinked)', async () => {
    const rows = [row({ email: 'a@x.com' })]
    const readRows = vi.fn(async () => rows)
    // readLinked signals failure via the linkTableRead flag rather than throwing —
    // the underlying readDiscordLinkedEmails is itself already fail-soft (see
    // roster.test.ts), so this dep reports whether that fail-soft path was hit.
    const readLinked = vi.fn(async (): Promise<{ linked: Set<string>; ok: boolean }> => ({ linked: new Set(), ok: false }))
    const sendEmail = vi.fn(async () => {})
    const r = await sendDiscordNudgeCore({ memberId: 'm', email: 'board@x.com' }, { readRows, readLinked, sendEmail })
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unreachable')
    expect(r.linkTableRead).toBe('failed')
    expect(r.sent).toBe(1) // still sends -- fail-soft means over-nudge, not error
  })
})
