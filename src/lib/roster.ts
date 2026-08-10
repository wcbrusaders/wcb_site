import { google } from 'googleapis'
import { prisma } from './db'

export type MemberRecord = {
  emailAddress: string
  googleEmail: string | null
  name: string | null
  tier: string | null
  current: boolean
  isBoard: boolean
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

type SyncDeps = {
  fetchAll?: () => Promise<MemberRecord[]>
  db?: typeof prisma
}

export async function syncRoster(deps: SyncDeps = {}): Promise<{ synced: number; deactivated: number }> {
  const fetchAll = deps.fetchAll ?? fetchAllRosterRows
  const db = deps.db ?? prisma
  const rows = await fetchAll()
  let synced = 0
  const seen = new Set<string>()
  for (const m of rows) {
    await db.member.upsert({
      where: { emailAddress: m.emailAddress },
      update: { googleEmail: m.googleEmail, name: m.name, tier: m.tier, current: m.current, isBoard: m.isBoard, partnerEmail: m.partnerEmail, expires: m.expires, joinDate: m.joinDate, paymentDate: m.paymentDate, referredBy: m.referredBy },
      create: { emailAddress: m.emailAddress, googleEmail: m.googleEmail, name: m.name, tier: m.tier, current: m.current, isBoard: m.isBoard, partnerEmail: m.partnerEmail, expires: m.expires, joinDate: m.joinDate, paymentDate: m.paymentDate, referredBy: m.referredBy },
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
    return { ok: true, member: { emailAddress: e, googleEmail: null, name: 'DEV', tier: null, current: true, isBoard: false, partnerEmail: null, expires: null, joinDate: null, paymentDate: null, referredBy: null } }
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
