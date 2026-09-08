import { Resend } from 'resend'

type Tier = 'Single' | 'Couple'

type WelcomeVars = { firstName: string; tier: Tier; expiration: string }
type RenewalVars = { firstName: string; tier: Tier; expiration: string; daysCredited?: number }
type ReminderVars = {
  firstName: string
  expiration: string
  daysLeft: number
  phase: 'pre' | 'post'
  unsubscribeUrl: string
}
type ReengagementVars = { firstName: string; unsubscribeUrl: string }

type Rendered = { subject: string; html: string }

const MEMBERS_URL = 'https://www.wcbrusaders.com/members'
const DISCORD_URL = 'https://discord.gg/UKyMAVUHjM'
const CLUB_EMAIL = 'club@wcbrusaders.com'
const RENEW_URL = 'https://www.paypal.com/ncp/payment/UQ6VG5K69FC92'
const UNSUB_FOOTER_CLASS = 'unsub'

/** Member-facing tier word is "Dual", never "Couple". */
function displayTier(tier: Tier): string {
  return tier === 'Couple' ? 'Dual' : tier
}

const SHARED_STYLE = `
body{font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}
.header{background-color:#d97706;color:white;padding:20px;text-align:center;border-radius:5px 5px 0 0}
.content{background-color:#f9f9f9;padding:30px;border-radius:0 0 5px 5px}
.details{background-color:white;padding:15px;margin:20px 0;border-left:4px solid #d97706}
.hub{background-color:#fff7ed;border:1px solid #fed7aa;padding:18px;margin:20px 0;border-radius:6px;text-align:center}
.cta{background-color:#d97706;color:white;padding:12px 30px;text-decoration:none;display:inline-block;margin:10px 5px;border-radius:5px}
.cta-secondary{color:#d97706;text-decoration:none;display:inline-block;margin:6px 8px;font-size:.95em}
.footer{text-align:center;margin-top:30px;font-size:.9em;color:#666}
.unsub{font-size:.8em;color:#999}
`

const FOOTER = `
<div class="footer">
<p>Cheers,<br>Wake County Brusaders</p>
<p>Questions? Email <a href="mailto:${CLUB_EMAIL}">${CLUB_EMAIL}</a></p>
</div>
`

function footerWithUnsubscribe(unsubscribeUrl: string): string {
  return `
<div class="footer">
<p>Cheers,<br>Wake County Brusaders</p>
<p>Questions about your membership? Email <a href="mailto:${CLUB_EMAIL}">${CLUB_EMAIL}</a></p>
<p class="${UNSUB_FOOTER_CLASS}"><a href="${unsubscribeUrl}">Unsubscribe from these emails</a></p>
</div>
`
}

function shell(headerHtml: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>${SHARED_STYLE}</style></head><body>
<div class="header">${headerHtml}</div>
<div class="content">
${bodyHtml}
</div></body></html>`
}

export function renderWelcome(v: WelcomeVars): Rendered {
  const tier = displayTier(v.tier)
  const html = shell(
    '<h1>\u{1F37A} Welcome to Wake County Brusaders!</h1>',
    `<p>Hey ${v.firstName}!</p>
<p>Welcome to Wake County Brusaders — we're excited to have you in the brewing community.</p>
<div class="details">
<strong>Your Membership:</strong><br>
Type: ${tier}<br>
Active through: ${v.expiration}
</div>

<div class="hub">
<p style="margin:0 0 10px"><strong>Start here → your Members area</strong></p>
<p style="margin:0 0 14px;font-size:.95em">Everything's on the members site: club resources, the brewing knowledge base, competitions, lending library, event calendar — <strong>and the invite to our members-only Discord</strong>.</p>
<a href="${DISCORD_URL}" class="cta">Join the Discord</a>
<a href="${MEMBERS_URL}" class="cta">Members Area</a>
<p style="margin:12px 0 0;font-size:.85em;color:#666">Log in with this email address to get in.</p>
</div>

<p><strong>What's next:</strong></p>
<ul>
<li>Meetings are the 3rd Thursday of each month</li>
<li>Jump into our members-only Discord (link above) — say hi!</li>
<li>Bring your latest brew to share at the next meeting!</li>
</ul>

<div style="text-align:center;margin:24px 0">
<a href="https://www.facebook.com/groups/wakecountybrusaders" class="cta-secondary">Facebook group ↗</a>
<a href="https://www.wcbrusaders.com" class="cta-secondary">Club website ↗</a>
</div>
${FOOTER}`,
  )
  return { subject: `Welcome to Wake County Brusaders!`, html }
}

export function renderRenewal(v: RenewalVars): Rendered {
  const tier = displayTier(v.tier)
  const daysCreditedLine =
    v.daysCredited && v.daysCredited > 0
      ? `<br>Days credited for renewing early: ${v.daysCredited}`
      : ''
  const html = shell(
    '<h1>✅ Payment Received — You\'re All Set!</h1>',
    `<p>Hey ${v.firstName}!</p>
<p>Thanks for renewing! Your payment was processed successfully and your Wake County Brusaders membership is active.</p>
<div class="details">
<strong>Your Renewal:</strong><br>
Type: ${tier}<br>
<strong>Active through: ${v.expiration}</strong>${daysCreditedLine}
</div>
<div class="hub">
<p style="margin:0 0 6px"><strong>Everything's in your Members area</strong></p>
<p style="margin:0;font-size:.95em">Resources, knowledge base, competitions, lending, calendar, and the members-only Discord invite: <a href="${MEMBERS_URL}">wcbrusaders.com/members</a></p>
</div>
<p>See you at the next meeting! \u{1F37B}</p>
${FOOTER}`,
  )
  return { subject: `Renewal confirmed — you're all set!`, html }
}

export function renderReminder(v: ReminderVars): Rendered {
  const subject =
    v.phase === 'pre'
      ? `Membership expiring soon — renew now`
      : `Your membership has expired — renew to stay active`
  const intro =
    v.phase === 'pre'
      ? `<p>Friendly reminder that your Wake County Brusaders membership expires on <strong>${v.expiration}</strong> — in <strong>${v.daysLeft} days</strong>.</p>`
      : `<p>Your Wake County Brusaders membership expired on <strong>${v.expiration}</strong> — it's been <strong>${v.daysLeft} days</strong>.</p>`
  const html = shell(
    '<h1>⏰ Membership Expiring Soon</h1>',
    `<p>Hey ${v.firstName}!</p>
${intro}
<div class="details">
<strong>Renew to keep your membership active:</strong><br>
Expires: ${v.expiration}<br>
<em>Renew early and we add the full year to your current date — you lose no time.</em>
</div>
<p>If it lapses you'll lose access to meetings, events, the members Discord, and everything in your <a href="${MEMBERS_URL}">Members area</a>.</p>
<div style="text-align:center;margin:30px 0"><a href="${RENEW_URL}" class="cta">Renew My Membership</a></div>
${footerWithUnsubscribe(v.unsubscribeUrl)}`,
  )
  return { subject, html }
}

export function renderReengagement(v: ReengagementVars): Rendered {
  const html = shell(
    '<h1>\u{1F37A} We Miss You!</h1>',
    `<p>Hey ${v.firstName},</p>
<p>Your Wake County Brusaders membership lapsed a little while back, and the club hasn't been the same without you.</p>
<p>Whether life got busy or you needed a break — no worries at all. If you're thinking about getting back into it, there's no better place than with your fellow Brusaders.</p>
<div class="details">
<strong>Come back anytime:</strong><br>
Single: $40 &middot; Dual (two Brusaders): $65<br>
Rejoin and you're right back in — meetings, events, Discord, and everything in the Members area.
</div>
<div style="text-align:center;margin:30px 0"><a href="${RENEW_URL}" class="cta">Rejoin the Brusaders</a></div>
<p>Hope to see you at the next one. \u{1F37B}</p>
${footerWithUnsubscribe(v.unsubscribeUrl)}`,
  )
  return { subject: `We miss you at Wake County Brusaders`, html }
}

type Deps = { resend?: { emails: { send: (o: unknown) => Promise<{ error: unknown }> } } }

export async function sendMembershipEmail(
  to: string,
  subject: string,
  html: string,
  deps: Deps = {},
): Promise<void> {
  const resend = deps.resend ?? new Resend(process.env.RESEND_API_KEY)
  const from = process.env.RESEND_FROM ?? 'WCB <noreply@wcbrusaders.com>'
  const { error } = await resend.emails.send({ from, to, subject, html, replyTo: CLUB_EMAIL })
  if (error) throw new Error(`Resend failed: ${String((error as { message?: string }).message ?? error)}`)
}
