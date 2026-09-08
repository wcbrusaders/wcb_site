import { describe, it, expect } from 'vitest'
import { dueReminders, dueLapses, lapsesInSafeDeleteOrder, type ReminderRow } from './reminders'
const NOW = new Date('2026-09-08T00:00:00Z')
const row = (o: Partial<ReminderRow>): ReminderRow => ({ rowNumber: 2, name: 'A', email: 'a@x.com', expires: '', lastReminder: '', reminderCount: 0, optOut: '', ...o })

describe('dueReminders', () => {
  it('fires pre at exactly 7 days out', () => {
    const r = dueReminders([row({ expires: '9/15/2026' })], NOW)
    expect(r).toHaveLength(1); expect(r[0].phase).toBe('pre'); expect(r[0].daysLeft).toBe(7)
  })
  it('fires post at 2 days after expiry', () => {
    const r = dueReminders([row({ expires: '9/6/2026' })], NOW)
    expect(r[0].phase).toBe('post')
  })
  it('skips opted-out + recently-reminded', () => {
    expect(dueReminders([row({ expires: '9/15/2026', optOut: 'STOP' })], NOW)).toHaveLength(0)
    expect(dueReminders([row({ expires: '9/15/2026', lastReminder: '9/7/2026' })], NOW)).toHaveLength(0) // <2 days ago
  })
})
describe('dueLapses', () => {
  it('lapses >7 days past expiry', () => {
    expect(dueLapses([row({ expires: '8/31/2026' })], NOW).map(r => r.rowNumber)).toEqual([2])
    expect(dueLapses([row({ expires: '9/3/2026' })], NOW)).toHaveLength(0) // 5 days, not yet
  })
})

// C1 regression: moveRowToTab physically deletes the source row
// (deleteDimension), which shifts every LOWER row up by one. Processing
// dueLapses' natural (ascending) order means the 1st delete invalidates
// every not-yet-processed lower row's pre-read rowNumber, so the 2nd+
// iteration silently moves/deletes an unrelated member. Descending order
// eliminates the hazard: deleting a higher row never shifts a lower,
// not-yet-processed row.
describe('lapsesInSafeDeleteOrder', () => {
  it('returns rows at 12 and 30 in DESCENDING rowNumber order (30 before 12)', () => {
    const rows = [
      row({ rowNumber: 12, expires: '8/31/2026' }), // 8 days past, due
      row({ rowNumber: 30, expires: '8/20/2026' }), // 19 days past, due
    ]
    const out = lapsesInSafeDeleteOrder(rows, NOW)
    expect(out.map((r) => r.rowNumber)).toEqual([30, 12])
  })

  it('matches dueLapses membership exactly, just reordered', () => {
    const rows = [
      row({ rowNumber: 5, expires: '8/31/2026' }),  // due
      row({ rowNumber: 8, expires: '9/3/2026' }),   // not yet (5 days)
      row({ rowNumber: 20, expires: '8/1/2026' }),  // due
    ]
    const unordered = dueLapses(rows, NOW).map((r) => r.rowNumber)
    const ordered = lapsesInSafeDeleteOrder(rows, NOW).map((r) => r.rowNumber)
    expect(new Set(ordered)).toEqual(new Set(unordered))
    expect(ordered).toEqual([20, 5]) // descending
  })

  it('does not mutate the array dueLapses would have returned (sorts a copy)', () => {
    const rows = [
      row({ rowNumber: 3, expires: '8/1/2026' }),
      row({ rowNumber: 40, expires: '8/1/2026' }),
    ]
    const a = dueLapses(rows, NOW)
    lapsesInSafeDeleteOrder(rows, NOW)
    // dueLapses called fresh again still yields ascending source order
    expect(a.map((r) => r.rowNumber)).toEqual([3, 40])
  })
})

// Regression: the real cron runs at 13:00 UTC (`0 13 * * *`), not midnight.
// `now` at a non-midnight wall-clock time must still be compared to
// `expires`/`lastReminder` (always exact UTC midnight) by CALENDAR day, not
// by a raw millisecond diff — a naive Math.round on the raw diff snaps a
// 7-calendar-day gap down to 6 at a 13:00 offset, firing the reminder a day
// early (or missing the boundary entirely for lapses).
describe('dueReminders / dueLapses at non-midnight cron time (13:00 UTC)', () => {
  const RUN_AT_13Z = new Date('2026-09-08T13:00:00Z')

  it('fires pre at exactly 7 CALENDAR days out even when now is 13:00 UTC', () => {
    const r = dueReminders([row({ expires: '9/15/2026' })], RUN_AT_13Z)
    expect(r).toHaveLength(1)
    expect(r[0].phase).toBe('pre')
    expect(r[0].daysLeft).toBe(7)
  })

  it('does not fire for 8 or 6 calendar days out (only exact 14/7/2 marks)', () => {
    expect(dueReminders([row({ expires: '9/16/2026' })], RUN_AT_13Z)).toHaveLength(0) // 8 days out
    expect(dueReminders([row({ expires: '9/14/2026' })], RUN_AT_13Z)).toHaveLength(0) // 6 days out
  })

  it('lapses at exactly 8 calendar days past expiry but not 7, at 13:00 UTC', () => {
    expect(dueLapses([row({ expires: '8/31/2026' })], RUN_AT_13Z).map(r => r.rowNumber)).toEqual([2]) // 8 days past
    expect(dueLapses([row({ expires: '9/1/2026' })], RUN_AT_13Z)).toHaveLength(0) // 7 days past, not yet
  })
})
