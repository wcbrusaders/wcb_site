import { normalizeEmail } from '@/lib/roster'

const MEMBERS_URL = 'https://www.wcbrusaders.com/members'
const DISCORD_URL = 'https://discord.gg/UKyMAVUHjM'
const CLUB_EMAIL = 'club@wcbrusaders.com'

// Same amber "System B" shell used by src/lib/membership/emails.ts. Mirrored
// here rather than imported since emails.ts doesn't currently export its
// SHARED_STYLE/shell/FOOTER — keeping this file's own copy avoids widening
// emails.ts's public surface for a single new caller. Any visual change to
// the shared shell should be applied to both.
const SHARED_STYLE = `
body{font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}
.header{background-color:#d97706;color:white;padding:20px;text-align:center;border-radius:5px 5px 0 0}
.content{background-color:#f9f9f9;padding:30px;border-radius:0 0 5px 5px}
.details{background-color:white;padding:15px;margin:20px 0;border-left:4px solid #d97706}
.hub{background-color:#fff7ed;border:1px solid #fed7aa;padding:18px;margin:20px 0;border-radius:6px;text-align:center}
.cta{background-color:#d97706;color:white;padding:12px 30px;text-decoration:none;display:inline-block;margin:10px 5px;border-radius:5px}
.cta-secondary{color:#d97706;text-decoration:none;display:inline-block;margin:6px 8px;font-size:.95em}
.footer{text-align:center;margin-top:30px;font-size:.9em;color:#666}
`

const FOOTER = `
<div class="footer">
<p>Cheers,<br>Wake County Brusaders</p>
<p>Questions? Email <a href="mailto:${CLUB_EMAIL}">${CLUB_EMAIL}</a></p>
</div>
`

function shell(headerHtml: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>${SHARED_STYLE}</style></head><body>
<div class="header">${headerHtml}</div>
<div class="content">
${bodyHtml}
</div></body></html>`
}

export type NudgeCandidate = {
  name: string
  email: string          // primary (roster Email Address) — where the nudge is sent
  emails: string[]        // ALL known emails (Email Address + Google Email + Partner Email);
                          // "already linked" is checked against every one of these, since a
                          // member often links Discord under their Google Email, not column C
  current: boolean
  optOut: string
}

export type NudgeRecipient = { email: string; name: string }

function isOptedOut(optOut: string): boolean {
  return optOut === 'STOP' || optOut === 'Yes'
}

// Pure filter for the board-triggered Discord nudge blast. A member is
// eligible only if ALL of:
//   - current-roster (current === true) — never a lapsed member
//   - has a real email — not blank, not the Couple/Dual "NEEDS UPDATE"
//     partner-placeholder sentinel (see roster.ts's readReminderRows, which
//     already excludes this row shape at the source)
//   - not already Discord-linked — checked against ALL of the member's known
//     emails (m.emails), not just the primary. Members frequently link Discord
//     under their Google Email rather than the roster's Email Address column,
//     so checking only the primary produced false "unlinked" flags.
//   - not opted out of club emails (Opt Out !== 'STOP'/'Yes', mirrors
//     reminders.ts's isOptedOut)
export function selectNudgeRecipients(
  members: NudgeCandidate[],
  linkedEmails: Set<string>,
): NudgeRecipient[] {
  const out: NudgeRecipient[] = []
  for (const m of members) {
    if (!m.current) continue
    const email = m.email.trim()
    if (!email) continue
    if (email.toUpperCase() === 'NEEDS UPDATE') continue
    if (isOptedOut(m.optOut)) continue
    // Linked if ANY known email is in the link table (Google Email, Partner
    // Email, or the primary) — a member linked under any of them is linked.
    const anyLinked = m.emails
      .map((e) => normalizeEmail(e.trim()))
      .filter(Boolean)
      .some((e) => linkedEmails.has(e))
    if (anyLinked) continue
    out.push({ email: normalizeEmail(email), name: m.name })
  }
  return out
}

type NudgeVars = { firstName: string }
type Rendered = { subject: string; html: string }

// "Two birds" email: warm re-invite for anyone who hasn't joined the Discord
// server yet, PLUS /link instructions for anyone already in the server but
// not yet linked to their club account. We can't tell which case applies from
// the roster alone (that's the whole reason this list exists — it's everyone
// NOT in Discord_Member_Link, which includes both "never joined" and "joined
// but never ran /link"), so one email serves both.
export function renderDiscordNudge(v: NudgeVars): Rendered {
  const html = shell(
    '<h1>\u{1F37A} Join us on Discord!</h1>',
    `<p>Hey ${v.firstName}!</p>
<p>We've missed you in Discord! Our Wake County Brusaders Discord community is thriving — brewing chatter, grain buys, event planning, and a lot of good beer talk. Come join us.</p>
<div class="hub">
<p style="margin:0 0 10px"><strong>Not in the server yet?</strong></p>
<a href="${DISCORD_URL}" class="cta">Join the Discord</a>
</div>
<div class="details">
<strong>Already in the server?</strong><br>
If you've joined but haven't linked your Discord handle to your club account yet, just run the <code>/link</code> command in Discord (DM the bot) using the same email address you use for your membership. That's what connects your Discord account to your Brusaders membership — no reply needed here.
</div>
<p>Everything else — resources, the brewing knowledge base, competitions, lending library, event calendar — is in your <a href="${MEMBERS_URL}">Members area</a>.</p>
${FOOTER}`,
  )
  return { subject: 'Join the WCB Discord community', html }
}
