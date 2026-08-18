// Poll orchestrator: reads delivery status for every not-yet-delivered UPS club
// shipment via 17track and updates the Competition rows. Run daily by the
// track-shipments cron. Dependency-injected (db/now/getTracking) so it's fully
// unit-testable with no network.
//
// Fail-closed: getTracking returns null on any error → we advance only
// lastTrackedAt and leave deliveryStatus untouched (never a false "delivered").

import { prisma } from '@/lib/db'
import { getTracking as realGetTracking, UPS_CARRIER } from './seventeentrack'

// The trackingUrl UPS guard, reused: matches "UPS" but not "USPS".
function isUps(carrier: string | null | undefined): boolean {
  if (!carrier) return false
  const c = carrier.trim().toLowerCase()
  return c.includes('ups') && !c.includes('usps')
}

export interface PollDeps {
  db?: typeof prisma
  now?: Date
  getTracking?: typeof realGetTracking
}

export async function pollShipments(
  deps: PollDeps = {},
): Promise<{ checked: number; updated: number; delivered: number }> {
  const db = deps.db ?? prisma
  const now = deps.now ?? new Date()
  const getTracking = deps.getTracking ?? realGetTracking

  // Only shipments with a tracking number that aren't already delivered. Note:
  // `{ not: 'delivered' }` alone would EXCLUDE never-polled rows (deliveryStatus
  // NULL) in SQL — those are exactly the ones we must poll first — so the OR
  // explicitly includes NULL. The carrier (UPS-vs-not) guard is applied
  // in-memory below since it's a string contains-check, not an exact match.
  const rows = (await db.competition.findMany({
    where: {
      shipmentTracking: { not: null },
      OR: [{ deliveryStatus: null }, { deliveryStatus: { not: 'delivered' } }],
    },
    select: { id: true, shipmentCarrier: true, shipmentTracking: true, deliveryStatus: true },
  })) as any[]

  let checked = 0
  let updated = 0
  let delivered = 0

  for (const c of rows) {
    if (!isUps(c.shipmentCarrier) || !c.shipmentTracking) continue
    checked++
    const result = await getTracking(c.shipmentTracking, UPS_CARRIER, undefined)
    if (!result) {
      // Couldn't determine — record the attempt, leave status unchanged.
      await db.competition.update({ where: { id: c.id }, data: { lastTrackedAt: now } })
      continue
    }
    const data: Record<string, unknown> = { deliveryStatus: result.status, lastTrackedAt: now }
    if (result.status === 'delivered') {
      data.deliveredAt = result.deliveredAt
      delivered++
    }
    await db.competition.update({ where: { id: c.id }, data })
    updated++
  }

  return { checked, updated, delivered }
}
