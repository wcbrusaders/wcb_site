import { google } from 'googleapis'
import { prisma } from './db'

export type MemberRecord = {
  emailAddress: string | null
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
  membershipState: string
}

export type GateResult = { ok: false } | { ok: true; member: MemberRecord }

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// Pure gate consumed by the members-area layout: 'interim' (board froze access
// pending a case decision) and 'banned' (removed by board vote) both deny
// access. Anything else — 'active', null, undefined (no status set yet) — is
// allowed. Must default OPEN for unset/unknown status so existing members
// aren't locked out by this field being introduced.
export function isAccessBlocked(status: string | null | undefined): boolean {
  return status === 'interim' || status === 'banned'
}

// Time-aware variant used by the members-area layout gate. A cooldown
// (time-limited suspension) sets Member.statusUntil alongside an 'interim'/
// 'banned' status; once `now` passes that date the suspension has elapsed
// and access is restored even though the DB row hasn't been written back to
// 'active' yet (that happens lazily via reinstateMemberAction or the next
// sync). statusUntil === null means no auto-expiry (indefinite / board must
// reinstate manually).
export function isAccessBlockedNow(
  status: string | null | undefined,
  statusUntil: Date | null | undefined,
  now: Date,
): boolean {
  if (!isAccessBlocked(status)) return false
  if (statusUntil && now.getTime() > statusUntil.getTime()) return false
  return true
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

export type MapSheetRowOpts = { tab?: 'current' | 'lapsed' }

export function mapSheetRow(headers: string[], row: string[], opts: MapSheetRowOpts = {}): MemberRecord | null {
  const tab = opts.tab ?? 'current'
  const email = cell(headers, row, 'Email Address')
  const name = cell(headers, row, 'Name') || null
  // Spacer rows (no name AND no email) carry no member data — skip them.
  // This is distinct from an email-less HONORARY member, who has a name and
  // must NOT be dropped (see task-2 brief: "stop dropping email-less honorary
  // members"). Only rows with neither identifier are considered blank spacers.
  if (!email && !name) return null

  const g = cell(headers, row, 'Google Email')
  const p = cell(headers, row, 'Partner Email')
  const exp = cell(headers, row, 'Expires')
  const tier = cell(headers, row, 'Tier') || null

  const current = tab === 'lapsed' ? false : truthy(cell(headers, row, 'Current'))
  const membershipState =
    tab === 'lapsed'
      ? 'lapsed'
      : tier?.toLowerCase() === 'honorary'
        ? 'honorary'
        : 'active'

  return {
    emailAddress: email ? normalizeEmail(email) : null,
    googleEmail: g ? normalizeEmail(g) : null,
    name,
    tier,
    current,
    isBoard: truthy(cell(headers, row, 'Board Member')),
    role: cell(headers, row, 'Role') || null,
    partnerEmail: p ? normalizeEmail(p) : null,
    expires: parseDate(exp),
    joinDate: parseDate(cell(headers, row, 'Join Date')),
    paymentDate: parseDate(cell(headers, row, 'Payment Date')),
    referredBy: cell(headers, row, 'Referred By') || null,
    membershipState,
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

async function realGetTab(tabName: string): Promise<string[][]> {
  if (!SHEET_ID) throw new Error('MEMBER_ROSTER_SHEET_ID not set')
  const sheets = sheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: tabName,
  })
  return (res.data.values ?? []).map((r) => r.map((c) => String(c ?? '')))
}

type FetchAllMembersDeps = {
  getTab?: (tabName: string) => Promise<string[][]>
}

const LAPSED_TAB = 'Lapsed Members'

// Reads BOTH the current-members tab (Sheet1) and the Lapsed Members tab and
// concatenates them, tagging each with the right `tab` so mapSheetRow derives
// current/membershipState correctly (current -> active/honorary per Tier,
// lapsed -> current=false/membershipState='lapsed' regardless of the sheet's
// own 'Current?' column). Unlike fetchAllRosterRows, this is the fn T4's sync
// should use — fetchAllRosterRows stays current-only for its existing callers.
export async function fetchAllMembers(deps: FetchAllMembersDeps = {}): Promise<MemberRecord[]> {
  const getTab = deps.getTab ?? realGetTab

  async function readTab(tabName: string, tab: 'current' | 'lapsed'): Promise<MemberRecord[]> {
    const values = await getTab(tabName)
    if (values.length < 2) return []
    const headers = values[0].map((h) => String(h).trim())
    return values.slice(1)
      .map((r) => mapSheetRow(headers, r.map((c) => String(c ?? '')), { tab }))
      .filter((m): m is MemberRecord => m !== null)
  }

  const [current, lapsed] = await Promise.all([
    readTab(TAB, 'current'),
    readTab(LAPSED_TAB, 'lapsed'),
  ])
  return [...current, ...lapsed]
}

export type PaymentRecord = { date: Date; netDues: number; source: string }

type FetchPaymentsDeps = {
  getTab?: (tabName: string) => Promise<string[][]>
}

const PAYMENTS_TAB = 'Payments'

// Reads the Payments tab (headers: Date, Net Dues, Source). Skips the header
// row plus any row whose date or amount doesn't parse (including fully blank
// rows, which fail the date parse).
export async function fetchPayments(deps: FetchPaymentsDeps = {}): Promise<PaymentRecord[]> {
  const getTab = deps.getTab ?? realGetTab
  const values = await getTab(PAYMENTS_TAB)
  if (values.length < 2) return []
  const headers = values[0].map((h) => String(h).trim())
  const out: PaymentRecord[] = []
  for (const raw of values.slice(1)) {
    const row = raw.map((c) => String(c ?? ''))
    const dateStr = cell(headers, row, 'Date')
    const netDuesStr = cell(headers, row, 'Net Dues')
    const source = cell(headers, row, 'Source')
    const date = parseDate(dateStr)
    if (!date) continue
    const netDues = parseFloat(netDuesStr)
    if (isNaN(netDues)) continue
    out.push({ date, netDues, source })
  }
  return out
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

// syncRoster is membership-state-aware: rows come from fetchAllMembers (T3),
// which concatenates the current-members tab and the Lapsed Members tab, so a
// lapsed member IS "seen" this run (membershipState 'lapsed', current false)
// and must not be confused with a member who vanished from BOTH tabs entirely
// (membershipState 'former' — set by the sweep below).
//
// Email-less honorary members (Member.emailAddress nullable, see schema
// comment) can't be upserted `where: { emailAddress }`. They're matched by
// NAME against existing null-email rows instead: exactly one match -> update
// that row by id; no match -> create; multiple matches -> log a warning and
// update the first (arbitrary-but-deterministic; documented in the T4
// report — avoids crashing on a same-named-honorary edge case rather than
// picking a "cleverer" disambiguation that isn't worth the complexity here).
// They're tracked as seen via a separate `name:<name>` key so the sweep
// doesn't deactivate them.
export async function syncRoster(deps: SyncDeps = {}): Promise<{ synced: number; deactivated: number }> {
  const fetchAll = deps.fetchAll ?? fetchAllMembers
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
  const seenEmails = new Set<string>()
  const seenNameKeys = new Set<string>()

  for (const m of rows) {
    // Defensive: fetchAllMembers/mapSheetRow already drop true blank-spacer
    // rows (no name AND no email), but guard here too rather than trust that
    // invariant holds forever upstream.
    if (!m.emailAddress && !m.name) continue

    const commonFields = {
      googleEmail: m.googleEmail,
      name: m.name,
      tier: m.tier,
      current: m.current,
      isBoard: m.isBoard,
      role: m.role,
      partnerEmail: m.partnerEmail,
      expires: m.expires,
      joinDate: m.joinDate,
      paymentDate: m.paymentDate,
      referredBy: m.referredBy,
      membershipState: m.membershipState,
    }

    if (m.emailAddress) {
      const email = m.emailAddress
      const access = groupSet === null
        ? {}
        : { resourceAccess: groupSet.has(email) || (m.googleEmail ? groupSet.has(m.googleEmail) : false) }
      await db.member.upsert({
        where: { emailAddress: email },
        update: { ...commonFields, ...access },
        create: { emailAddress: email, ...commonFields, ...access },
      })
      seenEmails.add(email)
      synced++
      continue
    }

    // Email-less (honorary) member: match by name against existing null-email rows.
    const name = m.name as string
    const matches = await db.member.findMany({ where: { name, emailAddress: null } })
    if (matches.length > 1) {
      console.warn(`syncRoster: multiple null-email members named "${name}" — updating the first, skipping the rest`, matches.map((x: any) => x.id))
    }
    if (matches.length >= 1) {
      await db.member.update({ where: { id: matches[0].id }, data: { ...commonFields } })
    } else {
      await db.member.create({ data: { emailAddress: null, ...commonFields } })
    }
    seenNameKeys.add(`name:${name}`)
    synced++
  }

  // Sweep: anything in the DB not seen this run (present in neither tab) is
  // genuinely gone — distinct from an explicitly-lapsed member, who WAS seen
  // (via the Lapsed tab) and already carries membershipState 'lapsed'.
  let deactivated = 0

  const existingByEmail = await db.member.findMany({ where: { emailAddress: { not: null } } })
  const toDeactivateEmails = existingByEmail
    .map((e: any) => e.emailAddress as string | null)
    .filter((e): e is string => e != null && !seenEmails.has(e))
  if (toDeactivateEmails.length) {
    const r = await db.member.updateMany({
      where: { emailAddress: { in: toDeactivateEmails } },
      data: { current: false, membershipState: 'former' },
    })
    deactivated += r.count
  }

  // Null-email (honorary) members: no compound key to updateMany on safely by
  // name (names aren't unique), so sweep them individually by id instead.
  const existingNullEmail = await db.member.findMany({ where: { emailAddress: null } })
  for (const e of existingNullEmail as Array<{ id: string; name: string | null }>) {
    const key = e.name ? `name:${e.name}` : null
    if (key && seenNameKeys.has(key)) continue
    await db.member.update({ where: { id: e.id }, data: { current: false, membershipState: 'former' } })
    deactivated++
  }

  return { synced, deactivated }
}

type PaymentSyncDeps = {
  fetchPayments?: () => Promise<PaymentRecord[]>
  db?: typeof prisma
}

// Idempotent sync of the Payments tab into the Payment table. Upserts on the
// (date, netDues, source) compound unique so re-running the sync (e.g. the
// daily cron) never duplicates a row already recorded for that exact
// date+amount+source combination. Kept separate from syncRoster per the
// phase-1 plan — the cron calls both.
export async function syncPayments(deps: PaymentSyncDeps = {}): Promise<{ payments: number }> {
  const fetchPaymentsFn = deps.fetchPayments ?? fetchPayments
  const db = deps.db ?? prisma
  const rows = await fetchPaymentsFn()

  let payments = 0
  for (const p of rows) {
    await db.payment.upsert({
      where: { date_netDues_source: { date: p.date, netDues: p.netDues, source: p.source } },
      create: { date: p.date, netDues: p.netDues, source: p.source },
      update: {},
    })
    payments++
  }
  return { payments }
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
    return { ok: true, member: { emailAddress: e, googleEmail: null, name: 'DEV', tier: null, current: true, isBoard: false, role: null, partnerEmail: null, expires: null, joinDate: null, paymentDate: null, referredBy: null, membershipState: 'active' } }
  }

  try {
    const hit = await db.member.findFirst({
      where: { current: true, OR: [{ emailAddress: e }, { googleEmail: e }] },
    })
    if (hit) return { ok: true, member: hit as MemberRecord }

    // fallback: live Sheet read for a just-added member. Looked up BY email,
    // so a hit always carries that same non-null email back (email-less
    // honorary members can't reach this path since fetchByEmail matches on
    // emailAddress/googleEmail).
    const row = await fetchByEmail(e)
    if (row && row.current && row.emailAddress) {
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
