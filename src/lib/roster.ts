import { google } from 'googleapis'
import { prisma } from './db'
import type { MatchMember } from './membership/match'

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
      // Only transition members NOT already 'former' — otherwise every run
      // re-updates every already-retired member (inflating `deactivated` into a
      // meaningless running total + a no-op write per former member per run).
      // `deactivated` should count genuine drop-offs THIS run.
      where: { emailAddress: { in: toDeactivateEmails }, membershipState: { not: 'former' } },
      data: { current: false, membershipState: 'former' },
    })
    deactivated += r.count
  }

  // Null-email (honorary) members: no compound key to updateMany on safely by
  // name (names aren't unique), so sweep them individually by id instead. Skip
  // ones already 'former' so we don't re-update + re-count them every run.
  const existingNullEmail = await db.member.findMany({ where: { emailAddress: null } })
  for (const e of existingNullEmail as Array<{ id: string; name: string | null; membershipState: string }>) {
    const key = e.name ? `name:${e.name}` : null
    if (key && seenNameKeys.has(key)) continue
    if (e.membershipState === 'former') continue
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

function splitEmails(v: string): string[] {
  return v
    .split(',')
    .map((e) => normalizeEmail(e))
    .filter((e) => e.length > 0)
}

type ReadForMatchingDeps = {
  getTab?: (tabName: string) => Promise<string[][]>
}

// Reads BOTH tabs (mirrors fetchAllMembers's readTab shape) but returns the
// lighter MatchMember projection used by the membership-lifecycle matcher
// (T2): physical rowNumber (1-based, uncompacted — no filtering of blank rows,
// unlike fetchAllRosterRows/fetchAllMembers) + every email column folded into
// one lowercased, blank-dropped array so matchPayment can scan them all
// without knowing the sheet's column layout.
export async function readMembersForMatching(deps: ReadForMatchingDeps = {}): Promise<MatchMember[]> {
  const getTab = deps.getTab ?? realGetTab

  async function readTab(tabName: string, tab: 'current' | 'lapsed'): Promise<MatchMember[]> {
    const values = await getTab(tabName)
    if (values.length < 2) return []
    const headers = values[0].map((h) => String(h).trim())
    const out: MatchMember[] = []
    for (let i = 1; i < values.length; i++) {
      const row = values[i].map((c) => String(c ?? ''))
      const name = cell(headers, row, 'Name') || null
      const email = cell(headers, row, 'Email Address')
      const google = cell(headers, row, 'Google Email')
      const partner = cell(headers, row, 'Partner Email')
      const paymentEmails = cell(headers, row, 'Payment Emails')
      // Skip blank spacer rows (no name and no identifying emails at all) —
      // mirrors mapSheetRow's spacer-row skip so matching never sees them.
      if (!name && !email && !google && !partner && !paymentEmails) continue

      const emails = [
        ...splitEmails(email),
        ...splitEmails(google),
        ...splitEmails(partner),
        ...splitEmails(paymentEmails),
      ]
      // De-dupe while preserving first-seen order (a member can legitimately
      // repeat the same address across columns, e.g. Email Address ==
      // Google Email).
      const uniqueEmails = [...new Set(emails)]

      // Raw 'Expires' cell, carried through uninterpreted so the orchestrator
      // (T7) can credit remaining days on renewal via computeExpiration
      // rather than resetting to a flat 365 days from today.
      const expires = cell(headers, row, 'Expires') || null

      out.push({ rowNumber: i + 1, tab, name, emails: uniqueEmails, expires, paymentEmails })
    }
    return out
  }

  const [current, lapsed] = await Promise.all([
    readTab(TAB, 'current'),
    readTab(LAPSED_TAB, 'lapsed'),
  ])
  return [...current, ...lapsed]
}

export type ReminderRow = {
  rowNumber: number
  name: string
  email: string
  expires: string
  lastReminder: string
  reminderCount: number
  optOut: string
  // Alternate emails (Google Email / Partner Email columns). The reminder cron
  // ignores these; they exist so the Discord-nudge recipient check can test
  // ALL of a member's known emails against the link table (members often link
  // Discord under their Google Email, not the roster's primary Email Address).
  googleEmail: string
  partnerEmail: string
}

type ReadReminderRowsDeps = {
  getTab?: (tabName: string) => Promise<string[][]>
}

// Reads Sheet1 (current-members tab only — the reminder/lapse cron only ever
// acts on rows still in "current"; once moved to Lapsed a row is out of the
// reminder pipeline) and projects the columns the reminders.ts pure logic
// needs: Name/Email Address/Expires/Last Reminder Sent/Reminder Count/Opt
// Out. Mirrors readMembersForMatching's header-driven cell() lookups and
// physical (1-based, uncompacted) rowNumber so writeRosterCells/moveRowToTab
// can address the same row back on Sheet1 directly. Skips blank spacer rows
// (no name and no email), same as mapSheetRow/readMembersForMatching.
export async function readReminderRows(deps: ReadReminderRowsDeps = {}): Promise<ReminderRow[]> {
  const getTab = deps.getTab ?? realGetTab
  const values = await getTab(TAB)
  if (values.length < 2) return []
  const headers = values[0].map((h) => String(h).trim())
  const out: ReminderRow[] = []
  for (let i = 1; i < values.length; i++) {
    const row = values[i].map((c) => String(c ?? ''))
    const name = cell(headers, row, 'Name')
    const email = cell(headers, row, 'Email Address')
    if (!name && !email) continue
    // Couple/Dual partner-placeholder row (see findPartnerPlaceholders):
    // 'Email Address' === 'NEEDS UPDATE' is the sentinel for "no real member
    // here yet". It has Current: Yes + a real Expires, so without this skip
    // it enters dueReminders/dueLapses — Resend rejects the send (caught
    // fail-soft) but it's noisy, and it's an extra row for the lapse loop's
    // descending-rowNumber ordering to walk for no reason.
    if (email.toUpperCase() === 'NEEDS UPDATE') continue

    const reminderCountStr = cell(headers, row, 'Reminder Count')
    const reminderCount = parseInt(reminderCountStr, 10)

    out.push({
      rowNumber: i + 1,
      name,
      email,
      expires: cell(headers, row, 'Expires'),
      lastReminder: cell(headers, row, 'Last Reminder Sent'),
      reminderCount: isNaN(reminderCount) ? 0 : reminderCount,
      optOut: cell(headers, row, 'Opt Out'),
      googleEmail: cell(headers, row, 'Google Email'),
      partnerEmail: cell(headers, row, 'Partner Email'),
    })
  }
  return out
}

function tabName(tab: 'current' | 'lapsed'): string {
  return tab === 'current' ? TAB : LAPSED_TAB
}

type ReadCellDeps = {
  getTab?: (tabName: string) => Promise<string[][]>
}

// Reads a single named-column cell for one physical row. Used by the board
// pending-match resolver (T8) to read the current 'Payment Emails' alias
// value before appending to it — readMembersForMatching folds that column
// into its combined `emails` array (indistinguishable from Email
// Address/Google Email/Partner Email there), so a distinct read needs its
// own header-driven lookup rather than reusing that projection.
export async function readRosterCell(
  tab: 'current' | 'lapsed',
  rowNumber: number,
  column: string,
  deps: ReadCellDeps = {},
): Promise<string> {
  const getTab = deps.getTab ?? realGetTab
  const name = tabName(tab)
  const values = await getTab(name)
  const headers = (values[0] ?? []).map((h) => String(h).trim())
  const colIdx = headers.indexOf(column)
  if (colIdx === -1) return ''
  const row = values[rowNumber - 1]
  return row ? (row[colIdx] ?? '').toString().trim() : ''
}

export type PartnerPlaceholder = { rowNumber: number; tier: string | null; email: string }

type FindPlaceholdersDeps = {
  getTab?: (tabName: string) => Promise<string[][]>
}

// Sentinel for "this row's Name hasn't been replaced with the partner's real
// name yet" — written by process-payment.ts as `[Partner of X - UPDATE]`.
// Matched case-insensitively as a full-string pattern (not a substring test)
// so a real name that happens to contain similar text can't false-positive.
const PARTNER_NAME_SENTINEL_RE = /^\[Partner of .* - UPDATE\]$/i

// Finds Couple/Dual membership rows still awaiting the second person's real
// NAME. The sentinel is the NAME column (`[Partner of X - UPDATE]`), not the
// email — since M2, the partner's Email Address may already be auto-filled
// from the PayPal note (see process-payment.ts's noteEmails handling) while
// the name is still unknown, and that row must keep showing up in this queue
// until a human sets the real name. The row's current Email Address is
// carried through in the result so the completion UI can pre-populate it
// instead of starting blank. Only scans the current-members tab; a lapsed
// placeholder isn't actionable here. Board completes these via
// completePartnerAction (writes Name + Email Address).
export async function findPartnerPlaceholders(deps: FindPlaceholdersDeps = {}): Promise<PartnerPlaceholder[]> {
  const getTab = deps.getTab ?? realGetTab
  const values = await getTab(TAB)
  if (values.length < 2) return []
  const headers = values[0].map((h) => String(h).trim())
  const out: PartnerPlaceholder[] = []
  for (let i = 1; i < values.length; i++) {
    const row = values[i].map((c) => String(c ?? ''))
    const name = cell(headers, row, 'Name')
    if (!PARTNER_NAME_SENTINEL_RE.test(name.trim())) continue
    out.push({
      rowNumber: i + 1,
      tier: cell(headers, row, 'Tier') || null,
      email: cell(headers, row, 'Email Address'),
    })
  }
  return out
}

type WriteCellsDeps = {
  getTab?: (tabName: string) => Promise<string[][]>
  batchWrite?: (writes: Array<{ tabName: string; rowNumber: number; column: string; value: string }>) => Promise<void>
}

async function realBatchWrite(writes: Array<{ tabName: string; rowNumber: number; column: string; value: string }>): Promise<void> {
  if (!SHEET_ID) throw new Error('MEMBER_ROSTER_SHEET_ID not set')
  if (writes.length === 0) return
  const sheets = sheetsClient()
  // Resolve each write's column letter against its own tab's header row
  // (writes may span both Sheet1 and Lapsed Members, whose columns differ).
  const headerCache = new Map<string, string[]>()
  const data: Array<{ range: string; values: string[][] }> = []
  for (const w of writes) {
    let headers = headerCache.get(w.tabName)
    if (!headers) {
      const headerRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${w.tabName}!1:1` })
      headers = (headerRes.data.values?.[0] ?? []).map((h) => String(h).trim())
      headerCache.set(w.tabName, headers)
    }
    const colIdx = headers.indexOf(w.column)
    if (colIdx === -1) throw new Error(`Column "${w.column}" not found in tab "${w.tabName}"`)
    data.push({ range: `${w.tabName}!${columnLetter(colIdx)}${w.rowNumber}`, values: [[w.value]] })
  }
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'RAW', data },
  })
}

// Batch-writes multiple named columns to a single physical row on one tab in
// one Sheets API call (spreadsheets.values.batchUpdate), mirroring
// setRosterField/realWriteCell's header-driven column resolution but for
// several cells at once (renewals/reactivations touch many columns per row).
export async function writeRosterCells(
  tab: 'current' | 'lapsed',
  rowNumber: number,
  updates: Record<string, string>,
  deps: WriteCellsDeps = {},
): Promise<void> {
  const getTab = deps.getTab ?? realGetTab
  const batchWrite = deps.batchWrite ?? realBatchWrite
  const name = tabName(tab)

  const values = await getTab(name)
  const headers = (values[0] ?? []).map((h) => String(h).trim())
  const columns = Object.keys(updates)
  for (const column of columns) {
    if (headers.indexOf(column) === -1) {
      throw new Error(`Column "${column}" not found in tab "${name}"`)
    }
  }

  const writes = columns.map((column) => ({ tabName: name, rowNumber, column, value: updates[column] }))
  await batchWrite(writes)
}

type MoveRowDeps = {
  getTab?: (tabName: string) => Promise<string[][]>
  appendRow?: (tabName: string, values: string[]) => Promise<number>
  deleteRow?: (tabName: string, rowNumber: number) => Promise<void>
}

async function realGetSheetId(sheets: ReturnType<typeof sheetsClient>, tabTitle: string): Promise<number> {
  if (!SHEET_ID) throw new Error('MEMBER_ROSTER_SHEET_ID not set')
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const found = meta.data.sheets?.find((s) => s.properties?.title === tabTitle)
  const id = found?.properties?.sheetId
  if (id == null) throw new Error(`Tab "${tabTitle}" not found in spreadsheet`)
  return id
}

async function realAppendRow(tabName: string, values: string[]): Promise<number> {
  if (!SHEET_ID) throw new Error('MEMBER_ROSTER_SHEET_ID not set')
  const sheets = sheetsClient()
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: tabName,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  })
  // updatedRange looks like "'Lapsed Members'!A5:H5" — pull the trailing row number.
  const updatedRange = res.data.updates?.updatedRange ?? ''
  const match = updatedRange.match(/(\d+)(?::[A-Z]+\d+)?$/)
  if (!match) throw new Error(`Could not determine appended row number from range "${updatedRange}"`)
  return parseInt(match[1], 10)
}

async function realDeleteRow(tabName: string, rowNumber: number): Promise<void> {
  if (!SHEET_ID) throw new Error('MEMBER_ROSTER_SHEET_ID not set')
  const sheets = sheetsClient()
  const sheetId = await realGetSheetId(sheets, tabName)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowNumber - 1, // 0-based, inclusive
              endIndex: rowNumber, // 0-based, exclusive
            },
          },
        },
      ],
    },
  })
}

// Moves a physical row from one tab to the other: reads the row's raw values
// off fromTab, appends them verbatim to toTab, then deletes the row from
// fromTab. Used both directions — current->Lapsed on lapse, Lapsed->current
// on rejoin — so callers pass 'current'|'lapsed' rather than raw tab names.
//
// Order matters: append THEN delete, so a mid-operation failure leaves the
// row duplicated (recoverable by inspection) rather than lost entirely.
export async function moveRowToTab(
  fromTab: 'current' | 'lapsed',
  rowNumber: number,
  toTab: 'current' | 'lapsed',
  deps: MoveRowDeps = {},
): Promise<number> {
  const getTab = deps.getTab ?? realGetTab
  const appendRow = deps.appendRow ?? realAppendRow
  const deleteRow = deps.deleteRow ?? realDeleteRow

  const fromName = tabName(fromTab)
  const toName = tabName(toTab)

  const values = await getTab(fromName)
  const row = values[rowNumber - 1]
  if (!row) throw new Error(`Row ${rowNumber} not found in tab "${fromName}"`)

  const newRowNumber = await appendRow(toName, row)
  await deleteRow(fromName, rowNumber)
  return newRowNumber
}

type AppendMemberRowDeps = {
  getTab?: (tabName: string) => Promise<string[][]>
  appendRow?: (tabName: string, values: string[]) => Promise<number>
}

// Appends a NEW member row to a tab (current or lapsed), addressed by column
// NAME (mirrors writeRosterCells's header-driven approach) rather than
// positional order — callers (T7 orchestrator's appendNew) don't need to
// know the sheet's physical column layout. Columns present in `row` but
// missing from the tab's header are silently dropped (best-effort — the
// header row is the source of truth for what the sheet actually has);
// columns in the header but absent from `row` are written blank.
export async function appendMemberRow(
  row: Record<string, string>,
  tab: 'current' | 'lapsed' = 'current',
  deps: AppendMemberRowDeps = {},
): Promise<number> {
  const getTab = deps.getTab ?? realGetTab
  const appendRow = deps.appendRow ?? realAppendRow
  const name = tabName(tab)

  const values = await getTab(name)
  const headers = (values[0] ?? []).map((h) => String(h).trim())
  const values_out = headers.map((h) => row[h] ?? '')
  return appendRow(name, values_out)
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
  column:
    | 'Google Email'
    | 'Partner Email'
    | 'Expires'
    | 'Payment Date'
    | 'Current'
    | 'Tier'
    | 'Name'
    | 'Email Address'
    | 'Last Reminder Sent'
    | 'Reminder Count'
    | 'Payment Emails',
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

// 0-based column index -> spreadsheet column letter(s): A, B, ... Z, AA, AB, ...
// (the roster runs A..T today, but this must not silently corrupt writes if
// it grows past Z — the previous inline String.fromCharCode(65 + colIdx) did).
export function columnLetter(index: number): string {
  let n = index
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

async function realWriteCell(rowNumber: number, column: string, value: string): Promise<void> {
  if (!SHEET_ID) throw new Error('MEMBER_ROSTER_SHEET_ID not set')
  const sheets = sheetsClient()
  // Resolve the column letter from the header row.
  const headerRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!1:1` })
  const headers = (headerRes.data.values?.[0] ?? []).map((h) => String(h).trim())
  const colIdx = headers.indexOf(column)
  if (colIdx === -1) throw new Error(`Column "${column}" not found in roster`)
  const colLetter = columnLetter(colIdx)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!${colLetter}${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  })
}

const DISCORD_LINK_TAB = 'Discord_Member_Link'

type DiscordLinkRow = { email?: string; discord_id?: string }

// Reads the Discord_Member_Link tab OFF THE SEPARATE "bot data" workbook
// (WCB_BOT_DATA_SHEET_ID) — NOT the roster workbook (MEMBER_ROSTER_SHEET_ID).
// Uses the SAME OAuth client (sheetsClient()) the roster reads already build.
// Row shape mirrors gspread's get_all_records() lowercased headers: `email` /
// `discord_id`.
async function realGetLinkRows(sheetId: string): Promise<DiscordLinkRow[]> {
  const sheets = sheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: DISCORD_LINK_TAB,
  })
  const values = (res.data.values ?? []).map((r) => r.map((c) => String(c ?? '')))
  if (values.length < 2) return []
  const headers = values[0].map((h) => String(h).trim().toLowerCase())
  const emailIdx = headers.indexOf('email')
  const discordIdIdx = headers.indexOf('discord_id')
  return values.slice(1).map((row) => ({
    email: emailIdx >= 0 ? row[emailIdx] : undefined,
    discord_id: discordIdIdx >= 0 ? row[discordIdIdx] : undefined,
  }))
}

type ReadDiscordLinkedEmailsDeps = {
  getLinkRows?: (sheetId: string) => Promise<DiscordLinkRow[]>
}

export type DiscordLinkedEmailsResult = { linked: Set<string>; ok: boolean }

// Returns the set of normalized emails already linked to a Discord account,
// per the bot's Discord_Member_Link tab, PLUS whether the read actually
// succeeded (`ok`). FAIL-SOFT by design: this feeds the Discord-nudge
// blast's recipient filter, and it is far better to over-nudge an
// already-linked member (harmless — the email just says "here's how to
// link" to someone who already has) than to let a sheet-access hiccup crash
// the whole blast. Any failure — the env var unset, the read throwing, the
// service account lacking access to the bot-data workbook — logs a warning
// and resolves `linked` to an EMPTY set (i.e. "treat everyone as
// unlinked") with `ok: false`, so a caller (the nudge action) can still
// report an honest "link table read failed" status rather than a real-
// looking zero.
export async function readDiscordLinkedEmailsResult(deps: ReadDiscordLinkedEmailsDeps = {}): Promise<DiscordLinkedEmailsResult> {
  const getLinkRows = deps.getLinkRows ?? realGetLinkRows
  const sheetId = process.env.WCB_BOT_DATA_SHEET_ID
  if (!sheetId) {
    console.warn('readDiscordLinkedEmails: WCB_BOT_DATA_SHEET_ID not set — treating all members as unlinked')
    return { linked: new Set(), ok: false }
  }
  try {
    const rows = await getLinkRows(sheetId)
    const out = new Set<string>()
    for (const row of rows) {
      const email = row.email ? normalizeEmail(row.email) : ''
      if (email) out.add(email)
    }
    return { linked: out, ok: true }
  } catch (e) {
    console.warn('readDiscordLinkedEmails: read failed (treating all members as unlinked):', e)
    return { linked: new Set(), ok: false }
  }
}

// Thin Set-only wrapper over readDiscordLinkedEmailsResult, for callers that
// only need the linked-email set itself (not the ok/failed status).
export async function readDiscordLinkedEmails(deps: ReadDiscordLinkedEmailsDeps = {}): Promise<Set<string>> {
  const { linked } = await readDiscordLinkedEmailsResult(deps)
  return linked
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
