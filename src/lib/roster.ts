import { google } from 'googleapis'
import { prisma } from './db'

export type MemberRecord = {
  emailAddress: string
  googleEmail: string | null
  name: string | null
  tier: string | null
  current: boolean
  isBoard: boolean
  role: string | null
  partnerEmail: string | null
  expires: Date | null
  joinDate: Date | null
  paymentDate: Date | null
  referredBy: string | null
}

export type GateResult = { ok: false } | { ok: true; member: MemberRecord }

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function truthy(v: string | undefined): boolean {
  if (!v) return false
  return ['true','yes','y','1','x','current'].includes(v.trim().toLowerCase())
}

function cell(headers: string[], row: string[], name: string): string {
  const i = headers.indexOf(name)
  return i >= 0 ? (row[i] ?? '').trim() : ''
}

function parseDate(v: string): Date | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

export function mapSheetRow(headers: string[], row: string[]): MemberRecord | null {
  const email = cell(headers, row, 'Email Address')
  if (!email) return null
  const g = cell(headers, row, 'Google Email')
  const p = cell(headers, row, 'Partner Email')
  const exp = cell(headers, row, 'Expires')
  return {
    emailAddress: normalizeEmail(email),
    googleEmail: g ? normalizeEmail(g) : null,
    name: cell(headers, row, 'Name') || null,
    tier: cell(headers, row, 'Tier') || null,
    current: truthy(cell(headers, row, 'Current')),
    isBoard: truthy(cell(headers, row, 'Board Member')),
    role: cell(headers, row, 'Role') || null,
    partnerEmail: p ? normalizeEmail(p) : null,
    expires: parseDate(exp),
    joinDate: parseDate(cell(headers, row, 'Join Date')),
    paymentDate: parseDate(cell(headers, row, 'Payment Date')),
    referredBy: cell(headers, row, 'Referred By') || null,
  }
}

const SHEET_ID = process.env.MEMBER_ROSTER_SHEET_ID
const TAB = 'Sheet1'

function sheetsClient() {
  const oauth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  oauth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.sheets({ version: 'v4', auth: oauth })
}

export async function fetchAllRosterRows(): Promise<MemberRecord[]> {
  if (!SHEET_ID) throw new Error('MEMBER_ROSTER_SHEET_ID not set')
  const sheets = sheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: TAB,
  })
  const values = res.data.values ?? []
  if (values.length < 2) return []
  const headers = values[0].map((h) => String(h).trim())
  return values.slice(1)
    .map((r) => mapSheetRow(headers, r.map((c) => String(c ?? ''))))
    .filter((m): m is MemberRecord => m !== null)
}

export async function fetchRosterRowByEmail(email: string): Promise<MemberRecord | null> {
  const target = normalizeEmail(email)
  const rows = await fetchAllRosterRows()
  return rows.find((m) => m.emailAddress === target || m.googleEmail === target) ?? null
}

const ACCESS_GROUP = process.env.MEMBER_ACCESS_GROUP_EMAIL

// Reuses the bot's admin.directory.group creds (domain-wide delegation).
// GOOGLE_ADMIN_SUBJECT = the Workspace admin to impersonate (as the bot does).
export async function fetchAccessGroupMembers(): Promise<Set<string>> {
  if (!ACCESS_GROUP) throw new Error('MEMBER_ACCESS_GROUP_EMAIL not set')
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  const dir = google.admin({ version: 'directory_v1', auth })
  const out = new Set<string>()
  let pageToken: string | undefined
  do {
    const res = await dir.members.list({ groupKey: ACCESS_GROUP, maxResults: 200, pageToken })
    for (const m of res.data.members ?? []) {
      if (m.email) out.add(normalizeEmail(m.email))
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return out
}

type SyncDeps = {
  fetchAll?: () => Promise<MemberRecord[]>
  fetchGroupMembers?: () => Promise<Set<string>>
  db?: typeof prisma
}

export async function syncRoster(deps: SyncDeps = {}): Promise<{ synced: number; deactivated: number }> {
  const fetchAll = deps.fetchAll ?? fetchAllRosterRows
  const fetchGroupMembers = deps.fetchGroupMembers ?? fetchAccessGroupMembers
  const db = deps.db ?? prisma
  const rows = await fetchAll()

  let groupSet: Set<string> | null = null
  try {
    groupSet = await fetchGroupMembers()
  } catch (e) {
    console.error('access group read failed (resourceAccess left unchanged):', e)
    groupSet = null
  }

  let synced = 0
  const seen = new Set<string>()
  for (const m of rows) {
    const access = groupSet === null
      ? {}
      : { resourceAccess: groupSet.has(m.emailAddress) || (m.googleEmail ? groupSet.has(m.googleEmail) : false) }
    await db.member.upsert({
      where: { emailAddress: m.emailAddress },
      update: { googleEmail: m.googleEmail, name: m.name, tier: m.tier, current: m.current, isBoard: m.isBoard, role: m.role, partnerEmail: m.partnerEmail, expires: m.expires, joinDate: m.joinDate, paymentDate: m.paymentDate, referredBy: m.referredBy, ...access },
      create: { emailAddress: m.emailAddress, googleEmail: m.googleEmail, name: m.name, tier: m.tier, current: m.current, isBoard: m.isBoard, role: m.role, partnerEmail: m.partnerEmail, expires: m.expires, joinDate: m.joinDate, paymentDate: m.paymentDate, referredBy: m.referredBy, ...access },
    })
    seen.add(m.emailAddress)
    synced++
  }
  const existing = await db.member.findMany({ select: { emailAddress: true } })
  const toDeactivate = existing.map((e) => e.emailAddress).filter((e) => !seen.has(e))
  let deactivated = 0
  if (toDeactivate.length) {
    const r = await db.member.updateMany({ where: { emailAddress: { in: toDeactivate }, current: true }, data: { current: false } })
    deactivated = r.count
  }
  return { synced, deactivated }
}

export function validateSecondaryEmail(email: string): { ok: true; value: string } | { ok: false; reason: string } {
  const v = normalizeEmail(email)
  if (!v) return { ok: false, reason: 'Email is required.' }
  if (!v.includes('@') || v.startsWith('@') || v.endsWith('@')) return { ok: false, reason: 'That does not look like an email.' }
  return { ok: true, value: v }
}

type WriteDeps = {
  // Raw sheet values INCLUDING the header row (row 0 = headers, no filtering/compaction).
  fetchRawRows?: () => Promise<string[][]>
  writeCell?: (rowNumber: number, column: string, value: string) => Promise<void>
}

async function realFetchRawRows(): Promise<string[][]> {
  if (!SHEET_ID) throw new Error('MEMBER_ROSTER_SHEET_ID not set')
  const sheets = sheetsClient()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: TAB })
  return (res.data.values ?? []).map((r) => r.map((c) => String(c ?? '')))
}

// Writes `value` into `column` for the row whose 'Email Address' cell matches memberEmail.
//
// IMPORTANT: the physical sheet row is resolved by scanning the RAW sheet values directly
// (not via fetchAllRosterRows()'s filtered MemberRecord[]). fetchAllRosterRows() drops any
// row with a blank Email Address via mapSheetRow -> filter(m => m !== null), which COMPACTS
// indices. If an email-less spacer row sits above the target row, an index computed against
// the filtered array no longer corresponds to the correct physical row, and a write would
// land on the WRONG member's cell. Scanning raw rows avoids that entirely.
export async function setRosterField(
  memberEmail: string,
  column: 'Google Email' | 'Partner Email',
  value: string,
  deps: WriteDeps = {},
): Promise<{ ok: boolean; reason?: string }> {
  const fetchRawRows = deps.fetchRawRows ?? realFetchRawRows
  const target = normalizeEmail(memberEmail)
  const rawRows = await fetchRawRows()
  if (rawRows.length < 2) return { ok: false, reason: 'Member not found.' }

  const headers = rawRows[0].map((h) => String(h).trim())
  const emailColIdx = headers.indexOf('Email Address')
  if (emailColIdx === -1) return { ok: false, reason: 'Member not found.' }

  // Scan raw data rows (index 1..) for the matching email. Physical (1-based) sheet row
  // number = raw-array index + 1 (no filtering/compaction involved).
  let rowNumber = -1
  for (let i = 1; i < rawRows.length; i++) {
    const cellVal = (rawRows[i][emailColIdx] ?? '').toString()
    if (cellVal && normalizeEmail(cellVal) === target) {
      rowNumber = i + 1
      break
    }
  }
  if (rowNumber === -1) return { ok: false, reason: 'Member not found.' }

  const colIdx = headers.indexOf(column)
  if (colIdx === -1) return { ok: false, reason: `Column "${column}" not found in roster` }

  const write = deps.writeCell ?? realWriteCell
  await write(rowNumber, column, value)
  return { ok: true }
}

async function realWriteCell(rowNumber: number, column: string, value: string): Promise<void> {
  if (!SHEET_ID) throw new Error('MEMBER_ROSTER_SHEET_ID not set')
  const sheets = sheetsClient()
  // Resolve the column letter from the header row.
  const headerRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!1:1` })
  const headers = (headerRes.data.values?.[0] ?? []).map((h) => String(h).trim())
  const colIdx = headers.indexOf(column)
  if (colIdx === -1) throw new Error(`Column "${column}" not found in roster`)
  const colLetter = String.fromCharCode(65 + colIdx) // A, B, C... (assumes < 26 cols)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!${colLetter}${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  })
}

type GateDeps = {
  db?: typeof prisma
  fetchByEmail?: (email: string) => Promise<MemberRecord | null>
}

export async function isCurrentMember(email: string, deps: GateDeps = {}): Promise<GateResult> {
  const db = deps.db ?? prisma
  const fetchByEmail = deps.fetchByEmail ?? fetchRosterRowByEmail
  const e = normalizeEmail(email)

  // DEV bypass: never honored in production, even if the env var leaks into prod.
  const devList =
    process.env.NODE_ENV !== 'production'
      ? process.env.DEV_ALLOWED_EMAILS?.split(',').map((x) => x.trim().toLowerCase())
      : undefined
  if (devList?.includes(e)) {
    return { ok: true, member: { emailAddress: e, googleEmail: null, name: 'DEV', tier: null, current: true, isBoard: false, role: null, partnerEmail: null, expires: null, joinDate: null, paymentDate: null, referredBy: null } }
  }

  try {
    const hit = await db.member.findFirst({
      where: { current: true, OR: [{ emailAddress: e }, { googleEmail: e }] },
    })
    if (hit) return { ok: true, member: hit as MemberRecord }

    // fallback: live Sheet read for a just-added member
    const row = await fetchByEmail(e)
    if (row && row.current) {
      await db.member.upsert({
        where: { emailAddress: row.emailAddress },
        update: { ...row },
        create: { ...row },
      })
      return { ok: true, member: row }
    }
    return { ok: false }
  } catch (err) {
    console.error('isCurrentMember error (fail-closed):', err)
    return { ok: false }
  }
}
