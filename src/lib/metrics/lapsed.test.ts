import { describe, it, expect, vi } from 'vitest'
import { fetchLapsedMembers, LAPSE_REASONS } from './lapsed'

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

// A fake db whose member.findMany returns the given rows and records the
// query args, so we can assert the where-filter without a real Prisma.
function fakeDb(rows: unknown[], capture: { args?: unknown } = {}) {
  return {
    member: {
      findMany: vi.fn(async (args: unknown) => {
        capture.args = args
        return rows
      }),
    },
  } as never
}

describe('fetchLapsedMembers', () => {
  it('queries only lapsed + former members', async () => {
    const capture: { args?: unknown } = {}
    await fetchLapsedMembers(fakeDb([], capture))
    const args = capture.args as { where: { membershipState: { in: string[] } } }
    expect(args.where.membershipState.in.sort()).toEqual(['former', 'lapsed'])
  })

  it('returns rows sorted most-recently-expired first, with tenure-at-lapse in whole months', async () => {
    const rows = [
      { id: 'a', name: 'Alice', tier: 'Single', membershipState: 'lapsed', joinDate: d('2023-10-03'), expires: d('2024-10-03'), lapseReason: null, lapseNote: null }, // 12 mo
      { id: 'b', name: 'Bob', tier: 'Couple', membershipState: 'former', joinDate: d('2024-05-15'), expires: d('2025-10-11'), lapseReason: 'moved away', lapseNote: 'relocated', }, // 16 mo, newest expiry
      { id: 'c', name: 'Cara', tier: 'Single', membershipState: 'lapsed', joinDate: d('2024-09-20'), expires: d('2025-09-01'), lapseReason: null, lapseNote: null }, // 11 mo
    ]
    const result = await fetchLapsedMembers(fakeDb(rows))

    // newest expiry first: Bob (2025-10-11), Cara (2025-09-01), Alice (2024-10-03)
    expect(result.map((r) => r.id)).toEqual(['b', 'c', 'a'])
    expect(result[0]).toEqual({
      id: 'b', name: 'Bob', tier: 'Couple', state: 'former',
      expires: '2025-10-11', tenureMonths: 16, lapseReason: 'moved away', lapseNote: 'relocated',
    })
    expect(result[2].tenureMonths).toBe(12) // Alice
    expect(result[1].tenureMonths).toBe(11) // Cara
  })

  it('handles missing name / joinDate / expires without throwing', async () => {
    const rows = [
      { id: 'x', name: null, tier: null, membershipState: 'former', joinDate: null, expires: null, lapseReason: null, lapseNote: null },
      { id: 'y', name: 'Yui', tier: 'Single', membershipState: 'lapsed', joinDate: d('2023-01-01'), expires: null, lapseReason: null, lapseNote: null },
    ]
    const result = await fetchLapsedMembers(fakeDb(rows))
    const x = result.find((r) => r.id === 'x')!
    expect(x.name).toBe('Unknown')
    expect(x.expires).toBeNull()
    expect(x.tenureMonths).toBeNull()
    // y has joinDate but no expires -> can't compute tenure
    expect(result.find((r) => r.id === 'y')!.tenureMonths).toBeNull()
  })

  it('does not leak internal sort key in the returned rows', async () => {
    const rows = [
      { id: 'a', name: 'Alice', tier: 'Single', membershipState: 'lapsed', joinDate: d('2023-10-03'), expires: d('2024-10-03'), lapseReason: null, lapseNote: null },
    ]
    const result = await fetchLapsedMembers(fakeDb(rows))
    expect(result[0]).not.toHaveProperty('_sort')
  })
})

describe('LAPSE_REASONS', () => {
  it('includes the expected fixed set and unknown/other fallbacks', () => {
    expect(LAPSE_REASONS).toContain('unknown')
    expect(LAPSE_REASONS).toContain('other')
    expect(LAPSE_REASONS).toContain('life got busy')
    // frozen tuple: no duplicates
    expect(new Set(LAPSE_REASONS).size).toBe(LAPSE_REASONS.length)
  })
})
