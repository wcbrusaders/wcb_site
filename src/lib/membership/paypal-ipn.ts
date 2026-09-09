export interface Ipn { txnId: string; email: string; firstName: string; lastName: string; amount: number; status: string; txnType: string; noteEmails: string[]; custom: string; receiverEmail: string }
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi

export function parseIpn(form: URLSearchParams): Ipn {
  const g = (k: string) => (form.get(k) ?? '').trim()
  const payer = g('payer_email').toLowerCase()
  const noteEmails: string[] = []
  for (const [k, v] of form.entries()) {
    if (['payer_email', 'receiver_email', 'business'].includes(k)) continue
    for (const hit of v.match(EMAIL_RE) ?? []) {
      const e = hit.toLowerCase()
      if (e !== payer && !noteEmails.includes(e)) noteEmails.push(e)
    }
  }
  return {
    txnId: g('txn_id'), email: payer, firstName: g('first_name'), lastName: g('last_name'),
    amount: parseFloat(g('mc_gross') || '0'), status: g('payment_status').toLowerCase(),
    txnType: g('txn_type').toLowerCase(), noteEmails,
    custom: g('custom'), receiverEmail: g('receiver_email').toLowerCase(),
  }
}
export function isProcessablePayment(p: Pick<Ipn, 'status' | 'txnType'>): boolean {
  return p.status === 'completed' && ['web_accept', 'cart', 'express_checkout'].includes(p.txnType)
}
type VDeps = { fetch?: typeof fetch; paypalUrl?: string }
export async function verifyIpn(rawBody: string, deps: VDeps = {}): Promise<boolean> {
  const f = deps.fetch ?? fetch
  const url = deps.paypalUrl ?? process.env.PAYPAL_IPN_URL ?? 'https://ipnpb.paypal.com/cgi-bin/webscr'
  const res = await f(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `cmd=_notify-validate&${rawBody}` })
  const text = await res.text()
  return text.trim() === 'VERIFIED'
}
