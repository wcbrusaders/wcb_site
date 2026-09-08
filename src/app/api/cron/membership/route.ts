import { NextResponse } from 'next/server'
import { readReminderRows, writeRosterCells, moveRowToTab } from '@/lib/roster'
import { dueReminders, dueLapses } from '@/lib/membership/reminders'
import { renderReminder, renderReengagement, sendMembershipEmail } from '@/lib/membership/emails'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function firstName(name: string): string {
  return name.split(' ')[0] || name
}

// Placeholder unsubscribe token: base64 of the recipient's email. Good
// enough to satisfy "the link is present and identifies the row" for this
// task — the actual /members/unsubscribe route (out of scope here) will
// define the real token format it wants to honor.
function unsubscribeUrl(email: string): string {
  const token = Buffer.from(email).toString('base64')
  return `https://www.wcbrusaders.com/members/unsubscribe?t=${encodeURIComponent(token)}`
}

function fmtDate(d: Date): string {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const today = fmtDate(now)

  let remindersSent = 0
  let reminderErrors = 0
  let lapsed = 0
  let lapseErrors = 0

  try {
    const rows = await readReminderRows()

    for (const due of dueReminders(rows, now)) {
      try {
        const { subject, html } = renderReminder({
          firstName: firstName(due.row.name),
          expiration: due.row.expires,
          daysLeft: due.daysLeft,
          phase: due.phase,
          unsubscribeUrl: unsubscribeUrl(due.row.email),
        })
        await sendMembershipEmail(due.row.email, subject, html)
        await writeRosterCells('current', due.row.rowNumber, {
          'Last Reminder Sent': today,
          'Reminder Count': String(due.row.reminderCount + 1),
        })
        remindersSent++
      } catch (e) {
        // Fail-soft: one bad row (bad email, sheet write hiccup, etc.) must
        // not abort the whole batch of reminders for everyone else.
        console.error(`membership cron: reminder failed for row ${due.row.rowNumber}:`, e)
        reminderErrors++
      }
    }

    for (const row of dueLapses(rows, now)) {
      try {
        await moveRowToTab('current', row.rowNumber, 'lapsed')
        const { subject, html } = renderReengagement({
          firstName: firstName(row.name),
          unsubscribeUrl: unsubscribeUrl(row.email),
        })
        await sendMembershipEmail(row.email, subject, html)
        lapsed++
      } catch (e) {
        console.error(`membership cron: lapse failed for row ${row.rowNumber}:`, e)
        lapseErrors++
      }
    }

    return NextResponse.json({
      ok: true,
      remindersSent,
      reminderErrors,
      lapsed,
      lapseErrors,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
