import { describe, it, expect } from 'vitest'
import { dueReminders, dueLapses, type ReminderRow } from './reminders'
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
