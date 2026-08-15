import { describe, it, expect } from 'vitest'
import { formatAudit } from './audit'

describe('formatAudit', () => {
  it('renders action, target, and detail', () => {
    expect(formatAudit('set-secondary-email', 'Jane Doe', 'added jane2@x.com'))
      .toBe('set-secondary-email → Jane Doe: added jane2@x.com')
  })
  it('omits the target arrow when no target', () => {
    expect(formatAudit('viewed-roster', null, null)).toBe('viewed-roster')
  })
  it('includes target but no detail when detail is null', () => {
    expect(formatAudit('set-partner', 'Jane Doe', null)).toBe('set-partner → Jane Doe')
  })
})
