import { describe, it, expect } from 'vitest'
import { selectNudgeRecipients, renderDiscordNudge, type NudgeCandidate } from './discord-nudge'

const m = (over: Partial<NudgeCandidate> = {}): NudgeCandidate => ({
  name: 'Jane Doe',
  email: 'jane@x.com',
  current: true,
  optOut: '',
  ...over,
})

describe('selectNudgeRecipients', () => {
  it('includes a current, unlinked, not-opted-out member with a real email', () => {
    const out = selectNudgeRecipients([m()], new Set())
    expect(out).toEqual([{ email: 'jane@x.com', name: 'Jane Doe' }])
  })

  it('excludes a member already Discord-linked', () => {
    const out = selectNudgeRecipients([m({ email: 'linked@x.com' })], new Set(['linked@x.com']))
    expect(out).toHaveLength(0)
  })

  it('linked-set match is case/whitespace-insensitive', () => {
    const out = selectNudgeRecipients([m({ email: '  Linked@X.com  ' })], new Set(['linked@x.com']))
    expect(out).toHaveLength(0)
  })

  it('excludes opted-out members (STOP or Yes)', () => {
    const out = selectNudgeRecipients(
      [m({ email: 'a@x.com', optOut: 'STOP' }), m({ email: 'b@x.com', optOut: 'Yes' })],
      new Set(),
    )
    expect(out).toHaveLength(0)
  })

  it('excludes blank emails', () => {
    const out = selectNudgeRecipients([m({ email: '' })], new Set())
    expect(out).toHaveLength(0)
  })

  it('excludes the NEEDS UPDATE partner placeholder sentinel (case-insensitive)', () => {
    const out = selectNudgeRecipients(
      [m({ email: 'NEEDS UPDATE' }), m({ email: 'needs update' })],
      new Set(),
    )
    expect(out).toHaveLength(0)
  })

  it('excludes lapsed (current: false) members', () => {
    const out = selectNudgeRecipients([m({ current: false })], new Set())
    expect(out).toHaveLength(0)
  })

  it('filters a mixed batch down to exactly the eligible members', () => {
    const rows = [
      m({ email: 'current-unlinked@x.com' }),
      m({ email: 'current-linked@x.com' }),
      m({ email: 'lapsed@x.com', current: false }),
      m({ email: 'optout@x.com', optOut: 'STOP' }),
      m({ email: '' }),
      m({ email: 'NEEDS UPDATE' }),
    ]
    const linked = new Set(['current-linked@x.com'])
    const out = selectNudgeRecipients(rows, linked)
    expect(out.map((r) => r.email)).toEqual(['current-unlinked@x.com'])
  })

  it('returns [] for an empty roster', () => {
    expect(selectNudgeRecipients([], new Set())).toEqual([])
  })
})

describe('renderDiscordNudge', () => {
  it('includes the invite link, /link instructions, members-area link, and club@ footer', () => {
    const { subject, html } = renderDiscordNudge({ firstName: 'Peter' })
    expect(subject).toMatch(/discord/i)
    expect(html).toContain('https://discord.gg/UKyMAVUHjM')
    expect(html).toContain('/link')
    expect(html).toContain('wcbrusaders.com/members')
    expect(html).toContain('club@wcbrusaders.com')
    expect(html).toContain('Peter')
  })

  it('covers both cases — inviting the never-joined AND linking the already-joined', () => {
    const { html } = renderDiscordNudge({ firstName: 'Peter' })
    // Warm invite framing for someone not yet in the server.
    expect(html).toMatch(/miss|thriving|join/i)
    // Linking instructions for someone already in the server.
    expect(html).toMatch(/already.*(server|discord)/i)
  })
})
