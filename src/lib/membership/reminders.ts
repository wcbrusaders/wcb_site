const DAY = 86400000

// Mirrors tiers.ts's M/D/YYYY parse style (UTC date math, no locale/timezone
// drift). A date string that doesn't parse as M/D/YYYY yields null.
function parse(s: string): Date | null {
  if (!s) return null
  const p = s.split('/')
  if (p.length !== 3) return null
  const [mo, da, yr] = p.map((x) => parseInt(x, 10))
  if (!mo || !da || !yr) return null
  return new Date(Date.UTC(yr, mo - 1, da))
}

function daysBetweenUTC(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY)
}

export type ReminderRow = {
  rowNumber: number
  name: string
  email: string
  expires: string
  lastReminder: string
  reminderCount: number
  optOut: string
}

export type DueReminder = { row: ReminderRow; phase: 'pre' | 'post'; daysLeft: number }

// Mirrors the Google Apps Script's checkMemberships reminder rules exactly:
// PRE reminders fire at exactly 14/7/2 days BEFORE expiry; POST reminders
// fire at exactly 2/4 days AFTER expiry. A row opted out (Opt Out ===
// 'STOP' or 'Yes') never fires. A row reminded <2 days ago (spacing guard)
// never fires again this run, even if it would otherwise hit one of the
// exact-day marks — this is what prevents double-dunning if the cron runs
// more than once in a short window.
const PRE_DAYS = [14, 7, 2]
const POST_DAYS = [2, 4]
const MIN_SPACING_DAYS = 2

function isOptedOut(optOut: string): boolean {
  return optOut === 'STOP' || optOut === 'Yes'
}

function isRecentlyReminded(lastReminder: string, now: Date): boolean {
  const last = parse(lastReminder)
  if (!last) return false
  return daysBetweenUTC(last, now) < MIN_SPACING_DAYS
}

export function dueReminders(rows: ReminderRow[], now: Date): DueReminder[] {
  const out: DueReminder[] = []
  for (const row of rows) {
    const expires = parse(row.expires)
    if (!expires) continue
    if (isOptedOut(row.optOut)) continue
    if (isRecentlyReminded(row.lastReminder, now)) continue

    // Positive = days until expiry (pre), negative = days since expiry (post).
    const daysUntil = daysBetweenUTC(now, expires)

    if (daysUntil > 0 && PRE_DAYS.includes(daysUntil)) {
      out.push({ row, phase: 'pre', daysLeft: daysUntil })
      continue
    }
    const daysSince = -daysUntil
    if (daysSince > 0 && POST_DAYS.includes(daysSince)) {
      out.push({ row, phase: 'post', daysLeft: daysSince })
    }
  }
  return out
}

// Mirrors the Apps Script's daysBeforeMovingToLapsed = 7: a member more than
// 7 days past expiry is due to move from the current tab to Lapsed (and
// receive the re-engagement email). Opt Out does NOT suppress lapsing —
// only reminders are opt-out-able; lapsing is a roster-state transition, not
// a marketing email.
const DAYS_BEFORE_LAPSED = 7

export function dueLapses(rows: ReminderRow[], now: Date): ReminderRow[] {
  const out: ReminderRow[] = []
  for (const row of rows) {
    const expires = parse(row.expires)
    if (!expires) continue
    const daysSince = daysBetweenUTC(expires, now)
    if (daysSince > DAYS_BEFORE_LAPSED) out.push(row)
  }
  return out
}
