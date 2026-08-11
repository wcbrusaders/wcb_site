import { test, expect } from 'vitest'
import {
  mapsUrl, isPast, commitByDate, deliverByDate, podTotal,
  listMemberComps, listOfficerComps, computeBannerItems,
  addCompetition, editCompetition, deleteCompetition, addEntry, editEntry, deleteEntry,
} from './competitions'

const day = 86400000
const NOW = new Date('2026-09-01T00:00:00Z')

test('mapsUrl encodes the address into a google maps query URL', () => {
  expect(mapsUrl('123 Main St, Holly Springs NC')).toBe(
    'https://www.google.com/maps/search/?api=1&query=123%20Main%20St%2C%20Holly%20Springs%20NC'
  )
})

test('isPast: shipping deadline before now is past', () => {
  expect(isPast(new Date(NOW.getTime() - day), NOW)).toBe(true)
  expect(isPast(new Date(NOW.getTime() + day), NOW)).toBe(false)
})

test('commitByDate/deliverByDate are 7 days before shipping deadline', () => {
  const ship = new Date('2026-09-20T00:00:00Z')
  expect(commitByDate(ship).toISOString()).toBe('2026-09-13T00:00:00.000Z')
  expect(deliverByDate(ship).toISOString()).toBe('2026-09-13T00:00:00.000Z')
})

test('podTotal counts only club_ship entries times bottlesRequired', () => {
  const entries = [{ channel: 'club_ship' as const }, { channel: 'club_ship' as const }, { channel: 'self_ship' as const }, { channel: 'dropoff' as const }]
  expect(podTotal(entries, 3)).toBe(6) // 2 club_ship * 3 bottles
  expect(podTotal([], 3)).toBe(0)
})

// --- fake db ---
function db(comps: any[], entries: any[], members: any[] = []) {
  const findComp = (id: string) => comps.find((c) => c.id === id)
  const findEntry = (id: string) => entries.find((e) => e.id === id)
  return {
    competition: {
      findMany: async ({ where }: any = {}) => {
        // where.shippingDeadline is { lt: now } (past) or { gte: now } (active)
        let rows = comps
        if (where?.shippingDeadline?.lt) rows = rows.filter((c) => c.shippingDeadline < where.shippingDeadline.lt)
        if (where?.shippingDeadline?.gte) rows = rows.filter((c) => c.shippingDeadline >= where.shippingDeadline.gte)
        return rows.map((c) => ({ ...c, entries: entries.filter((e) => e.competitionId === c.id) }))
      },
      findUnique: async ({ where }: any) => findComp(where.id) ?? null,
      create: async ({ data }: any) => { const row = { id: 'newcomp', ...data }; comps.push(row); return row },
      update: async ({ where, data }: any) => { Object.assign(findComp(where.id), data); return findComp(where.id) },
      delete: async ({ where }: any) => { const i = comps.findIndex((c) => c.id === where.id); comps.splice(i, 1); return {} },
    },
    compEntry: {
      findUnique: async ({ where }: any) => findEntry(where.id) ?? null,
      create: async ({ data }: any) => { const row = { id: 'newentry', ...data }; entries.push(row); return row },
      update: async ({ where, data }: any) => { Object.assign(findEntry(where.id), data); return findEntry(where.id) },
      delete: async ({ where }: any) => { const i = entries.findIndex((e) => e.id === where.id); entries.splice(i, 1); return {} },
    },
    member: {
      findMany: async ({ where }: any) => members.filter((m) => (where?.id?.in ?? []).includes(m.id)),
    },
  } as any
}

const comp = (over: any = {}) => ({
  id: 'c1', name: 'SHA Open', homepageUrl: 'https://sha.org',
  registrationDeadline: new Date('2026-09-10T00:00:00Z'), shippingDeadline: new Date('2026-09-20T00:00:00Z'),
  bottlesRequired: 3, shippingAddress: '1 A St', dropoffAddress: null, addedById: 'm1', ...over,
})
const entry = (over: any = {}) => ({ id: 'e1', competitionId: 'c1', memberId: 'm1', beerName: 'Hazy', style: 'NEIPA', channel: 'club_ship', registered: true, ...over })

test('listMemberComps: only the viewer own entries, active only, with derived dates', async () => {
  const comps = [comp(), comp({ id: 'c2', shippingDeadline: new Date(NOW.getTime() - day) })] // c2 is past
  const entries = [entry({ id: 'e1', memberId: 'm1' }), entry({ id: 'e2', memberId: 'm2' })]
  const res = await listMemberComps('m1', { db: db(comps, entries), now: NOW })
  expect(res.map((c) => c.id)).toEqual(['c1']) // c2 past -> excluded
  expect(res[0].myEntries.map((e) => e.id)).toEqual(['e1']) // only m1's entry
  expect(res[0].commitByDate.toISOString()).toBe('2026-09-13T00:00:00.000Z')
  expect(res[0].isPast).toBe(false)
})

test('listOfficerComps: all entries + podTotal + per-member breakdown; unknown member kept', async () => {
  const comps = [comp()]
  const entries = [
    entry({ id: 'e1', memberId: 'm1', channel: 'club_ship', registered: true }),
    entry({ id: 'e2', memberId: 'm1', channel: 'dropoff', registered: false }),
    entry({ id: 'e3', memberId: 'ghost', channel: 'club_ship', registered: true }),
  ]
  const members = [{ id: 'm1', name: 'Amy' }]
  const res = await listOfficerComps({ db: db(comps, entries, members), now: NOW })
  expect(res[0].entries.length).toBe(3)
  expect(res[0].podTotal).toBe(6) // 2 club_ship * 3
  const amy = res[0].perMember.find((p) => p.memberId === 'm1')!
  expect(amy.entryCount).toBe(2); expect(amy.clubShipCount).toBe(1); expect(amy.registeredCount).toBe(1)
  const ghost = res[0].perMember.find((p) => p.memberId === 'ghost')!
  expect(ghost.memberName).toBeNull() // unknown member kept, name null
})

test('computeBannerItems: member sees own approaching items; officer additionally sees club-wide', async () => {
  const comps = [comp()]
  const entries = [entry({ id: 'e1', memberId: 'm1', channel: 'club_ship' })]
  const officer = await listOfficerComps({ db: db(comps, entries, [{ id: 'm1', name: 'Amy' }]), now: NOW })
  // ship deadline 2026-09-20; commit/deliver 09-13; NOW 09-01 -> deliver ~12 days away (within a reasonable window)
  const memberItems = computeBannerItems(officer, 'm1', false, NOW)
  expect(memberItems.some((b) => b.competitionId === 'c1')).toBe(true)
  const nonEntrant = computeBannerItems(officer, 'nobody', false, NOW)
  expect(nonEntrant.length).toBe(0) // not their entry -> no member banner
  const officerItems = computeBannerItems(officer, 'nobody', true, NOW)
  expect(officerItems.some((b) => b.detail.includes('bottle') || b.kind === 'ship')).toBe(true) // club-wide logistics flag
})

test('addCompetition: rejects missing required fields; accepts valid', async () => {
  const store = db([], [])
  const bad = await addCompetition({ name: '', homepageUrl: 'x', registrationDeadline: NOW, shippingDeadline: NOW, bottlesRequired: 0, shippingAddress: '' } as any, 'm1', { db: store })
  expect(bad.ok).toBe(false)
  const good = await addCompetition({ name: 'C', homepageUrl: 'https://x', registrationDeadline: NOW, shippingDeadline: NOW, bottlesRequired: 2, shippingAddress: '1 A St' }, 'm1', { db: store })
  expect(good.ok).toBe(true)
})

test('editCompetition: adder or board only', async () => {
  const comps = [comp({ addedById: 'm1' })]
  const store = () => db(comps.map((c) => ({ ...c })), [])
  expect((await editCompetition('c1', { name: 'X' }, { memberId: 'm1', isBoard: false }, { db: store() })).ok).toBe(true)  // adder
  expect((await editCompetition('c1', { name: 'X' }, { memberId: 'other', isBoard: true }, { db: store() })).ok).toBe(true) // board
  expect((await editCompetition('c1', { name: 'X' }, { memberId: 'other', isBoard: false }, { db: store() })).ok).toBe(false) // neither
})

test('deleteCompetition: not_found when missing', async () => {
  expect((await deleteCompetition('nope', { db: db([], []) })).ok).toBe(false)
})

test('entry mutations: owner-only', async () => {
  const entries = [entry({ id: 'e1', memberId: 'm1' })]
  const store = () => db([comp()], entries.map((e) => ({ ...e })))
  expect((await addEntry('c1', { beerName: 'B', style: 'S', channel: 'dropoff', registered: false }, 'm2', { db: store() })).ok).toBe(true) // anyone adds their OWN
  expect((await editEntry('e1', { beerName: 'X' }, 'm1', { db: store() })).ok).toBe(true)  // owner
  expect((await editEntry('e1', { beerName: 'X' }, 'm2', { db: store() })).ok).toBe(false) // not owner
  expect((await deleteEntry('e1', 'm2', { db: store() })).ok).toBe(false) // not owner
})
