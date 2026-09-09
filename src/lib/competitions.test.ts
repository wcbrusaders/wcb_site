import { test, expect, describe } from 'vitest'
import { vi } from 'vitest'
import {
  mapsUrl, isPast, commitByDate, deliverByDate, podTotal, trackingUrl,
  listMemberComps, listOfficerComps, computeBannerItems,
  addCompetition, editCompetition, deleteCompetition, addEntry, editEntry, deleteEntry,
  rollupShipments, addShipment, editShipment, deleteShipment,
} from './competitions'

test('trackingUrl builds carrier URLs and returns null for unknown/empty', () => {
  expect(trackingUrl('UPS', '1Z999')).toBe('https://www.ups.com/track?tracknum=1Z999')
  expect(trackingUrl('FedEx', '7712')).toBe('https://www.fedex.com/fedextrack/?trknbr=7712')
  expect(trackingUrl('SomeRegionalCarrier', '123')).toBeNull()
  expect(trackingUrl(null, '123')).toBeNull()
  expect(trackingUrl('UPS', null)).toBeNull()
  // USPS is not a valid homebrew carrier (illegal to mail alcohol) — no link, and must not fall through to UPS
  expect(trackingUrl('USPS', '9400111899223')).toBeNull()
})

const day = 86400000
const NOW = new Date('2026-09-01T00:00:00Z')

describe('rollupShipments', () => {
  const pkg = (over: any = {}) => ({
    id: 's1', carrier: 'UPS', tracking: '1Z1', shippedAt: new Date('2026-09-05T00:00:00Z'),
    deliveryStatus: null, deliveredAt: null, ...over,
  })

  test('empty array -> all null', () => {
    expect(rollupShipments([])).toEqual({ shippedAt: null, deliveryStatus: null, deliveredAt: null })
  })

  test('all delivered -> delivered, deliveredAt is the LATEST, shippedAt is the earliest', () => {
    const shipments = [
      pkg({ id: 's1', shippedAt: new Date('2026-09-05T00:00:00Z'), deliveryStatus: 'delivered', deliveredAt: new Date('2026-09-10T00:00:00Z') }),
      pkg({ id: 's2', shippedAt: new Date('2026-09-03T00:00:00Z'), deliveryStatus: 'delivered', deliveredAt: new Date('2026-09-12T00:00:00Z') }),
    ]
    expect(rollupShipments(shipments)).toEqual({
      shippedAt: new Date('2026-09-03T00:00:00Z'),
      deliveryStatus: 'delivered',
      deliveredAt: new Date('2026-09-12T00:00:00Z'),
    })
  })

  test('one delivered + one in_transit -> in_transit, deliveredAt null', () => {
    const shipments = [
      pkg({ id: 's1', deliveryStatus: 'delivered', deliveredAt: new Date('2026-09-10T00:00:00Z') }),
      pkg({ id: 's2', deliveryStatus: 'in_transit' }),
    ]
    expect(rollupShipments(shipments)).toEqual({
      shippedAt: shipments[1].shippedAt < shipments[0].shippedAt ? shipments[1].shippedAt : shipments[0].shippedAt,
      deliveryStatus: 'in_transit',
      deliveredAt: null,
    })
  })

  test('any exception wins even with a delivered package', () => {
    const shipments = [
      pkg({ id: 's1', deliveryStatus: 'exception' }),
      pkg({ id: 's2', deliveryStatus: 'delivered', deliveredAt: new Date('2026-09-10T00:00:00Z') }),
    ]
    expect(rollupShipments(shipments).deliveryStatus).toBe('exception')
  })

  test('one in_transit + one null-status -> in_transit', () => {
    const shipments = [
      pkg({ id: 's1', deliveryStatus: 'in_transit' }),
      pkg({ id: 's2', deliveryStatus: null }),
    ]
    expect(rollupShipments(shipments).deliveryStatus).toBe('in_transit')
  })

  test('all null-status -> null deliveryStatus; shippedAt is earliest package shippedAt', () => {
    const shipments = [
      pkg({ id: 's1', shippedAt: new Date('2026-09-05T00:00:00Z'), deliveryStatus: null }),
      pkg({ id: 's2', shippedAt: new Date('2026-09-02T00:00:00Z'), deliveryStatus: null }),
    ]
    const r = rollupShipments(shipments)
    expect(r.deliveryStatus).toBeNull()
    expect(r.deliveredAt).toBeNull()
    expect(r.shippedAt).toEqual(new Date('2026-09-02T00:00:00Z'))
  })
})

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
function db(comps: any[], entries: any[], members: any[] = [], shipments: any[] = []) {
  const findComp = (id: string) => comps.find((c) => c.id === id)
  const findEntry = (id: string) => entries.find((e) => e.id === id)
  const findShipment = (id: string) => shipments.find((s) => s.id === id)
  let nextShipmentId = 1
  return {
    competition: {
      findMany: async ({ where }: any = {}) => {
        // where.shippingDeadline is { lt: now } (past) or { gte: now } (active)
        let rows = comps
        if (where?.shippingDeadline?.lt) rows = rows.filter((c) => c.shippingDeadline < where.shippingDeadline.lt)
        if (where?.shippingDeadline?.gte) rows = rows.filter((c) => c.shippingDeadline >= where.shippingDeadline.gte)
        return rows.map((c) => ({
          ...c,
          entries: entries.filter((e) => e.competitionId === c.id),
          shipments: shipments.filter((s) => s.competitionId === c.id),
        }))
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
    shipment: {
      findUnique: async ({ where }: any) => findShipment(where.id) ?? null,
      create: async ({ data }: any) => { const row = { id: `newship${nextShipmentId++}`, deliveryStatus: null, deliveredAt: null, lastTrackedAt: null, shippedAt: data.shippedAt ?? new Date(), ...data }; shipments.push(row); return row },
      update: async ({ where, data }: any) => { Object.assign(findShipment(where.id), data); return findShipment(where.id) },
      delete: async ({ where }: any) => { const i = shipments.findIndex((s) => s.id === where.id); shipments.splice(i, 1); return {} },
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

test('listMemberComps: allEntries exposes every entrant (name+beer+style) for the ceremony view', async () => {
  const comps = [comp()]
  const entries = [
    entry({ id: 'e1', memberId: 'm1', beerName: 'Hazy', style: 'NEIPA' }),
    entry({ id: 'e2', memberId: 'm2', beerName: 'Stout', style: 'Imperial Stout' }),
  ]
  const members = [{ id: 'm1', name: 'Amy' }, { id: 'm2', name: 'Ben' }]
  const res = await listMemberComps('m1', { db: db(comps, entries, members), now: NOW })
  // myEntries still only the viewer's own
  expect(res[0].myEntries.map((e) => e.id)).toEqual(['e1'])
  // allEntries: everyone, with resolved names, for the shared list
  expect(res[0].allEntries.map((e) => `${e.memberName}:${e.beerName}:${e.style}`)).toEqual([
    'Amy:Hazy:NEIPA',
    'Ben:Stout:Imperial Stout',
  ])
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

test('bottled: addEntry defaults false; editEntry toggles it (owner-gated); surfaced on myEntries', async () => {
  const store = () => db([comp()], [])
  // new entry defaults to not-bottled
  const s1 = store()
  const added = await addEntry('c1', { beerName: 'B', style: 'S', channel: 'dropoff', registered: false }, 'm1', { db: s1 })
  expect(added.ok).toBe(true)
  let res = await listMemberComps('m1', { db: s1, now: NOW })
  expect(res[0].myEntries[0].bottled).toBe(false)
  // owner can mark it bottled; non-owner cannot
  const s2 = db([comp()], [entry({ id: 'e1', memberId: 'm1', bottled: false })])
  expect((await editEntry('e1', { bottled: true }, 'm2', { db: s2 })).ok).toBe(false) // not owner
  expect((await editEntry('e1', { bottled: true }, 'm1', { db: s2 })).ok).toBe(true)  // owner
  res = await listMemberComps('m1', { db: s2, now: NOW })
  expect(res[0].myEntries[0].bottled).toBe(true)
})

test('computeBannerItems: a SHIPPED club shipment suppresses both deliver and ship banners', async () => {
  // Same setup as the "member/officer see items" test, but a package has shipped (derived from shipments[]).
  const shippedComps = [comp()]
  const entries = [entry({ id: 'e1', memberId: 'm1', channel: 'club_ship' })]
  const shipments = [{ id: 's1', competitionId: 'c1', carrier: 'UPS', tracking: '1Z999', shippedAt: new Date('2026-09-05T00:00:00Z'), deliveryStatus: null, deliveredAt: null }]
  const officer = await listOfficerComps({ db: db(shippedComps, entries, [{ id: 'm1', name: 'Amy' }], shipments), now: NOW })
  expect(officer[0].shippedAt).not.toBeNull()
  // member: no 'deliver' item once shipped
  const memberItems = computeBannerItems(officer, 'm1', false, NOW)
  expect(memberItems.some((b) => b.kind === 'deliver')).toBe(false)
  // officer: no 'ship' item once shipped
  const officerItems = computeBannerItems(officer, 'nobody', true, NOW)
  expect(officerItems.some((b) => b.kind === 'ship')).toBe(false)
})

test('computeBannerItems: an UN-shipped club shipment still shows deliver + ship (regression guard)', async () => {
  const comps = [comp()] // shippedAt undefined/null
  const entries = [entry({ id: 'e1', memberId: 'm1', channel: 'club_ship' })]
  const officer = await listOfficerComps({ db: db(comps, entries, [{ id: 'm1', name: 'Amy' }]), now: NOW })
  expect(computeBannerItems(officer, 'm1', false, NOW).some((b) => b.kind === 'deliver')).toBe(true)
  expect(computeBannerItems(officer, 'nobody', true, NOW).some((b) => b.kind === 'ship')).toBe(true)
})

test('toCompView carries deliveryStatus + deliveredAt (derived from shipments[])', async () => {
  const delivered = new Date('2026-09-18T00:00:00Z')
  const comps = [comp()]
  const shipments = [{ id: 's1', competitionId: 'c1', carrier: 'UPS', tracking: '1Z999', shippedAt: new Date('2026-09-05T00:00:00Z'), deliveryStatus: 'delivered', deliveredAt: delivered }]
  const res = await listMemberComps('m1', { db: db(comps, [entry()], [], shipments), now: NOW })
  expect(res[0].deliveryStatus).toBe('delivered')
  expect(res[0].deliveredAt).toEqual(delivered)
})

test('toCompView exposes per-package shipments[] with trackingUrl, sorted by shippedAt ascending', async () => {
  const comps = [comp()]
  const shipments = [
    { id: 's-later', competitionId: 'c1', carrier: 'FedEx', tracking: '7712', shippedAt: new Date('2026-09-10T00:00:00Z'), deliveryStatus: null, deliveredAt: null },
    { id: 's-earlier', competitionId: 'c1', carrier: 'UPS', tracking: '1Z999', shippedAt: new Date('2026-09-03T00:00:00Z'), deliveryStatus: 'in_transit', deliveredAt: null },
  ]
  const res = await listMemberComps('m1', { db: db(comps, [entry()], [], shipments), now: NOW })
  expect(res[0].shipments.map((s) => s.id)).toEqual(['s-earlier', 's-later'])
  expect(res[0].shipments[0].trackingUrl).toBe('https://www.ups.com/track?tracknum=1Z999')
  expect(res[0].shipments[1].trackingUrl).toBe('https://www.fedex.com/fedextrack/?trknbr=7712')
})

describe('addShipment', () => {
  test('creates a Shipment row and registers a NEW UPS tracking number with 17track (fail-soft seam)', async () => {
    const comps = [comp()]
    const shipments: any[] = []
    const register = vi.fn(async () => {})
    const store = db(comps, [], [], shipments)
    const r = await addShipment('c1', 'UPS', '1Z999', { db: store, now: NOW, registerTracking: register })
    expect(r.ok).toBe(true)
    expect(shipments.length).toBe(1)
    expect(shipments[0].carrier).toBe('UPS')
    expect(shipments[0].tracking).toBe('1Z999')
    expect(register).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledWith('1Z999', expect.any(Number))
  })

  test('does NOT register a non-UPS carrier', async () => {
    const comps = [comp()]
    const register = vi.fn(async () => {})
    await addShipment('c1', 'FedEx', '77712', { db: db(comps, [], [], []), now: NOW, registerTracking: register })
    expect(register).not.toHaveBeenCalled()
  })

  test('trims carrier + tracking; empty tracking is a validation no-op (does not create)', async () => {
    const comps = [comp()]
    const shipments: any[] = []
    const r = await addShipment('c1', ' UPS ', '   ', { db: db(comps, [], [], shipments), now: NOW })
    expect(r.ok).toBe(false)
    expect((r as any).reason).toBe('validation')
    expect(shipments.length).toBe(0)
  })

  test('not_found when competition does not exist', async () => {
    const r = await addShipment('nope', 'UPS', '1Z999', { db: db([], [], [], []) })
    expect(r.ok).toBe(false)
    expect((r as any).reason).toBe('not_found')
  })
})

describe('editShipment', () => {
  test('updates carrier + tracking (trimmed) and re-registers ONLY when tracking CHANGED and is UPS', async () => {
    const shipments = [{ id: 's1', competitionId: 'c1', carrier: 'UPS', tracking: '1Z999', shippedAt: NOW, deliveryStatus: null, deliveredAt: null }]
    const register = vi.fn(async () => {})
    const r = await editShipment('s1', ' UPS ', ' 1Z000 ', { db: db([comp()], [], [], shipments), now: NOW, registerTracking: register })
    expect(r.ok).toBe(true)
    expect(shipments[0].tracking).toBe('1Z000')
    expect(register).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledWith('1Z000', expect.any(Number))
  })

  test('does NOT re-register when the tracking number is unchanged', async () => {
    const shipments = [{ id: 's1', competitionId: 'c1', carrier: 'UPS', tracking: '1Z999', shippedAt: NOW, deliveryStatus: null, deliveredAt: null }]
    const register = vi.fn(async () => {})
    await editShipment('s1', 'UPS', '1Z999', { db: db([comp()], [], [], shipments), now: NOW, registerTracking: register })
    expect(register).not.toHaveBeenCalled()
  })

  test('does NOT re-register a changed but non-UPS carrier', async () => {
    const shipments = [{ id: 's1', competitionId: 'c1', carrier: 'FedEx', tracking: '77712', shippedAt: NOW, deliveryStatus: null, deliveredAt: null }]
    const register = vi.fn(async () => {})
    await editShipment('s1', 'FedEx', '77713', { db: db([comp()], [], [], shipments), now: NOW, registerTracking: register })
    expect(register).not.toHaveBeenCalled()
  })

  test('not_found when shipment does not exist', async () => {
    const r = await editShipment('nope', 'UPS', '1Z999', { db: db([comp()], [], [], []) })
    expect(r.ok).toBe(false)
    expect((r as any).reason).toBe('not_found')
  })

  test('rejects clearing tracking to empty (validation) and leaves the row unchanged', async () => {
    // Consistency with addShipment: an empty tracking would create an
    // unpollable, linkless "Shipped" package that still feeds the rollup.
    const shipments = [{ id: 's1', competitionId: 'c1', carrier: 'UPS', tracking: '1Z999', shippedAt: NOW, deliveryStatus: null, deliveredAt: null }]
    const register = vi.fn(async () => {})
    const r = await editShipment('s1', 'UPS', '   ', { db: db([comp()], [], [], shipments), now: NOW, registerTracking: register })
    expect(r.ok).toBe(false)
    expect((r as any).reason).toBe('validation')
    expect(shipments[0].tracking).toBe('1Z999') // untouched
    expect(register).not.toHaveBeenCalled()
  })
})

describe('deleteShipment', () => {
  test('removes the shipment row', async () => {
    const shipments = [{ id: 's1', competitionId: 'c1', carrier: 'UPS', tracking: '1Z999', shippedAt: NOW, deliveryStatus: null, deliveredAt: null }]
    const r = await deleteShipment('s1', { db: db([comp()], [], [], shipments) })
    expect(r.ok).toBe(true)
    expect(shipments.length).toBe(0)
  })

  test('not_found when shipment does not exist', async () => {
    const r = await deleteShipment('nope', { db: db([comp()], [], [], []) })
    expect(r.ok).toBe(false)
    expect((r as any).reason).toBe('not_found')
  })
})
