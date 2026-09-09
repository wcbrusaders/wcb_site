import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { readMembersForMatching, writeRosterCells, moveRowToTab, appendMemberRow } from '@/lib/roster'
import { sendMembershipEmail } from '@/lib/membership/emails'
import { verifyIpn, parseIpn, isProcessablePayment, type Ipn } from '@/lib/membership/paypal-ipn'
import { processPayment, type ProcessDeps, type PendingCandidate } from '@/lib/membership/process-payment'
import { recordContribution, receiverIsClub } from '@/lib/membership/contributions'

// Pure routing decision: does this IPN's `custom` field tag it as a
// competition contribution, or is it (the default) a membership payment?
// Matches `comp:<id>` and requires a non-empty (post-trim) id — a malformed
// `custom=comp:` with nothing after the colon must NOT be treated as a
// contribution (spec: Task 4 / webhook routing invariant), so it falls
// through to membership like any other payment.
export function classifyIpn(ipn: Ipn): { kind: 'contribution'; compId: string } | { kind: 'membership' } {
  const m = /^comp:(.+)$/.exec(ipn.custom)
  if (m) {
    const compId = m[1].trim()
    if (compId !== '') return { kind: 'contribution', compId }
  }
  return { kind: 'membership' }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Idempotency source tag for the Payment table's (date, netDues, source)
// unique key — embeds the PayPal txnId so re-delivery of the SAME IPN never
// double-processes, while still coexisting with the Payments-tab sync's own
// rows (which use source values like "PayPal"/"Cash", never this "ipn:"
// prefix).
async function alreadyProcessed(txnId: string): Promise<boolean> {
  const hit = await prisma.payment.findFirst({ where: { source: `ipn:${txnId}` } })
  return hit != null
}

async function markProcessed(txnId: string): Promise<void> {
  // txnId alone determines the row (source encodes it), so date/netDues here
  // are placeholders satisfying the unique key — the real amount was already
  // used for the tierFromAmount/matching logic upstream in processPayment.
  const now = new Date()
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  await prisma.payment.upsert({
    where: { date_netDues_source: { date, netDues: 0, source: `ipn:${txnId}` } },
    create: { date, netDues: 0, source: `ipn:${txnId}` },
    update: {},
  })
}

// Persists a name-review payment to the PendingMatch table so a board member
// can resolve it via the admin queue (Task 8) instead of it only living in
// application logs. Idempotent on txnId — a re-delivered IPN for the same
// transaction (PayPal retries on anything but a prompt 200) must not create
// a second queue entry for the same payment.
//
// candidateRows encoding: each candidate is "tab:rowNumber" (e.g.
// "current:11,lapsed:40"), comma-joined. A name-review candidate can live on
// EITHER tab (matchPayment scans both), and row numbers are only unique
// WITHIN a tab — encoding just the bare number here caused a data-corruption
// bug where confirming a lapsed-tab candidate silently read/wrote an
// unrelated current-tab row sharing that row number. Parsed back by
// _actions.ts's realGetPending.
async function queuePending(payload: Ipn, candidates: PendingCandidate[]): Promise<void> {
  const existing = await prisma.pendingMatch.findUnique({ where: { txnId: payload.txnId } })
  if (existing) return
  await prisma.pendingMatch.create({
    data: {
      txnId: payload.txnId,
      payloadJson: JSON.stringify(payload),
      candidateRows: candidates.map((c) => `${c.tab}:${c.rowNumber}`).join(','),
    },
  })
}

function buildDeps(): ProcessDeps {
  return {
    readMembers: () => readMembersForMatching(),
    writeCells: (tab, row, updates) => writeRosterCells(tab, row, updates),
    moveRow: (from, row, to) => moveRowToTab(from, row, to),
    appendNew: (row) => appendMemberRow(row, 'current'),
    sendEmail: (to, subject, html) => sendMembershipEmail(to, subject, html),
    queuePending,
    alreadyProcessed,
    markProcessed,
    now: new Date(),
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const raw = await req.text()

  const verified = await verifyIpn(raw)
  if (!verified) {
    console.warn('paypal ipn: verification failed, ignoring')
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  const ipn = parseIpn(new URLSearchParams(raw))

  const classified = classifyIpn(ipn)
  if (classified.kind === 'contribution') {
    if (!isProcessablePayment(ipn)) {
      console.log('paypal ipn: not a processable payment', { txnId: ipn.txnId, status: ipn.status, txnType: ipn.txnType })
      return NextResponse.json({ ok: true }, { status: 200 })
    }
    if (!receiverIsClub(ipn.receiverEmail)) {
      console.warn('paypal ipn: contribution receiver mismatch', { txnId: ipn.txnId })
      return NextResponse.json({ ok: true }, { status: 200 })
    }
    try {
      const result = await recordContribution(
        {
          compId: classified.compId,
          txnId: ipn.txnId,
          amount: ipn.amount,
          payerName: `${ipn.firstName} ${ipn.lastName}`.trim() || null,
          payerEmail: ipn.email || null,
        },
        {},
      )
      // Never log the raw payload (contains PII) — outcome + txnId only.
      console.log('paypal ipn contribution recorded', { txnId: ipn.txnId, outcome: result.outcome })
    } catch (e) {
      console.error('paypal ipn: recordContribution threw', { txnId: ipn.txnId, error: e instanceof Error ? e.message : String(e) })
    }
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  if (!isProcessablePayment(ipn)) {
    console.log('paypal ipn: not a processable payment', { txnId: ipn.txnId, status: ipn.status, txnType: ipn.txnType })
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  try {
    const result = await processPayment(ipn, buildDeps())
    // Never log the raw payload (contains PII) — outcome + txnId only.
    console.log('paypal ipn processed', { txnId: ipn.txnId, outcome: result.outcome })
  } catch (e) {
    console.error('paypal ipn: processPayment threw', { txnId: ipn.txnId, error: e instanceof Error ? e.message : String(e) })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
