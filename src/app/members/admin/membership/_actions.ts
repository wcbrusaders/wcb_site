'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getMembershipReports } from '@/lib/metrics'
import { generateInsights } from '@/lib/metrics/insights'
import { LAPSE_REASONS } from '@/lib/metrics/lapsed'
import { writeRosterCells, appendMemberRow, normalizeEmail, readMembersForMatching, readRosterCell, moveRowToTab, readReminderRows, readDiscordLinkedEmailsResult, type ReminderRow } from '@/lib/roster'
import { computeExpiration, tierFromAmount } from '@/lib/membership/tiers'
import { renderWelcome, renderRenewal, renderReminder, renderReengagement, sendMembershipEmail } from '@/lib/membership/emails'
import { selectNudgeRecipients, renderDiscordNudge } from '@/lib/membership/discord-nudge'
import { recordAudit } from '@/lib/audit'

type Actor = { memberId?: string; email: string }

// Board-gate for this file's actions, mirroring admin-actions.ts's requireBoard
// exactly (re-checked server-side; never trust the client). Kept local rather
// than imported so this file's actions don't take on a cross-module coupling
// for a two-line check — same shape as the reference implementation.
async function requireBoard(): Promise<Actor | null> {
  const s = await auth()
  if (!s?.user?.isBoard || !s.user.email) return null
  return { memberId: s.user.memberId, email: s.user.email }
}

// The stored Ipn payload shape (see paypal-ipn.ts's Ipn) — only the fields
// resolvePendingCore actually needs are required here; queuePending (the IPN
// route) persists the full Ipn as JSON, so parsing back gets everything, but
// we only destructure what we use.
type PendingPayload = { email: string; amount: number; firstName?: string; lastName?: string }

export type ResolveChoice =
  | { kind: 'confirm'; rowNumber: number; tab: 'current' | 'lapsed'; addAlias: string }
  | { kind: 'new' }

export type ResolvePendingDeps = {
  // candidateRows isn't read by the core today (the choice already carries
  // the specific row+tab the officer picked) — kept in the return shape
  // only because getPending mirrors the stored PendingMatch row 1:1.
  getPending: (id: string) => Promise<{ payload: PendingPayload; candidateRows: string } | null>
  writeCells: (tab: 'current' | 'lapsed', row: number, updates: Record<string, string>) => Promise<void>
  appendNew: (row: Record<string, string>) => Promise<number>
  sendEmail: (to: string, subject: string, html: string) => Promise<void>
  markResolved: (id: string) => Promise<void>
  now: Date
  // rowNumber's TAB must be threaded through explicitly — row numbers are
  // only unique WITHIN a tab, and a name-review candidate can live on
  // EITHER tab (matchPayment scans both). Reading/writing by rowNumber alone
  // risks silently touching an unrelated row on the other tab.
  readRow: (tab: 'current' | 'lapsed', rowNumber: number) => Promise<{ expires: string | null; paymentEmails: string }>
  moveRow: (from: 'current' | 'lapsed', row: number, to: 'current' | 'lapsed') => Promise<number>
}

function fmtDate(d: Date): string {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`
}

// Pure, testable core for resolving a board-review queue entry (the Peter
// case: matcher found a name match but no email overlap, so it queued rather
// than auto-applying anything). actor === null means "not board" → reject.
//
// 'confirm': the officer is saying "yes, this payer IS the candidate row" —
// renews that row AND appends the payer's email to the row's 'Payment
// Emails' alias column (comma-joined with whatever's already there) so the
// SAME email auto-matches next time instead of queueing again. The
// candidate's `tab` decides HOW that renewal happens:
//   - 'current': renew in place (mirrors T7's normal-renewal write).
//   - 'lapsed': REACTIVATE — moveRow('lapsed', rowNumber, 'current') first
//     (mirrors T7's reactivation path), then write the fields on the row's
//     NEW current-tab row number (moveRowToTab's return value), crediting
//     any remaining days off the row's PRE-move `expires` so day-credit
//     still applies.
//
// 'new': the officer is saying "no, this is a genuinely new member" —
// append a fresh row (mirrors T7's brand-new-member append), no alias
// bookkeeping needed since there's no existing row to link it to.
//
// Either branch marks the PendingMatch resolved so it drops off the queue.
export async function resolvePendingCore(
  actor: Actor | null,
  id: string,
  choice: ResolveChoice,
  deps: ResolvePendingDeps,
): Promise<{ ok: boolean; reason?: string }> {
  if (!actor) return { ok: false, reason: 'forbidden' }

  const pending = await deps.getPending(id)
  if (!pending) return { ok: false, reason: 'not found' }
  const { payload } = pending

  if (choice.kind === 'new') {
    const tier = tierFromAmount(payload.amount)
    const { expires } = computeExpiration(null, deps.now)
    const paymentDate = fmtDate(deps.now)
    const name = `${payload.firstName ?? ''} ${payload.lastName ?? ''}`.trim()
    await deps.appendNew({
      Name: name,
      Tier: tier ?? '',
      'Email Address': payload.email,
      'Payment Date': paymentDate,
      Expires: expires,
      Current: 'Yes',
      'Join Date': paymentDate,
    })
    if (tier) {
      const { subject, html } = renderWelcome({ firstName: payload.firstName ?? '', tier, expiration: expires })
      await deps.sendEmail(payload.email, subject, html)
    }
    await deps.markResolved(id)
    return { ok: true }
  }

  // 'confirm': renew (or reactivate) the chosen row + record the payer email as a new alias.
  const row = await deps.readRow(choice.tab, choice.rowNumber)
  const { expires, daysCredited } = computeExpiration(row.expires, deps.now)
  const tier = tierFromAmount(payload.amount)
  const paymentDate = fmtDate(deps.now)

  const existingAliases = (row.paymentEmails ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e.length > 0)
  const aliasToAdd = normalizeEmail(choice.addAlias)
  const mergedAliases = existingAliases.includes(aliasToAdd)
    ? existingAliases
    : [...existingAliases, aliasToAdd]

  // If the candidate lives on the lapsed tab, move it to current FIRST —
  // the row's physical number changes, and every subsequent write/alias
  // update must target the NEW (current-tab) row, not the old lapsed one.
  const targetRow = choice.tab === 'lapsed'
    ? await deps.moveRow('lapsed', choice.rowNumber, 'current')
    : choice.rowNumber

  await deps.writeCells('current', targetRow, {
    Current: 'Yes',
    Expires: expires,
    'Payment Date': paymentDate,
    'Last Reminder Sent': '',
    'Reminder Count': '0',
    ...(tier ? { Tier: tier } : {}),
    'Payment Emails': mergedAliases.join(', '),
  })

  if (tier) {
    const { subject, html } = renderRenewal({ firstName: payload.firstName ?? '', tier, expiration: expires, daysCredited })
    await deps.sendEmail(payload.email, subject, html)
  }

  await deps.markResolved(id)
  return { ok: true }
}

async function realGetPending(id: string): Promise<{ payload: PendingPayload; candidateRows: string } | null> {
  const row = await prisma.pendingMatch.findUnique({ where: { id } })
  if (!row || row.resolvedAt) return null
  return {
    payload: JSON.parse(row.payloadJson) as PendingPayload,
    candidateRows: row.candidateRows,
  }
}

async function realMarkResolved(id: string): Promise<void> {
  await prisma.pendingMatch.update({ where: { id }, data: { resolvedAt: new Date() } })
}

async function realReadRow(tab: 'current' | 'lapsed', rowNumber: number): Promise<{ expires: string | null; paymentEmails: string }> {
  const members = await readMembersForMatching()
  const match = members.find((m) => m.rowNumber === rowNumber && m.tab === tab)
  // 'Payment Emails' is folded into MatchMember.emails alongside every other
  // email column there, so it can't be recovered distinctly from that
  // projection — read the raw cell directly instead.
  const paymentEmails = await readRosterCell(tab, rowNumber, 'Payment Emails')
  return { expires: match?.expires ?? null, paymentEmails }
}

const realResolveDeps: ResolvePendingDeps = {
  getPending: realGetPending,
  writeCells: (tab, row, updates) => writeRosterCells(tab, row, updates),
  appendNew: (row) => appendMemberRow(row, 'current'),
  sendEmail: (to, subject, html) => sendMembershipEmail(to, subject, html),
  markResolved: realMarkResolved,
  now: new Date(),
  readRow: realReadRow,
  moveRow: (from, row, to) => moveRowToTab(from, row, to),
}

export async function resolvePendingMatchAction(id: string, choice: ResolveChoice) {
  const actor = await requireBoard()
  const r = await resolvePendingCore(actor, id, choice, realResolveDeps)
  if (actor && r.ok) {
    await recordAudit({
      actorMemberId: actor.memberId, actorEmail: actor.email,
      action: 'resolve-pending-match',
      detail: choice.kind === 'confirm' ? `confirmed renewal on ${choice.tab} row ${choice.rowNumber}` : 'marked as new member',
    })
  }
  revalidatePath('/members/admin/membership')
  return r
}

type CompletePartnerDeps = {
  writeCells: (tab: 'current' | 'lapsed', row: number, updates: Record<string, string>) => Promise<void>
  sendEmail: (to: string, subject: string, html: string) => Promise<void>
}

// Pure core for finalizing a couple/partner placeholder row: the primary
// member already exists with a paid Couple/Dual tier, but the second person's
// Name + Email Address were left blank on the roster pending them actually
// telling us who they are. This just fills those two cells in and sends the
// partner their own welcome email (their tier/expiration mirror the row
// they're being added to, read straight off that row after the write).
export async function applyCompletePartner(
  deps: CompletePartnerDeps,
  actor: Actor | null,
  rowNumber: number,
  name: string,
  email: string,
  tier: 'Single' | 'Couple',
  expiration: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!actor) return { ok: false, reason: 'forbidden' }
  const cleanName = name.trim()
  const cleanEmail = normalizeEmail(email)
  if (!cleanName) return { ok: false, reason: 'Name is required.' }
  if (!cleanEmail || !cleanEmail.includes('@')) return { ok: false, reason: 'A valid email is required.' }

  await deps.writeCells('current', rowNumber, {
    Name: cleanName,
    'Email Address': cleanEmail,
  })

  const { subject, html } = renderWelcome({ firstName: cleanName.split(' ')[0] || cleanName, tier, expiration })
  await deps.sendEmail(cleanEmail, subject, html)

  return { ok: true }
}

const realPartnerDeps: CompletePartnerDeps = {
  writeCells: (tab, row, updates) => writeRosterCells(tab, row, updates),
  sendEmail: (to, subject, html) => sendMembershipEmail(to, subject, html),
}

// Thin 'use server' wrapper: re-derives the row's current tier/expiration
// from the live roster (rather than trusting a client-supplied value) so the
// partner's welcome email always reflects the actual paid membership.
export async function completePartnerAction(rowNumber: number, name: string, email: string) {
  const actor = await requireBoard()
  const members = await readMembersForMatching()
  const row = members.find((m) => m.rowNumber === rowNumber && m.tab === 'current')
  const tier: 'Single' | 'Couple' = 'Couple'
  const expiration = row?.expires ?? ''
  const r = await applyCompletePartner(realPartnerDeps, actor, rowNumber, name, email, tier, expiration)
  if (actor && r.ok) {
    await recordAudit({
      actorMemberId: actor.memberId, actorEmail: actor.email,
      action: 'complete-partner', targetLabel: name, detail: `row ${rowNumber} -> ${email}`,
    })
  }
  revalidatePath('/members/admin/membership')
  return r
}

/**
 * On-demand "Generate insights" action for the board-only membership reports
 * page. Re-checks board status server-side — never trust the client, even
 * though the page itself is already gated. Runs Claude over the already-
 * computed aggregate metrics (see generateInsights's PII wall) and returns
 * plain text. Cost is incurred only on click.
 */
export async function generateInsightsAction(): Promise<
  { ok: true; text: string } | { ok: false; error: string }
> {
  const s = await auth()
  if (!s?.user?.isBoard || !s.user.email) return { ok: false, error: 'Not authorized' }

  const reports = await getMembershipReports()
  // generateInsights is fail-soft and already returns the { ok, text } | { ok, error }
  // shape — pass it straight through so the UI can distinguish a real insight
  // from an AI failure (previously a failure came back as ok:true fake text).
  return generateInsights(reports, {})
}

/**
 * Record (or clear) why a lapsed member left — board-only. Writes ONLY the two
 * site-owned fields (lapseReason/lapseNote); never the sheet-synced columns, so
 * the next roster sync can't clobber this. Re-checks board server-side.
 *
 * reason must be one of LAPSE_REASONS (or '' to clear); note is free text
 * (trimmed, capped, '' clears). memberId is the Member.id cuid.
 */
export async function setLapseReason(
  memberId: string,
  reason: string,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await auth()
  if (!s?.user?.isBoard || !s.user.email) return { ok: false, error: 'Not authorized' }

  if (!memberId) return { ok: false, error: 'Missing member' }
  if (reason !== '' && !(LAPSE_REASONS as readonly string[]).includes(reason)) {
    return { ok: false, error: 'Invalid reason' }
  }

  const cleanNote = note.trim().slice(0, 500)

  try {
    // Only lapsed/former members are eligible — guard so a stray/bad id can't
    // annotate an active member. `updateMany` with the state filter makes it a
    // no-op (count 0) rather than an error if the member isn't lapsed.
    const res = await prisma.member.updateMany({
      where: { id: memberId, membershipState: { in: ['lapsed', 'former'] } },
      data: {
        lapseReason: reason === '' ? null : reason,
        lapseNote: cleanNote === '' ? null : cleanNote,
      },
    })
    if (res.count === 0) return { ok: false, error: 'Member not found or not lapsed' }
  } catch {
    return { ok: false, error: "Couldn't save — try again." }
  }

  revalidatePath('/members/admin/membership')
  return { ok: true }
}

/**
 * Board-triggered, on-demand Discord join/link nudge blast.
 *
 * Recipients = current members with a real email, not already Discord-
 * linked, not opted out — see selectNudgeRecipients for the exact filter.
 * readReminderRows is the recipient source (not readMembersForMatching):
 * it's already current-tab-only, already excludes the NEEDS UPDATE
 * partner-placeholder sentinel, AND carries `optOut`, which
 * readMembersForMatching's MatchMember projection lacks entirely.
 */

export type SendNudgeResult =
  | { ok: false; reason: 'forbidden' }
  | {
      ok: true
      sent: number
      skippedOptOut: number
      skippedLinked: number
      linkTableRead: 'ok' | 'failed'
    }

export type SendNudgeDeps = {
  readRows: () => Promise<ReminderRow[]>
  // Wraps readDiscordLinkedEmails: `ok` reports whether that (already
  // fail-soft) read actually succeeded, so the blast's return value can
  // surface "link table read failed, treating all as unlinked" to the board
  // rather than silently presenting a real-looking number.
  readLinked: () => Promise<{ linked: Set<string>; ok: boolean }>
  sendEmail: (to: string, subject: string, html: string) => Promise<void>
}

export async function sendDiscordNudgeCore(
  actor: Actor | null,
  deps: SendNudgeDeps,
): Promise<SendNudgeResult> {
  if (!actor) return { ok: false, reason: 'forbidden' }

  const [rows, linkResult] = await Promise.all([deps.readRows(), deps.readLinked()])

  // All known emails per member (primary + Google + Partner), so "already
  // linked" is checked against every address — a member often links Discord
  // under their Google Email rather than the roster's primary Email Address.
  const allEmails = (r: ReminderRow): string[] =>
    [r.email, r.googleEmail, r.partnerEmail].map((e) => (e ?? '').trim()).filter(Boolean)
  const isLinked = (r: ReminderRow): boolean =>
    allEmails(r).some((e) => linkResult.linked.has(normalizeEmail(e)))

  const skippedOptOut = rows.filter((r) => r.optOut === 'STOP' || r.optOut === 'Yes').length
  const skippedLinked = rows.filter((r) => {
    if (r.optOut === 'STOP' || r.optOut === 'Yes') return false
    const email = r.email.trim()
    if (!email || email.toUpperCase() === 'NEEDS UPDATE') return false
    return isLinked(r)
  }).length

  const recipients = selectNudgeRecipients(
    rows.map((r) => ({ name: r.name, email: r.email, emails: allEmails(r), current: true, optOut: r.optOut })),
    linkResult.linked,
  )

  let sent = 0
  for (const recipient of recipients) {
    try {
      const firstName = recipient.name.split(' ')[0] || recipient.name
      const { subject, html } = renderDiscordNudge({ firstName })
      await deps.sendEmail(recipient.email, subject, html)
      sent++
    } catch (e) {
      // Fail-soft: one bad send must not abort the rest of the blast.
      console.error(`Discord nudge send failed for ${recipient.email}:`, e)
    }
  }

  return {
    ok: true,
    sent,
    skippedOptOut,
    skippedLinked,
    linkTableRead: linkResult.ok ? 'ok' : 'failed',
  }
}

const realNudgeDeps: SendNudgeDeps = {
  readRows: () => readReminderRows(),
  readLinked: () => readDiscordLinkedEmailsResult(),
  sendEmail: (to, subject, html) => sendMembershipEmail(to, subject, html),
}

export async function sendDiscordNudgeAction(): Promise<SendNudgeResult> {
  const actor = await requireBoard()
  const r = await sendDiscordNudgeCore(actor, realNudgeDeps)
  if (actor && r.ok) {
    await recordAudit({
      actorMemberId: actor.memberId, actorEmail: actor.email,
      action: 'send-discord-nudge',
      detail: `sent ${r.sent}, skipped ${r.skippedOptOut} opted-out, ${r.skippedLinked} already-linked, linkTableRead=${r.linkTableRead}`,
    })
  }
  return r
}

// --- Send sample emails (board-only, for copy review) ------------------------
// Renders every membership email with sample data and sends them all to a fixed
// club address so the board can eyeball the real rendered emails in an inbox.
// Writes NOTHING to the roster; sends only to club@ (never to a member). The
// send path is the same sendMembershipEmail used in production (noreply@ +
// replyTo club@), so what lands is exactly what a member would get.
const SAMPLE_TO = 'club@wcbrusaders.com'

export type SendSamplesResult = { ok: true; sent: number; to: string } | { ok: false; reason: string }

export async function sendSampleEmailsAction(): Promise<SendSamplesResult> {
  const actor = await requireBoard()
  if (!actor) return { ok: false, reason: 'forbidden' }

  const exp = '10/29/2027'
  const unsub = 'https://www.wcbrusaders.com/members/unsubscribe?t=SAMPLE'
  const samples = [
    renderWelcome({ firstName: 'Sample', tier: 'Couple', expiration: exp }),
    renderRenewal({ firstName: 'Sample', tier: 'Single', expiration: exp, daysCredited: 30 }),
    renderReminder({ firstName: 'Sample', expiration: exp, daysLeft: 7, phase: 'pre', unsubscribeUrl: unsub }),
    renderReminder({ firstName: 'Sample', expiration: exp, daysLeft: 4, phase: 'post', unsubscribeUrl: unsub }),
    renderReengagement({ firstName: 'Sample', unsubscribeUrl: unsub }),
    renderDiscordNudge({ firstName: 'Sample' }),
  ]

  let sent = 0
  for (const s of samples) {
    try {
      // Prefix the subject so the board can tell these apart from real member mail.
      await sendMembershipEmail(SAMPLE_TO, `[SAMPLE] ${s.subject}`, s.html)
      sent++
    } catch {
      // fail-soft per email — one bad send shouldn't abort the batch
    }
  }

  await recordAudit({
    actorMemberId: actor.memberId, actorEmail: actor.email,
    action: 'send-sample-emails',
    detail: `sent ${sent}/${samples.length} sample emails to ${SAMPLE_TO}`,
  })
  return { ok: true, sent, to: SAMPLE_TO }
}
