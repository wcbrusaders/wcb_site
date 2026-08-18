// Find real Gemini meeting-notes transcripts in the Community Documents Drive
// folder and report their size, so we can pick one to test the extract on.
import { google } from 'googleapis'
import 'dotenv/config'

const o = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
o.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
const drive = google.drive({ version: 'v3', auth: o })

// Drive-wide search for the meeting-notes docs (they're named "... Notes by Gemini" or "Meeting Notes ...")
const terms = ['Notes by Gemini', 'Meeting Notes', 'Monthly Meeting', 'Meeting -']
const seen = new Map()
for (const t of terms) {
  const { data } = await drive.files.list({
    q: `name contains '${t}' and mimeType='application/vnd.google-apps.document' and trashed=false`,
    fields: 'files(id,name,modifiedTime)', pageSize: 30,
    supportsAllDrives: true, includeItemsFromAllDrives: true,
  })
  for (const f of data.files ?? []) seen.set(f.id, f)
}
const docs = [...seen.values()].sort((a, b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''))
console.log('MEETING-NOTES DOCS FOUND:', docs.length)
for (const d of docs) console.log(' -', d.id, '|', (d.modifiedTime || '').slice(0, 10), '|', d.name)

// export the most recent one to a file so we can run the extract on it
if (docs[0]) {
  const exp = await drive.files.export({ fileId: docs[0].id, mimeType: 'text/plain' }, { responseType: 'text' })
  const txt = String(exp.data)
  const fs = await import('node:fs')
  fs.writeFileSync('scripts/_transcript-sample.txt', txt)
  console.log(`\nEXPORTED "${docs[0].name}" -> scripts/_transcript-sample.txt (${txt.length} chars)`)
  console.log('--- first 600 chars ---\n', txt.slice(0, 600))
}
