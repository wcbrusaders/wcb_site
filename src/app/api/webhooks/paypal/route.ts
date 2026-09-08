import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { readMembersForMatching, writeRosterCells, moveRowToTab, appendMemberRow } from '@/lib/roster'
import { sendMembershipEmail } from '@/lib/membership/emails'
import { verifyIpn, parseIpn, isProcessablePayment, type Ipn } from '@/lib/membership/paypal-ipn'
import { processPayment, type ProcessDeps } from '@/lib/membership/process-payment'

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
async function queuePending(payload: Ipn, candidateRows: number[]): Promise<void> {
  const existing = await prisma.pendingMatch.findUnique({ where: { txnId: payload.txnId } })
  if (existing) return
  await prisma.pendingMatch.create({
    data: {
      txnId: payload.txnId,
      payloadJson: JSON.stringify(payload),
      candidateRows: candidateRows.join(','),
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
