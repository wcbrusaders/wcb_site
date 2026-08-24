// One-off: enumerate every tab in the member-roster workbook — titles, size, and
// header row only (no member PII values) — so we can design the admin-metrics port.
import { google } from 'googleapis'
import fs from 'node:fs'

// minimal .env loader (avoid extra deps)
for (const raw of fs.readFileSync('.env', 'utf8').split('\n')) {
  const line = raw.replace(/\r$/, '')
  const eq = line.indexOf('=')
  if (eq <= 0 || line.startsWith('#')) continue
  const key = line.slice(0, eq).trim()
  let val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  process.env[key] = val
}
if (!process.env.MEMBER_ROSTER_SHEET_ID) { console.error('SHEET ID still empty after load'); process.exit(1) }
console.error('loaded sheet id prefix:', process.env.MEMBER_ROSTER_SHEET_ID.slice(0, 6))

const oauth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
oauth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
const sheets = google.sheets({ version: 'v4', auth: oauth })
const id = process.env.MEMBER_ROSTER_SHEET_ID

const meta = await sheets.spreadsheets.get({ spreadsheetId: id })
console.log('WORKBOOK:', meta.data.properties.title)
console.log('TABS:', meta.data.sheets.length)

for (const s of meta.data.sheets) {
  const t = s.properties.title
  const rows = s.properties.gridProperties?.rowCount
  const cols = s.properties.gridProperties?.columnCount
  console.log(`\n=== TAB: ${JSON.stringify(t)}  (grid ${rows}x${cols}) ===`)
  try {
    // grab first 2 rows to show header shape without dumping data
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${t}!1:2` })
    const vals = r.data.values ?? []
    console.log('  header:', JSON.stringify(vals[0] ?? []))
    // also count non-empty data rows (col A) to see real size
    const rc = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${t}!A:A` })
    const nonEmpty = (rc.data.values ?? []).filter((row) => (row[0] ?? '').toString().trim()).length
    console.log('  ~non-empty rows in col A:', nonEmpty)
  } catch (e) {
    console.log('  (could not read:', e.message, ')')
  }
}
