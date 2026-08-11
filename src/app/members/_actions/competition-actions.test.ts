import { test, expect, vi, beforeEach } from 'vitest'

const authMock = vi.fn()
const core = {
  addCompetition: vi.fn(), editCompetition: vi.fn(), deleteCompetition: vi.fn(),
  addEntry: vi.fn(), editEntry: vi.fn(), deleteEntry: vi.fn(),
}
vi.mock('@/lib/auth', () => ({ auth: () => authMock(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: {} }))
vi.mock('@/lib/competitions', async (orig) => {
  const actual = await (orig as any)()
  return { ...actual, ...Object.fromEntries(Object.entries(core).map(([k, fn]) => [k, (...a: any[]) => (fn as any)(...a)])) }
})

beforeEach(() => { authMock.mockReset(); Object.values(core).forEach((f) => f.mockReset()) })

test('all actions reject a logged-out caller', async () => {
  authMock.mockResolvedValue(null)
  const a = await import('./competition-actions')
  await expect(a.addCompetitionAction({} as any)).rejects.toThrow('unauthorized')
  await expect(a.deleteCompetitionAction('x')).rejects.toThrow('unauthorized')
})

test('deleteCompetitionAction requires board', async () => {
  const a = await import('./competition-actions')
  authMock.mockResolvedValue({ user: { memberId: 'm1', isBoard: false } })
  await expect(a.deleteCompetitionAction('c1')).rejects.toThrow('forbidden')
  authMock.mockResolvedValue({ user: { memberId: 'm1', isBoard: true } })
  core.deleteCompetition.mockResolvedValue({ ok: true })
  expect(await a.deleteCompetitionAction('c1')).toEqual({ ok: true })
  expect(core.deleteCompetition).toHaveBeenCalledWith('c1')
})

test('editCompetitionAction passes actor {memberId,isBoard} to the core (core enforces adder-or-board)', async () => {
  const a = await import('./competition-actions')
  authMock.mockResolvedValue({ user: { memberId: 'm7', isBoard: false } })
  core.editCompetition.mockResolvedValue({ ok: true })
  await a.editCompetitionAction('c1', { name: 'X' })
  expect(core.editCompetition).toHaveBeenCalledWith('c1', { name: 'X' }, { memberId: 'm7', isBoard: false })
})

test('entry actions pass the caller memberId as owner (core enforces owner-only)', async () => {
  const a = await import('./competition-actions')
  authMock.mockResolvedValue({ user: { memberId: 'm3', isBoard: false } })
  core.addEntry.mockResolvedValue({ ok: true, id: 'e1' })
  core.editEntry.mockResolvedValue({ ok: true })
  core.deleteEntry.mockResolvedValue({ ok: true })
  await a.addEntryAction('c1', { beerName: 'B', style: 'S', channel: 'dropoff', registered: false })
  expect(core.addEntry).toHaveBeenCalledWith('c1', { beerName: 'B', style: 'S', channel: 'dropoff', registered: false }, 'm3')
  await a.editEntryAction('e1', { beerName: 'X' })
  expect(core.editEntry).toHaveBeenCalledWith('e1', { beerName: 'X' }, 'm3')
  await a.deleteEntryAction('e1')
  expect(core.deleteEntry).toHaveBeenCalledWith('e1', 'm3')
})
