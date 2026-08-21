import { test, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ prisma: { article: { findFirst: vi.fn() } } }))

beforeEach(() => { vi.clearAllMocks() })

test('getGovernance returns title and bodyHtml for a seeded row', async () => {
  const { prisma } = await import('@/lib/db')
  ;(prisma.article.findFirst as any).mockResolvedValue({
    title: 'Bylaws',
    bodyHtml: '<h2>Article One</h2><p>...</p>',
  })

  const { getGovernance } = await import('./governance')
  const result = await getGovernance('bylaws')

  expect(result).toEqual({ title: 'Bylaws', bodyHtml: '<h2>Article One</h2><p>...</p>' })
  expect(prisma.article.findFirst).toHaveBeenCalledWith({
    where: { slug: 'bylaws', kind: 'governance' },
  })
})

test('getGovernance returns null when no row exists', async () => {
  const { prisma } = await import('@/lib/db')
  ;(prisma.article.findFirst as any).mockResolvedValue(null)

  const { getGovernance } = await import('./governance')
  const result = await getGovernance('unknown' as any)

  expect(result).toBeNull()
})
