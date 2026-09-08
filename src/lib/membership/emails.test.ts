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
