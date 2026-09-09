// Pure builder for the classic PayPal "chip in" donation link used on a
// competition card. NOT the NCP hosted button — that can't carry a custom
// field or a per-comp preset amount. `custom=comp:<compId>` is what the IPN
// webhook uses to attribute the payment to a Contribution instead of dues.
//
// Deliberately takes `merchantId` as a plain string argument rather than
// reading env itself: this file runs in both server and (potentially) client
// contexts, and the merchant id — while public — is kept a server-only env
// var (CLUB_PAYPAL_MERCHANT_ID, not NEXT_PUBLIC_*). The caller (a server
// component) reads process.env and passes the value in.
// NOTE: deliberately NO `amount` param. On a classic PayPal `_donations` link,
// sending an amount LOCKS the payment to it (the donor can't change it) — the
// opposite of what we want. Omitting it opens PayPal with an editable amount
// box so the donor pays whatever they like; the "suggested $15" nudge lives in
// the on-page copy (CompetitionCard), not the URL.
export function buildDonateUrl(opts: {
  merchantId: string
  compId: string
  compName: string
  returnUrl?: string
}): string {
  const { merchantId, compId, compName, returnUrl } = opts
  const base = 'https://www.paypal.com/cgi-bin/webscr'
  const params = new URLSearchParams({
    cmd: '_donations',
    business: merchantId,
    currency_code: 'USD',
    custom: `comp:${compId}`,
    item_name: `WCB ${compName} — competition costs`,
    no_note: '0',
  })
  if (returnUrl) {
    params.set('return', returnUrl)
    params.set('cancel_return', returnUrl)
  }
  return `${base}?${params.toString()}`
}
