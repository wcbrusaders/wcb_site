import { prisma } from '@/lib/db'

async function main() {
  const comps = (await prisma.competition.findMany({
    include: { shipments: true },
  })) as any[]
  let created = 0
  for (const c of comps) {
    if (c.shipments.length > 0) continue
    if (!c.shipmentTracking) continue
    await prisma.shipment.create({
      data: {
        competitionId: c.id,
        carrier: c.shipmentCarrier ?? 'UPS',
        tracking: c.shipmentTracking,
        shippedAt: c.shippedAt ?? c.createdAt,
        deliveryStatus: c.deliveryStatus ?? null,
        deliveredAt: c.deliveredAt ?? null,
        lastTrackedAt: c.lastTrackedAt ?? null,
      },
    })
    created++
  }
  console.log(`Backfilled ${created} shipment(s) from ${comps.length} competition(s).`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
