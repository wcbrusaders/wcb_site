import { describe, it, expect, vi } from 'vitest'
import { pollShipments } from './poll-shipments'
import { UPS_CARRIER } from './seventeentrack'

const NOW = new Date('2026-08-18T12:00:00Z')

// Minimal fake shipment rows as pollShipments' findMany would return them.
function shipment(over: Partial<any> = {}) {
  return {
    id: 's1',
    carrier: 'UPS',
    tracking: '1Z9',
    deliveryStatus: null,
    ...over,
  }
}

function fakeDb(rows: any[]) {
  const updates: { where: any; data: any }[] = []
  return {
    updates,
    shipment: {
      findMany: vi.fn(async () => rows),
      update: vi.fn(async (args: any) => {
        updates.push(args)
        return {}
      }),
    },
  }
}

describe('pollShipments', () => {
  it('marks a delivered shipment: sets deliveryStatus/deliveredAt/lastTrackedAt and counts it', async () => {
    const db = fakeDb([shipment()])
    const getTracking = vi.fn(async () => ({ status: 'delivered' as const, deliveredAt: new Date('2026-08-18T09:00:00Z') }))
    const r = await pollShipments({ db: db as any, now: NOW, getTracking })
    expect(getTracking).toHaveBeenCalledWith('1Z9', UPS_CARRIER, undefined)
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].where).toEqual({ id: 's1' })
    expect(db.updates[0].data).toEqual({
      deliveryStatus: 'delivered',
      deliveredAt: new Date('2026-08-18T09:00:00Z'),
      lastTrackedAt: NOW,
    })
    expect(r).toEqual({ checked: 1, updated: 1, delivered: 1 })
  })

  it('updates an in-transit shipment without deliveredAt', async () => {
    const db = fakeDb([shipment()])
    const getTracking = vi.fn(async () => ({ status: 'in_transit' as const, deliveredAt: null }))
    const r = await pollShipments({ db: db as any, now: NOW, getTracking })
    expect(db.updates[0].data).toEqual({ deliveryStatus: 'in_transit', lastTrackedAt: NOW })
    expect(r).toEqual({ checked: 1, updated: 1, delivered: 0 })
  })

  it('on null (couldn’t determine) advances only lastTrackedAt and does not count as updated', async () => {
    const db = fakeDb([shipment()])
    const getTracking = vi.fn(async () => null)
    const r = await pollShipments({ db: db as any, now: NOW, getTracking })
    expect(db.updates[0].data).toEqual({ lastTrackedAt: NOW })
    expect(r).toEqual({ checked: 1, updated: 0, delivered: 0 })
  })

  it('returns zeros and makes no updates when there are no shipments', async () => {
    const db = fakeDb([])
    const getTracking = vi.fn(async () => null)
    const r = await pollShipments({ db: db as any, now: NOW, getTracking })
    expect(db.updates).toHaveLength(0)
    expect(getTracking).not.toHaveBeenCalled()
    expect(r).toEqual({ checked: 0, updated: 0, delivered: 0 })
  })

  it('queries shipments that are not delivered — INCLUDING never-polled (null) status', async () => {
    const db = fakeDb([shipment()])
    const getTracking = vi.fn(async () => null)
    await pollShipments({ db: db as any, now: NOW, getTracking })
    const where = (db.shipment.findMany as any).mock.calls[0][0].where
    // Must include never-polled (deliveryStatus = NULL) rows — those are exactly
    // the ones to poll first. `{ not: 'delivered' }` alone excludes NULL in SQL,
    // so use an explicit NULL-inclusive OR.
    expect(where.OR).toEqual([{ deliveryStatus: null }, { deliveryStatus: { not: 'delivered' } }])
  })

  it('skips non-UPS carriers (in-memory guard) so only UPS shipments are polled', async () => {
    const db = fakeDb([shipment({ id: 'ups', carrier: 'UPS' }), shipment({ id: 'fedex', carrier: 'FedEx' })])
    const getTracking = vi.fn(async () => ({ status: 'in_transit' as const, deliveredAt: null }))
    const r = await pollShipments({ db: db as any, now: NOW, getTracking })
    expect(getTracking).toHaveBeenCalledTimes(1)
    expect(db.updates.map((u) => u.where.id)).toEqual(['ups'])
    expect(r.checked).toBe(1)
  })
})
