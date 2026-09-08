# Membership Lifecycle Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move membership intake (PayPal renewals/new members), transactional emails, and expiration reminders onto the WCB site so a payment reliably matches the right member (fixing the "paid-but-still-dunned" duplicate bug), with the roster sheet staying the source of truth.

**Architecture:** The site receives the PayPal IPN (verified), matches the payment to an existing member via a confidence ladder (exact/normalized/alias email → name-review → new) that also searches the Lapsed tab, writes the correct existing sheet row (or queues ambiguous ones for board review), and sends branded emails via Resend. A daily cron takes over expiration reminders + lapsing, retiring the Google Apps Script's reminder/lapse logic in the same deploy.

**Tech Stack:** Next.js App Router (route handlers, `runtime='nodejs'`), TypeScript, Vitest, Resend, googleapis (Sheets v4), Vercel cron.

**Spec:** `docs/superpowers/specs/2026-09-08-membership-lifecycle-to-site-design.md` (read it — the plan argues from it).

## Global Constraints
- **Sheet is source of truth.** The site WRITES the sheet; it does not become the DB-of-record. Roster sync (`src/lib/roster.ts`) already reads the sheet into the DB daily via `/api/cron/sync-roster`.
- **Matching auto-acts ONLY on high-confidence email matches** (exact / normalized / alias). Name-only matches are NEVER auto-merged — they go to a board-review queue. No silent merge of two people who share a name.
- **Emails from `noreply@wcbrusaders.com` via Resend** (`RESEND_FROM`), with `replyTo: club@wcbrusaders.com` and a visible "Questions? Email club@wcbrusaders.com" footer line on every email. Member-facing word is **"Dual"** (never "Couple"); stored sheet Tier value stays `Couple`.
- **Tiers:** Single = $40, Dual/Couple = $65 (exact-amount match, small float tolerance).
- **Idempotent payments:** an IPN retry for the same transaction must not double-process (double-renew / double-email).
- **IPN handler is `runtime='nodejs'`** (Prisma + IPN verification POST-back; cannot be Edge). Verify IPN authenticity before acting.
- **Never log raw IPN payloads** (PII). Log matched member id + outcome only.
- **Vitest**; `npx tsc --noEmit` clean; `npx next build` compiles. Commits via explicit `git add` of named paths (never `-A`).
- **NOT in Phase 1:** Google Group / Drive / Calendar / Discord access de-provision (that's Phase 2, blocked on the Discord cleanup project). Phase 1 writes the sheet's `Current`/`Expires` so the existing daily sync flips the DB `current` flag (which already gates site login) — that's the only "access" effect in Phase 1, and it's automatic.

---

## File Structure

- `src/lib/membership/normalize.ts` — email/name normalizers (pure). NEW.
- `src/lib/membership/match.ts` — the matching ladder over a members array (pure). NEW.
- `src/lib/membership/tiers.ts` — amount→tier + expiration/proration math (pure). NEW.
- `src/lib/membership/emails.ts` — branded HTML templates + a `sendMembershipEmail` sender (extends the Resend pattern in `src/lib/email.ts`). NEW.
- `src/lib/roster.ts` — MODIFY: widen `setRosterField` columns + add a row-number-locate write path + a "read all rows incl. Lapsed tab" helper for matching + reactivate-lapsed (move row Sheet1↔Lapsed).
- `src/lib/membership/process-payment.ts` — the lifecycle orchestrator (match → write → email). NEW.
- `src/lib/membership/paypal-ipn.ts` — parse + verify a PayPal IPN payload (pure-ish; verification via injected fetch). NEW.
- `src/app/api/webhooks/paypal/route.ts` — the IPN receiver (`runtime='nodejs'`). NEW.
- `src/lib/membership/reminders.ts` — reminder schedule + lapse logic (pure over rows + now). NEW.
- `src/app/api/cron/membership/route.ts` — daily cron calling reminders/lapse. NEW.
- `vercel.json` — MODIFY: add the membership cron (9am ET = 13:00 UTC).
- `prisma/schema.prisma` — MODIFY (Task 8 only): add a `PendingMatch` model for the board-review queue.
- `src/app/members/admin/membership/_actions.ts` — MODIFY: add pending-match resolve + partner-complete actions.
- Admin UI components under `src/components/members/` for the queue + partner completion. NEW.

---

## Task 1: Normalizers (email + name) — pure

**Files:**
- Create: `src/lib/membership/normalize.ts`
- Test: `src/lib/membership/normalize.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeEmailStrict(email: string): string` (lowercase+trim, and for gmail/googlemail hosts strip dots in the local part + drop `+tag`); `normalizeName(name: string): string` (lowercase, collapse internal whitespace, strip punctuation, trim).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { normalizeEmailStrict, normalizeName } from './normalize'

describe('normalizeEmailStrict', () => {
  it('lowercases + trims', () => {
    expect(normalizeEmailStrict('  Pete.H.Pray@Yahoo.com ')).toBe('pete.h.pray@yahoo.com')
  })
  it('strips gmail dots and +tags in the local part only', () => {
    expect(normalizeEmailStrict('pete.h.pray+comp@gmail.com')).toBe('petehpray@gmail.com')
    expect(normalizeEmailStrict('a.b.c@googlemail.com')).toBe('abc@googlemail.com')
  })
  it('leaves non-gmail dots intact', () => {
    expect(normalizeEmailStrict('first.last@sas.com')).toBe('first.last@sas.com')
  })
})

describe('normalizeName', () => {
  it('lowercases, collapses whitespace, strips punctuation', () => {
    expect(normalizeName("  Peter  H.  Pray-Jones  ")).toBe('peter h pray jones')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/membership/normalize.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```typescript
export function normalizeEmailStrict(email: string): string {
  const e = email.trim().toLowerCase()
  const at = e.lastIndexOf('@')
  if (at < 0) return e
  let local = e.slice(0, at)
  const host = e.slice(at + 1)
  const plus = local.indexOf('+')
  if (plus >= 0) local = local.slice(0, plus)
  if (host === 'gmail.com' || host === 'googlemail.com') local = local.replace(/\./g, '')
  return `${local}@${host}`
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/membership/normalize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/membership/normalize.ts src/lib/membership/normalize.test.ts
git commit -m "feat(membership): email/name normalizers for payment matching"
```

---

## Task 2: Matching ladder — pure

**Files:**
- Create: `src/lib/membership/match.ts`
- Test: `src/lib/membership/match.test.ts`

**Interfaces:**
- Consumes: `normalizeEmailStrict`, `normalizeName` (Task 1).
- Produces:
```typescript
export interface MatchMember {
  rowNumber: number          // physical sheet row (Sheet1 or Lapsed), 1-based
  tab: 'current' | 'lapsed'
  name: string | null
  emails: string[]           // all known emails: Email Address, Google Email, Partner Email, + alias column, lowercased
}
export interface PaymentIdentity { email: string; firstName: string; lastName: string }
export type MatchResult =
  | { kind: 'exact' | 'normalized' | 'alias'; member: MatchMember }
  | { kind: 'name-review'; candidates: MatchMember[] }
  | { kind: 'none' }
export function matchPayment(id: PaymentIdentity, members: MatchMember[]): MatchResult
```

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { matchPayment, type MatchMember } from './match'

const m = (over: Partial<MatchMember>): MatchMember =>
  ({ rowNumber: 1, tab: 'current', name: 'X', emails: [], ...over })

describe('matchPayment', () => {
  const members: MatchMember[] = [
    m({ rowNumber: 11, name: 'Peter Pray', emails: ['petehpray@gmail.com'] }),
    m({ rowNumber: 12, name: 'Jane Roe', emails: ['jane@roe.com'] }),
    m({ rowNumber: 40, tab: 'lapsed', name: 'Gus Gone', emails: ['gus@old.com'] }),
  ]
  it('exact email match (any known email)', () => {
    const r = matchPayment({ email: 'jane@roe.com', firstName: 'Jane', lastName: 'Roe' }, members)
    expect(r).toEqual({ kind: 'exact', member: members[1] })
  })
  it('normalized email match (gmail dots/plus) — Peter case', () => {
    const r = matchPayment({ email: 'Pete.H.Pray+x@gmail.com', firstName: 'Peter', lastName: 'Pray' }, members)
    expect(r.kind).toBe('normalized')
  })
  it('name match with NO email match -> review, never auto', () => {
    const r = matchPayment({ email: 'brand-new@nowhere.com', firstName: 'Peter', lastName: 'Pray' }, members)
    expect(r.kind).toBe('name-review')
    if (r.kind === 'name-review') expect(r.candidates.map((c) => c.rowNumber)).toEqual([11])
  })
  it('searches the Lapsed tab (rejoin)', () => {
    const r = matchPayment({ email: 'gus@old.com', firstName: 'Gus', lastName: 'Gone' }, members)
    expect(r.kind).toBe('exact')
    if (r.kind === 'exact') expect(r.member.tab).toBe('lapsed')
  })
  it('no match at all -> none', () => {
    const r = matchPayment({ email: 'nobody@x.com', firstName: 'No', lastName: 'Body' }, members)
    expect(r).toEqual({ kind: 'none' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/membership/match.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```typescript
import { normalizeEmailStrict, normalizeName } from './normalize'

export interface MatchMember {
  rowNumber: number
  tab: 'current' | 'lapsed'
  name: string | null
  emails: string[]
}
export interface PaymentIdentity { email: string; firstName: string; lastName: string }
export type MatchResult =
  | { kind: 'exact' | 'normalized' | 'alias'; member: MatchMember }
  | { kind: 'name-review'; candidates: MatchMember[] }
  | { kind: 'none' }

export function matchPayment(id: PaymentIdentity, members: MatchMember[]): MatchResult {
  const payEmail = id.email.trim().toLowerCase()
  // 1. exact
  for (const mem of members) if (mem.emails.some((e) => e.trim().toLowerCase() === payEmail)) return { kind: 'exact', member: mem }
  // 2. normalized
  const payNorm = normalizeEmailStrict(id.email)
  for (const mem of members) if (mem.emails.some((e) => normalizeEmailStrict(e) === payNorm)) return { kind: 'normalized', member: mem }
  // 3. name-review (never auto): normalized full-name equality
  const payName = normalizeName(`${id.firstName} ${id.lastName}`)
  const nameHits = members.filter((mem) => mem.name && normalizeName(mem.name) === payName)
  if (nameHits.length > 0) return { kind: 'name-review', candidates: nameHits }
  // 4. none
  return { kind: 'none' }
}
```

Note: `alias` is a match KIND for when the matched email came from the alias column; since aliases live in `emails[]`, an alias hit surfaces as `exact`. Keep the `alias` kind in the union for the write path to label audit entries when the resolver adds an alias; do not branch on it in v1 matching. (Documented so a reviewer doesn't flag the unused arm.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/membership/match.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/membership/match.ts src/lib/membership/match.test.ts
git commit -m "feat(membership): payment->member matching ladder (exact/normalized/name-review)"
```

---

## Task 3: Tier + expiration math — pure

**Files:**
- Create: `src/lib/membership/tiers.ts`
- Test: `src/lib/membership/tiers.test.ts`

**Interfaces:**
- Produces: `tierFromAmount(amount: number): 'Single' | 'Couple' | null` (stored value stays 'Couple'); `computeExpiration(currentExpires: string | null, now: Date): { expires: string; daysCredited: number }` — MM/DD/YYYY out; new members = now+365; early renewals credit remaining days.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { tierFromAmount, computeExpiration } from './tiers'

const NOW = new Date('2026-09-08T00:00:00Z')

describe('tierFromAmount', () => {
  it('maps exact amounts, tolerant of float noise', () => {
    expect(tierFromAmount(40)).toBe('Single')
    expect(tierFromAmount(40.001)).toBe('Single')
    expect(tierFromAmount(65)).toBe('Couple')
    expect(tierFromAmount(50)).toBeNull()
  })
})

describe('computeExpiration', () => {
  it('new member -> now + 365, 0 credited', () => {
    const r = computeExpiration(null, NOW)
    expect(r).toEqual({ expires: '9/8/2027', daysCredited: 0 })
  })
  it('early renewal credits remaining days', () => {
    // currently expires 30 days out -> new expiry = now + 365 + 30
    const r = computeExpiration('10/8/2026', NOW)
    expect(r.daysCredited).toBe(30)
    expect(r.expires).toBe('10/8/2027')
  })
  it('already-expired renewal credits 0', () => {
    const r = computeExpiration('1/1/2026', NOW)
    expect(r.daysCredited).toBe(0)
    expect(r.expires).toBe('9/8/2027')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/membership/tiers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```typescript
const DAY = 86400000
const TIERS: { name: 'Single' | 'Couple'; amount: number }[] = [
  { name: 'Single', amount: 40 },
  { name: 'Couple', amount: 65 },
]

export function tierFromAmount(amount: number): 'Single' | 'Couple' | null {
  for (const t of TIERS) if (Math.abs(amount - t.amount) < 0.01) return t.name
  return null
}

function fmt(d: Date): string {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`
}
function parse(s: string): Date | null {
  const p = s.split('/')
  if (p.length !== 3) return null
  const [mo, da, yr] = p.map((x) => parseInt(x, 10))
  if (!mo || !da || !yr) return null
  return new Date(Date.UTC(yr, mo - 1, da))
}

export function computeExpiration(currentExpires: string | null, now: Date): { expires: string; daysCredited: number } {
  let credited = 0
  if (currentExpires) {
    const cur = parse(currentExpires)
    if (cur && cur.getTime() > now.getTime()) credited = Math.floor((cur.getTime() - now.getTime()) / DAY)
  }
  const exp = new Date(now.getTime() + (365 + credited) * DAY)
  return { expires: fmt(exp), daysCredited: credited }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/membership/tiers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/membership/tiers.ts src/lib/membership/tiers.test.ts
git commit -m "feat(membership): tier-from-amount + expiration/proration math"
```

---

## Task 4: Roster write-path extension (sheet writer)

**Files:**
- Modify: `src/lib/roster.ts` (the `setRosterField` column union + `realWriteCell` column-letter resolver; add `readMembersForMatching`, `writeRosterCells`, `moveRowToTab`)
- Test: `src/lib/roster.membership.test.ts` (new test file; the pure column-letter helper + the row-locate logic with an injected fake sheets client)

**Interfaces:**
- Consumes: existing `sheetsClient`, `TAB='Sheet1'`, `LAPSED_TAB='Lapsed Members'`, `normalizeEmail`.
- Produces:
  - Widen `setRosterField`'s `column` union to include: `'Expires' | 'Payment Date' | 'Current' | 'Tier' | 'Name' | 'Email Address' | 'Last Reminder Sent' | 'Reminder Count' | 'Payment Emails'`.
  - `columnLetter(index: number): string` — supports 2-letter columns (roster runs A..T).
  - `readMembersForMatching(deps?): Promise<MatchMember[]>` — reads Sheet1 + Lapsed, returns rows with rowNumber/tab/name/emails (emails = Email Address + Google Email + Partner Email + Payment Emails split on comma, lowercased, blanks dropped).
  - `writeRosterCells(tab, rowNumber, updates: Record<string,string>, deps?): Promise<void>` — batch-write named columns to a specific physical row.
  - `moveRowToTab(fromTab, rowNumber, toTab, deps?): Promise<number>` — append the row to `toTab`, delete from `fromTab`; returns new row number (for rejoin: Lapsed→current, and for lapse: current→Lapsed).

- [ ] **Step 1: Write the failing test** (column-letter is the pure, high-value unit)

```typescript
import { describe, it, expect } from 'vitest'
import { columnLetter } from './roster'

describe('columnLetter', () => {
  it('single letters A..Z (0-based)', () => {
    expect(columnLetter(0)).toBe('A')
    expect(columnLetter(19)).toBe('T')  // roster's last column
    expect(columnLetter(25)).toBe('Z')
  })
  it('two letters past Z', () => {
    expect(columnLetter(26)).toBe('AA')
    expect(columnLetter(27)).toBe('AB')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/roster.membership.test.ts`
Expected: FAIL (`columnLetter` not exported; current code uses `String.fromCharCode(65 + colIdx)` inline, which breaks past Z).

- [ ] **Step 3: Write minimal implementation**

Add to `src/lib/roster.ts`:

```typescript
export function columnLetter(index: number): string {
  let n = index
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}
```

Replace the inline `String.fromCharCode(65 + colIdx)` in `realWriteCell` with `columnLetter(colIdx)`. Widen the `setRosterField` `column` param union to the list in Interfaces. Then add `readMembersForMatching`, `writeRosterCells`, `moveRowToTab` (Sheets `values.get`/`values.batchUpdate`/`spreadsheets.batchUpdate` with a `deleteDimension` request for the delete; mirror `syncPayments`/`realWriteCell` patterns already in the file; all with a `deps` param defaulting to the real sheets client for testability).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/roster.membership.test.ts` then `npx tsc --noEmit`
Expected: PASS + 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/roster.ts src/lib/roster.membership.test.ts
git commit -m "feat(roster): sheet write-path — 2-letter columns, widen fields, read-for-matching, move-between-tabs"
```

---

## Task 5: Email templates + sender

**Files:**
- Create: `src/lib/membership/emails.ts`
- Test: `src/lib/membership/emails.test.ts`

**Interfaces:**
- Produces: `renderWelcome(v)`, `renderRenewal(v)`, `renderReminder(v)`, `renderReengagement(v)` → `{ subject: string; html: string }`; and `sendMembershipEmail(to, subject, html, deps?): Promise<void>` (Resend, `from` = `RESEND_FROM` default `WCB <noreply@wcbrusaders.com>`, `replyTo: 'club@wcbrusaders.com'`). `deps.resend` injectable for tests.
- Template vars: welcome/renewal `{ firstName, tier, expiration, daysCredited? }`; reminder `{ firstName, expiration, daysLeft, phase: 'pre'|'post', unsubscribeUrl }`; reengagement `{ firstName, unsubscribeUrl }`.
- All templates: "Dual" not "Couple" (map tier 'Couple'→'Dual' for display); members-area link `https://www.wcbrusaders.com/members`; Discord invite link in welcome; footer "Questions? Email club@wcbrusaders.com".

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { renderWelcome, renderRenewal, renderReminder, sendMembershipEmail } from './emails'

describe('templates', () => {
  it('welcome: real subject, Dual not Couple, members link + discord + club@ footer', () => {
    const { subject, html } = renderWelcome({ firstName: 'Peter', tier: 'Couple', expiration: '9/1/2027' })
    expect(subject).toMatch(/welcome/i)
    expect(subject).not.toMatch(/message from wake county/i) // the old default-subject bug
    expect(html).toContain('Dual')
    expect(html).not.toContain('Couple')
    expect(html).toContain('wcbrusaders.com/members')
    expect(html).toContain('discord')
    expect(html).toContain('club@wcbrusaders.com')
  })
  it('renewal: says payment processed + active-through date', () => {
    const { subject, html } = renderRenewal({ firstName: 'Peter', tier: 'Single', expiration: '9/1/2027', daysCredited: 12 })
    expect(subject).toMatch(/renew/i)
    expect(html).toContain('9/1/2027')
  })
  it('reminder: includes the unsubscribe link', () => {
    const { html } = renderReminder({ firstName: 'Peter', expiration: '9/1/2026', daysLeft: 7, phase: 'pre', unsubscribeUrl: 'https://x/u?t=abc' })
    expect(html).toContain('https://x/u?t=abc')
  })
})

describe('sendMembershipEmail', () => {
  it('sends via Resend from noreply@ with replyTo club@', async () => {
    const send = vi.fn().mockResolvedValue({ error: null })
    await sendMembershipEmail('m@x.com', 'Subj', '<p>hi</p>', { resend: { emails: { send } } as never })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'm@x.com', subject: 'Subj', replyTo: 'club@wcbrusaders.com',
    }))
    const arg = send.mock.calls[0][0]
    expect(arg.from).toMatch(/noreply@wcbrusaders\.com/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/membership/emails.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Implement the four `render*` functions returning `{subject, html}` using the branded shell (amber `#d97706` header, details box, CTA, footer) — copy from the previewed templates in `_email_previews/` (welcome/renewal from the bot's real templates, reminder/re-engagement from the mockups). Map `tier==='Couple'` → display `'Dual'`. `sendMembershipEmail`:

```typescript
import { Resend } from 'resend'
type Deps = { resend?: { emails: { send: (o: unknown) => Promise<{ error: unknown }> } } }
export async function sendMembershipEmail(to: string, subject: string, html: string, deps: Deps = {}): Promise<void> {
  const resend = deps.resend ?? new Resend(process.env.RESEND_API_KEY)
  const from = process.env.RESEND_FROM ?? 'WCB <noreply@wcbrusaders.com>'
  const { error } = await resend.emails.send({ from, to, subject, html, replyTo: 'club@wcbrusaders.com' })
  if (error) throw new Error(`Resend failed: ${String((error as { message?: string }).message ?? error)}`)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/membership/emails.test.ts` + `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/membership/emails.ts src/lib/membership/emails.test.ts
git commit -m "feat(membership): branded email templates + Resend sender (noreply@ + replyTo club@)"
```

---

## Task 6: PayPal IPN parse + verify

**Files:**
- Create: `src/lib/membership/paypal-ipn.ts`
- Test: `src/lib/membership/paypal-ipn.test.ts`

**Interfaces:**
- Produces: `parseIpn(form: URLSearchParams): { txnId: string; email: string; firstName: string; lastName: string; amount: number; status: string; txnType: string; noteEmails: string[] }`; `isProcessablePayment(p): boolean` (status completed + txnType in web_accept/cart/express_checkout); `verifyIpn(rawBody: string, deps?): Promise<boolean>` — POSTs back `cmd=_notify-validate` + the raw body to PayPal, expects `VERIFIED`. `deps.fetch` + `deps.paypalUrl` injectable.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { parseIpn, isProcessablePayment, verifyIpn } from './paypal-ipn'

describe('parseIpn', () => {
  it('pulls the fields we need', () => {
    const f = new URLSearchParams({ txn_id: 'T1', payer_email: 'A@B.com', first_name: 'Peter', last_name: 'Pray', mc_gross: '65.00', payment_status: 'Completed', txn_type: 'web_accept' })
    const p = parseIpn(f)
    expect(p).toMatchObject({ txnId: 'T1', email: 'a@b.com', firstName: 'Peter', lastName: 'Pray', amount: 65, status: 'completed', txnType: 'web_accept' })
  })
})
describe('isProcessablePayment', () => {
  it('true only for completed web_accept/cart/express_checkout', () => {
    expect(isProcessablePayment({ status: 'completed', txnType: 'web_accept' } as never)).toBe(true)
    expect(isProcessablePayment({ status: 'pending', txnType: 'web_accept' } as never)).toBe(false)
    expect(isProcessablePayment({ status: 'completed', txnType: 'refund' } as never)).toBe(false)
  })
})
describe('verifyIpn', () => {
  it('posts back _notify-validate and requires VERIFIED', async () => {
    const fetch = vi.fn().mockResolvedValue({ text: async () => 'VERIFIED' })
    const ok = await verifyIpn('txn_id=T1', { fetch, paypalUrl: 'https://ipnpb.paypal.com/cgi-bin/webscr' })
    expect(ok).toBe(true)
    expect(fetch.mock.calls[0][1].body).toMatch(/^cmd=_notify-validate&txn_id=T1/)
  })
  it('false when PayPal says INVALID', async () => {
    const fetch = vi.fn().mockResolvedValue({ text: async () => 'INVALID' })
    expect(await verifyIpn('x=1', { fetch, paypalUrl: 'https://x' })).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/membership/paypal-ipn.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```typescript
export interface Ipn { txnId: string; email: string; firstName: string; lastName: string; amount: number; status: string; txnType: string; noteEmails: string[] }
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/membership/paypal-ipn.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/membership/paypal-ipn.ts src/lib/membership/paypal-ipn.test.ts
git commit -m "feat(membership): PayPal IPN parse + _notify-validate verification"
```

---

## Task 7: Lifecycle orchestrator + IPN route

**Files:**
- Create: `src/lib/membership/process-payment.ts`
- Create: `src/app/api/webhooks/paypal/route.ts`
- Test: `src/lib/membership/process-payment.test.ts`

**Interfaces:**
- Consumes: Tasks 2/3/4/5/6 (`matchPayment`, `tierFromAmount`, `computeExpiration`, roster read/write/move, email renderers+sender, ipn parse).
- Produces:
```typescript
export interface ProcessDeps {
  readMembers: () => Promise<MatchMember[]>
  writeCells: (tab: 'current'|'lapsed', row: number, updates: Record<string,string>) => Promise<void>
  moveRow: (from: 'current'|'lapsed', row: number, to: 'current'|'lapsed') => Promise<number>
  appendNew: (row: Record<string,string>) => Promise<number>
  sendEmail: (to: string, subject: string, html: string) => Promise<void>
  queuePending: (payload: Ipn, candidateRows: number[]) => Promise<void>
  alreadyProcessed: (txnId: string) => Promise<boolean>
  markProcessed: (txnId: string) => Promise<void>
  now: Date
}
export async function processPayment(ipn: Ipn, deps: ProcessDeps): Promise<{ outcome: 'renewed'|'new'|'reactivated'|'review'|'skipped-tier'|'duplicate' }>
```
Logic: dup-guard (`alreadyProcessed`) → `tierFromAmount` (null → skipped-tier) → `matchPayment`:
  - exact/normalized/alias on `current` → renewal: `computeExpiration(from that row) → writeCells(Expires/Payment Date/Current=Yes/reset Last Reminder+Reminder Count)` → send renewal email → `markProcessed`.
  - exact/normalized on `lapsed` → reactivate: `moveRow(lapsed→current)` then writeCells + welcome-back (renewal) email.
  - name-review → `queuePending` + send a soft "payment received, finalizing" ack → outcome 'review'.
  - none → new: `appendNew` (Name/Tier/Email/Payment Date/Expires/Current=Yes/Join Date) → welcome email → outcome 'new'.

- [ ] **Step 1: Write the failing test** (fully DI'd, no network/sheets)

```typescript
import { describe, it, expect, vi } from 'vitest'
import { processPayment } from './process-payment'
import type { Ipn } from './paypal-ipn'

const baseIpn: Ipn = { txnId: 'T1', email: 'petehpray@yahoo.com', firstName: 'Peter', lastName: 'Pray', amount: 40, status: 'completed', txnType: 'web_accept', noteEmails: [] }
function deps(over: Partial<Parameters<typeof processPayment>[1]> = {}) {
  return {
    readMembers: async () => [{ rowNumber: 11, tab: 'current' as const, name: 'Peter Pray', emails: ['petehpray@gmail.com'] }],
    writeCells: vi.fn(async () => {}), moveRow: vi.fn(async () => 11), appendNew: vi.fn(async () => 99),
    sendEmail: vi.fn(async () => {}), queuePending: vi.fn(async () => {}),
    alreadyProcessed: async () => false, markProcessed: vi.fn(async () => {}), now: new Date('2026-09-08T00:00:00Z'),
    ...over,
  }
}
describe('processPayment', () => {
  it('Peter (yahoo pay, gmail row) -> NAME REVIEW, not a duplicate, sends soft ack', async () => {
    const d = deps()
    const r = await processPayment(baseIpn, d)
    expect(r.outcome).toBe('review')
    expect(d.queuePending).toHaveBeenCalledWith(baseIpn, [11])
    expect(d.appendNew).not.toHaveBeenCalled()   // the bug that was: NO new duplicate row
    expect(d.sendEmail).toHaveBeenCalled()         // soft finalizing ack
  })
  it('exact email match -> renewal writes the existing row, resets reminders', async () => {
    const d = deps({ readMembers: async () => [{ rowNumber: 11, tab: 'current', name: 'Peter Pray', emails: ['petehpray@yahoo.com'] }] })
    const r = await processPayment(baseIpn, d)
    expect(r.outcome).toBe('renewed')
    expect(d.writeCells).toHaveBeenCalledWith('current', 11, expect.objectContaining({ 'Current': 'Yes', 'Last Reminder Sent': '', 'Reminder Count': '0' }))
  })
  it('duplicate txn -> skipped, no writes/emails', async () => {
    const d = deps({ alreadyProcessed: async () => true })
    const r = await processPayment(baseIpn, d)
    expect(r.outcome).toBe('duplicate')
    expect(d.writeCells).not.toHaveBeenCalled(); expect(d.sendEmail).not.toHaveBeenCalled()
  })
  it('unknown amount -> skipped-tier', async () => {
    const r = await processPayment({ ...baseIpn, amount: 12 }, deps())
    expect(r.outcome).toBe('skipped-tier')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/membership/process-payment.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Implement `processPayment` per the Logic above. Then the route (`src/app/api/webhooks/paypal/route.ts`): `export const runtime='nodejs'`, `export const dynamic='force-dynamic'`; `POST` reads the raw body text, `verifyIpn(raw)` (reject non-VERIFIED with 200 + log), `parseIpn(new URLSearchParams(raw))`, `isProcessablePayment` gate (else 200), build real `ProcessDeps` (wire Task-4 roster fns, Task-5 email, a `PendingMatch`/processed store — see Task 8), `await processPayment(...)`, return 200 fast. Never log the raw payload; log `{ txnId, outcome }`.

For `alreadyProcessed`/`markProcessed` in this task, back them with the existing `Payment` table's `@@unique([date, netDues, source])` as the idempotency key (or a dedicated processed-txn set added in Task 8). For now inject them; the route wires the real store.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/membership/process-payment.test.ts` + `npx tsc --noEmit` + `npx next build`
Expected: PASS + route compiles.

- [ ] **Step 5: Commit**

```bash
git add src/lib/membership/process-payment.ts src/app/api/webhooks/paypal/route.ts src/lib/membership/process-payment.test.ts
git commit -m "feat(membership): lifecycle orchestrator + verified PayPal IPN route (fixes duplicate-on-mismatch)"
```

---

## Task 8: Board-review queue (schema + admin actions + UI)

**Files:**
- Modify: `prisma/schema.prisma` (add `PendingMatch`)
- Modify: `src/app/members/admin/membership/_actions.ts` (resolve + partner-complete actions)
- Create: `src/components/members/PendingMatchQueue.tsx`, `src/components/members/PartnerComplete.tsx`
- Modify: `src/app/members/admin/membership/page.tsx` (render the queue)
- Test: `src/app/members/admin/membership/_actions.test.ts`

**Interfaces:**
- `PendingMatch { id, txnId @unique, payloadJson, candidateRows String, createdAt, resolvedAt? }`.
- `resolvePendingMatchAction(id, choice: {kind:'confirm', rowNumber:number, addAlias:string} | {kind:'new'})` — board-gated; confirm → renew that row + write the payer email to the row's `Payment Emails` alias column; new → append. Reuses Task-4/7 logic.
- `completePartnerAction(rowNumber, name, email)` — board-gated; writes Name + Email to the placeholder row via Task-4 `writeRosterCells` + sends the partner their welcome (Task 5).

- [ ] **Step 1: Write the failing test** (the board gate + the confirm→alias path, DI'd)

```typescript
import { describe, it, expect, vi } from 'vitest'
import { resolvePendingCore } from '@/app/members/admin/membership/_actions'

describe('resolvePendingCore', () => {
  it('rejects when actor is not board', async () => {
    const r = await resolvePendingCore(null as never, 'p1', { kind: 'new' }, {} as never)
    expect(r).toEqual({ ok: false, reason: 'forbidden' })
  })
  it('confirm renews the chosen row AND stores the payer email as an alias', async () => {
    const writeCells = vi.fn(async () => {})
    const deps = { getPending: async () => ({ payload: { email: 'petehpray@yahoo.com', amount: 40 }, candidateRows: [11] }), writeCells, appendNew: vi.fn(), sendEmail: vi.fn(), markResolved: vi.fn(async () => {}), now: new Date('2026-09-08T00:00:00Z'), readRow: async () => ({ expires: '10/8/2026', paymentEmails: '' }) }
    const r = await resolvePendingCore({ memberId: 'm', email: 'o@x.com' }, 'p1', { kind: 'confirm', rowNumber: 11, addAlias: 'petehpray@yahoo.com' }, deps as never)
    expect(r.ok).toBe(true)
    expect(writeCells).toHaveBeenCalledWith('current', 11, expect.objectContaining({ 'Current': 'Yes' }))
    expect(writeCells).toHaveBeenCalledWith('current', 11, expect.objectContaining({ 'Payment Emails': expect.stringContaining('petehpray@yahoo.com') }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/members/admin/membership/_actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Add `PendingMatch` to schema (do NOT `db push` in this task — schema-only; the push is coordinated at deploy, Task 9). Implement `resolvePendingCore(actor, id, choice, deps)` pure-core + a `'use server'` wrapper `resolvePendingMatchAction` using `requireBoard()` + real deps (Task-4 roster fns, Task-5 email, prisma PendingMatch). Implement `completePartnerAction` similarly. Build `PendingMatchQueue.tsx` (board-only list: "$X from <email> (<name>) — looks like <candidate>? [Confirm renewal] [It's someone new]") + `PartnerComplete.tsx` (name+email fields on a placeholder row) and render them on the membership admin page.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/members/admin/membership/_actions.test.ts` + `npx tsc --noEmit` + `npx next build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma src/app/members/admin/membership/_actions.ts src/components/members/PendingMatchQueue.tsx src/components/members/PartnerComplete.tsx src/app/members/admin/membership/page.tsx src/app/members/admin/membership/_actions.test.ts
git commit -m "feat(admin): board pending-match queue + couple/partner completion"
```

---

## Task 9: Reminder + lapse cron + Apps Script cutover

**Files:**
- Create: `src/lib/membership/reminders.ts`
- Create: `src/app/api/cron/membership/route.ts`
- Modify: `vercel.json`
- Test: `src/lib/membership/reminders.test.ts`

**Interfaces:**
- Produces: `dueReminders(rows: ReminderRow[], now: Date): { row: ReminderRow; phase: 'pre'|'post'; daysLeft: number }[]` — pre at 14/7/2 days before expiry, post at 2/4 days after; respects Opt Out (`STOP`/`Yes`) and ≥2-day spacing from Last Reminder Sent. `dueLapses(rows, now): ReminderRow[]` — >7 days past expiry → move to Lapsed + send re-engagement.
- `ReminderRow { rowNumber, name, email, expires, lastReminder, reminderCount, optOut }`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { dueReminders, dueLapses, type ReminderRow } from './reminders'
const NOW = new Date('2026-09-08T00:00:00Z')
const row = (o: Partial<ReminderRow>): ReminderRow => ({ rowNumber: 2, name: 'A', email: 'a@x.com', expires: '', lastReminder: '', reminderCount: 0, optOut: '', ...o })

describe('dueReminders', () => {
  it('fires pre at exactly 7 days out', () => {
    const r = dueReminders([row({ expires: '9/15/2026' })], NOW)
    expect(r).toHaveLength(1); expect(r[0].phase).toBe('pre'); expect(r[0].daysLeft).toBe(7)
  })
  it('fires post at 2 days after expiry', () => {
    const r = dueReminders([row({ expires: '9/6/2026' })], NOW)
    expect(r[0].phase).toBe('post')
  })
  it('skips opted-out + recently-reminded', () => {
    expect(dueReminders([row({ expires: '9/15/2026', optOut: 'STOP' })], NOW)).toHaveLength(0)
    expect(dueReminders([row({ expires: '9/15/2026', lastReminder: '9/7/2026' })], NOW)).toHaveLength(0) // <2 days ago
  })
})
describe('dueLapses', () => {
  it('lapses >7 days past expiry', () => {
    expect(dueLapses([row({ expires: '8/31/2026' })], NOW).map(r => r.rowNumber)).toEqual([2])
    expect(dueLapses([row({ expires: '9/3/2026' })], NOW)).toHaveLength(0) // 5 days, not yet
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/membership/reminders.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Implement `dueReminders`/`dueLapses` (UTC date math; mirror the Apps Script rules exactly: preExpirationDays [14,7,2], postExpirationDays [2,4], daysBeforeMovingToLapsed 7, ≥2-day spacing, Opt Out STOP/Yes). Then the cron route (`src/app/api/cron/membership/route.ts`, `dynamic='force-dynamic'`, `maxDuration=60`, `CRON_SECRET` bearer check exactly like `track-shipments`): read reminder rows via Task-4, `dueReminders` → send (Task 5) + write Last Reminder Sent/Reminder Count; `dueLapses` → `moveRow(current→lapsed)` + send re-engagement. Add to `vercel.json` crons: `{ "path": "/api/cron/membership", "schedule": "0 13 * * *" }` (9am ET). 

**Cutover (do in the deploy, Task 10) — SURGICAL, not a kill switch:** inside the Apps Script's `checkMemberships()`, comment out ONLY the `processReminder` loop + the `processLapsedMembers()` call, IN THE SAME WINDOW the site cron goes live (running both = double-dunning). **DO NOT disable the whole script.** Explicitly KEEP RUNNING: `syncGroupMembership()` (Google Group add/remove → Drive/Calendar access — NOT replaced in Phase 1, that's Phase 2) and the separate `processStopReplies` trigger (Gmail "STOP" opt-out parsing — also not replaced). Only the two reminder/lapse functions move to the site.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/membership/reminders.test.ts` + `npx tsc --noEmit` + `npx next build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/membership/reminders.ts src/app/api/cron/membership/route.ts vercel.json src/lib/membership/reminders.test.ts
git commit -m "feat(membership): reminder+lapse cron (9am) mirroring Apps Script rules"
```

---

## Task 10: Deploy + cutover (PAUSE for user)

**Files:** none (ops).

- [ ] **Step 1:** Full suite green: `npx vitest run`; `npx tsc --noEmit`; `npx next build`.
- [ ] **Step 2:** Prod `prisma db push` (PendingMatch) via the Fly tunnel (coordinated — memory pattern: `flyctl proxy 15432:5432 --app wcb-hub-db`, mv .env aside + localhost DATABASE_URL + trap-restore). Verify the table exists.
- [ ] **Step 3:** Set env on Vercel: `PAYPAL_IPN_URL` (`https://ipnpb.paypal.com/cgi-bin/webscr`), confirm `CRON_SECRET` + `RESEND_*` present.
- [ ] **Step 4:** Merge → main → Vercel deploy. Verify route `/api/webhooks/paypal` responds; `/api/cron/membership` 401s without the bearer.
- [ ] **Step 5:** **Repoint PayPal IPN** (PayPal account → Notifications → IPN URL) to `https://www.wcbrusaders.com/api/webhooks/paypal`. Send a PayPal IPN test / a live $40 to confirm end-to-end (a real member renews the right row + gets the email).
- [ ] **Step 6:** **CUTOVER (surgical — the Apps Script keeps running):** in `checkMemberships()`, comment out ONLY the `processReminder` loop + the `processLapsedMembers()` call. **KEEP `syncGroupMembership()`** (Drive/Calendar group access — Phase 2, NOT replaced) **and the `processStopReplies` trigger** (Gmail STOP opt-outs — NOT replaced). Do this in the SAME window the site cron goes live (both running = double-dunning). Then retire the bot's `paypal_handler` route (stop it receiving IPN) since PayPal now points at the site.

---

## Self-Review
- **Spec coverage:** matching ladder+Lapsed (T2), aliases (T2 emails[] + T8 write), sheet-source/write (T4), tiers/proration (T3), 4 emails + Dual + members-area + replyTo/unsubscribe (T5), IPN verified + idempotent (T6/T7), duplicate-fix (T7 test is the Peter case), reminders 14/7/2+2/4 + lapse + Apps Script cutover (T9/T10), board queue + partner completion (T8), real-time welcome/renewal vs 9am cron (T7 vs T9). Phase 2 access explicitly excluded. ✓
- **Placeholders:** none — every code step has real code.
- **Type consistency:** `MatchMember`/`Ipn`/`ProcessDeps`/`ReminderRow` defined once and reused; `columnLetter`/`writeRosterCells`/`moveRow`/`readMembersForMatching` names consistent across T4→T7→T9.
- **Risk:** the cutover (T10 step 6) is the double-dunning-critical step; T4's move-between-tabs + T7's write paths touch the live sheet — all pure logic is unit-tested with injected fakes so no test hits the real sheet/PayPal/Resend.
