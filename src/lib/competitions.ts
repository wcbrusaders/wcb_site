import { prisma } from '@/lib/db'
import { registerTracking as realRegisterTracking, UPS_CARRIER } from '@/lib/shipping/seventeentrack'

export type EntryChannel = 'club_ship' | 'self_ship' | 'dropoff'
export type DeliveryStatus = 'in_transit' | 'delivered' | 'exception'
const SEVEN_DAYS = 7 * 86400000
const BANNER_WINDOW_DAYS = 21 // surface items within ~3 weeks

export type CompEntryView = { id: string; memberId: string; memberName: string | null; beerName: string; style: string; channel: EntryChannel; registered: boolean; bottled: boolean }
export type ShipmentView = {
  id: string; carrier: string; tracking: string; shippedAt: Date
  deliveryStatus: DeliveryStatus | null; deliveredAt: Date | null; trackingUrl: string | null
}
export type ContributionView = { payerName: string | null; amount: number; createdAt: Date }
export type CompetitionView = {
  id: string; name: string; homepageUrl: string
  registrationDeadline: Date; shippingDeadline: Date; bottlesRequired: number
  shippingAddress: string; dropoffAddress: string | null; addedById: string
  commitByDate: Date; deliverByDate: Date; isPast: boolean
  // shippedAt/deliveryStatus/deliveredAt are DERIVED (rolled up) from shipments — see rollupShipments.
  shippedAt: Date | null; deliveryStatus: DeliveryStatus | null; deliveredAt: Date | null
  shipments: ShipmentView[]
  // contributionTotal/contributions are DERIVED (rolled up) from contributions — newest-first.
  contributionTotal: number
  contributions: ContributionView[]
}
// myEntries = the viewer's own (for edit controls); allEntries = every entrant
// with resolved names, shown to all members (the "who entered what" ceremony list).
export type MemberCompView = CompetitionView & { myEntries: CompEntryView[]; allEntries: CompEntryView[] }
export type OfficerCompView = CompetitionView & {
  entries: CompEntryView[]; podTotal: number
  perMember: { memberId: string; memberName: string | null; entryCount: number; clubShipCount: number; registeredCount: number }[]
}
export type BannerItem = { competitionId: string; competitionName: string; kind: 'register' | 'commit' | 'deliver' | 'ship'; date: Date; daysAway: number; detail: string }
export type NewCompetitionInput = { name: string; homepageUrl: string; registrationDeadline: Date; shippingDeadline: Date; bottlesRequired: number; shippingAddress: string; dropoffAddress?: string | null }
export type NewEntryInput = { beerName: string; style: string; channel: EntryChannel; registered: boolean; bottled?: boolean }
export type CompResult = { ok: true; id: string } | { ok: false; reason: 'validation' | 'not_found' | 'forbidden' }
export type MutResult = { ok: true } | { ok: false; reason: 'not_found' | 'forbidden' | 'validation' }

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}
export function isPast(shippingDeadline: Date, now: Date): boolean { return shippingDeadline.getTime() < now.getTime() }
export function commitByDate(shippingDeadline: Date): Date { return new Date(shippingDeadline.getTime() - SEVEN_DAYS) }
export function deliverByDate(shippingDeadline: Date): Date { return new Date(shippingDeadline.getTime() - SEVEN_DAYS) }
export function podTotal(entries: { channel: EntryChannel }[], bottlesRequired: number): number {
  return entries.filter((e) => e.channel === 'club_ship').length * bottlesRequired
}

// Roll up the comp-level shipment status from its per-package Shipment rows.
// Precedence: exception (any) > not-all-delivered-but-moving (in_transit) > all-delivered > null.
// shippedAt = earliest package shippedAt (null if no packages). deliveredAt = latest
// package deliveredAt, but ONLY once every package is delivered (never a false positive).
export function rollupShipments(shipments: { shippedAt: Date; deliveryStatus: DeliveryStatus | null; deliveredAt: Date | null }[]): {
  shippedAt: Date | null; deliveryStatus: DeliveryStatus | null; deliveredAt: Date | null
} {
  if (shipments.length === 0) return { shippedAt: null, deliveryStatus: null, deliveredAt: null }
  const shippedAt = shipments.reduce((min, s) => (s.shippedAt < min ? s.shippedAt : min), shipments[0].shippedAt)
  let deliveryStatus: DeliveryStatus | null
  let deliveredAt: Date | null = null
  if (shipments.some((s) => s.deliveryStatus === 'exception')) {
    deliveryStatus = 'exception'
  } else if (shipments.every((s) => s.deliveryStatus === 'delivered')) {
    deliveryStatus = 'delivered'
    deliveredAt = shipments.reduce((max: Date | null, s) => {
      if (!s.deliveredAt) return max
      return !max || s.deliveredAt > max ? s.deliveredAt : max
    }, null)
  } else if (shipments.some((s) => s.deliveryStatus === 'in_transit' || s.deliveryStatus === 'delivered')) {
    deliveryStatus = 'in_transit'
  } else {
    deliveryStatus = null
  }
  return { shippedAt, deliveryStatus, deliveredAt }
}

function toCompView(c: any, now: Date): CompetitionView {
  const shipments: ShipmentView[] = ((c.shipments ?? []) as any[])
    .map((s) => ({
      id: s.id, carrier: s.carrier, tracking: s.tracking, shippedAt: s.shippedAt,
      deliveryStatus: (s.deliveryStatus ?? null) as DeliveryStatus | null, deliveredAt: s.deliveredAt ?? null,
      trackingUrl: trackingUrl(s.carrier, s.tracking),
    }))
    .sort((a, b) => a.shippedAt.getTime() - b.shippedAt.getTime())
  const rollup = rollupShipments(shipments)
  const contribs = c.contributions ?? []
  const contributionTotal = contribs.reduce((s: number, x: any) => s + x.amount, 0)
  const contributions: ContributionView[] = [...contribs]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((x) => ({ payerName: x.payerName ?? null, amount: x.amount, createdAt: x.createdAt }))
  return {
    id: c.id, name: c.name, homepageUrl: c.homepageUrl,
    registrationDeadline: c.registrationDeadline, shippingDeadline: c.shippingDeadline, bottlesRequired: c.bottlesRequired,
    shippingAddress: c.shippingAddress, dropoffAddress: c.dropoffAddress ?? null, addedById: c.addedById,
    commitByDate: commitByDate(c.shippingDeadline), deliverByDate: deliverByDate(c.shippingDeadline), isPast: isPast(c.shippingDeadline, now),
    shippedAt: rollup.shippedAt, deliveryStatus: rollup.deliveryStatus, deliveredAt: rollup.deliveredAt,
    shipments,
    contributionTotal, contributions,
  }
}

// Build a carrier tracking URL from a carrier name + tracking number. Returns
// null for unknown carriers (caller shows the plain number instead).
export function trackingUrl(carrier: string | null, tracking: string | null): string | null {
  if (!carrier || !tracking) return null
  const t = encodeURIComponent(tracking.trim())
  const c = carrier.trim().toLowerCase()
  // USPS is intentionally omitted — mailing alcohol via the USPS is illegal,
  // so homebrew comps ship UPS/FedEx. Guard UPS against matching "usps".
  if (c.includes('ups') && !c.includes('usps')) return `https://www.ups.com/track?tracknum=${t}`
  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${t}`
  if (c.includes('dhl')) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${t}`
  return null
}

async function memberNames(db: typeof prisma, ids: string[]): Promise<Map<string, string | null>> {
  const uniq = [...new Set(ids)]
  const rows = uniq.length ? await db.member.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } }) : []
  return new Map((rows as any[]).map((m) => [m.id, m.name ?? null]))
}

export async function listMemberComps(memberId: string, deps: { db?: typeof prisma; now?: Date; isBoard?: boolean } = {}): Promise<MemberCompView[]> {
  const db = deps.db ?? prisma
  const now = deps.now ?? new Date()
  const isBoard = deps.isBoard ?? false
  const comps = await db.competition.findMany({ where: { shippingDeadline: { gte: now } }, include: { entries: true, shipments: true, contributions: true }, orderBy: { shippingDeadline: 'asc' } })
  // Resolve entrant names once across all comps for the shared "who entered" list.
  const allIds = (comps as any[]).flatMap((c) => (c.entries ?? []).map((e: any) => e.memberId))
  const names = await memberNames(db, allIds)
  return (comps as any[]).map((c) => {
   const base = toCompView(c, now)
   return {
    ...base,
    // The per-comp contribution TOTAL is public (base.contributionTotal), but
    // the contributor LIST (payer names) is board-only. Withhold it for
    // non-board viewers HERE in the data layer — hiding it only in the UI
    // would still ship the names into every member's client bundle (RSC props
    // are serialized to the browser).
    contributions: isBoard ? base.contributions : [],
    myEntries: (c.entries ?? []).filter((e: any) => e.memberId === memberId).map((e: any) => ({
      id: e.id, memberId: e.memberId, memberName: null, beerName: e.beerName, style: e.style, channel: e.channel as EntryChannel, registered: e.registered, bottled: e.bottled ?? false,
    })),
    // Every entrant, with resolved names — visible to all logged-in members.
    allEntries: (c.entries ?? []).map((e: any) => ({
      id: e.id, memberId: e.memberId, memberName: names.get(e.memberId) ?? null, beerName: e.beerName, style: e.style, channel: e.channel as EntryChannel, registered: e.registered, bottled: e.bottled ?? false,
    })),
   }
  })
}

export async function listPastComps(deps: { db?: typeof prisma; now?: Date } = {}): Promise<CompetitionView[]> {
  const db = deps.db ?? prisma
  const now = deps.now ?? new Date()
  // No `contributions` include: past comps are rendered as plain links (no
  // chip-in total or list), so fetching payer names here would be both an
  // unused over-fetch AND a latent PII footgun if a future edit dropped a past
  // comp into a client component. toCompView tolerates the absent relation
  // (contributionTotal 0, contributions []).
  const comps = await db.competition.findMany({ where: { shippingDeadline: { lt: now } }, include: { shipments: true }, orderBy: { shippingDeadline: 'desc' } })
  return (comps as any[]).map((c) => toCompView(c, now))
}

export async function listOfficerComps(deps: { db?: typeof prisma; now?: Date } = {}): Promise<OfficerCompView[]> {
  const db = deps.db ?? prisma
  const now = deps.now ?? new Date()
  const comps = await db.competition.findMany({ where: { shippingDeadline: { gte: now } }, include: { entries: true, shipments: true, contributions: true }, orderBy: { shippingDeadline: 'asc' } })
  const allIds = (comps as any[]).flatMap((c) => (c.entries ?? []).map((e: any) => e.memberId))
  const names = await memberNames(db, allIds)
  return (comps as any[]).map((c) => {
    const entries: CompEntryView[] = (c.entries ?? []).map((e: any) => ({
      id: e.id, memberId: e.memberId, memberName: names.get(e.memberId) ?? null,
      beerName: e.beerName, style: e.style, channel: e.channel as EntryChannel, registered: e.registered, bottled: e.bottled ?? false,
    }))
    const byMember = new Map<string, { memberId: string; memberName: string | null; entryCount: number; clubShipCount: number; registeredCount: number }>()
    for (const e of entries) {
      let pm = byMember.get(e.memberId)
      if (!pm) { pm = { memberId: e.memberId, memberName: e.memberName, entryCount: 0, clubShipCount: 0, registeredCount: 0 }; byMember.set(e.memberId, pm) }
      pm.entryCount++
      if (e.channel === 'club_ship') pm.clubShipCount++
      if (e.registered) pm.registeredCount++
    }
    return { ...toCompView(c, now), entries, podTotal: podTotal(entries, c.bottlesRequired), perMember: [...byMember.values()] }
  })
}

export function computeBannerItems(comps: OfficerCompView[], memberId: string, isBoard: boolean, now: Date): BannerItem[] {
  const items: BannerItem[] = []
  const daysAway = (d: Date) => Math.ceil((d.getTime() - now.getTime()) / 86400000)
  for (const c of comps) {
    const mine = c.entries.filter((e) => e.memberId === memberId)
    const myClubShip = mine.filter((e) => e.channel === 'club_ship')
    // Member's own approaching items
    if (mine.length) {
      const reg = daysAway(c.registrationDeadline)
      if (reg >= 0 && reg <= BANNER_WINDOW_DAYS && mine.some((e) => !e.registered))
        items.push({ competitionId: c.id, competitionName: c.name, kind: 'register', date: c.registrationDeadline, daysAway: reg, detail: `Register your ${mine.length} entr${mine.length === 1 ? 'y' : 'ies'} on the comp site` })
      // Once the club shipment is shipped, members have nothing left to do —
      // suppress the "deliver your bottles to the shipper" nag.
      if (myClubShip.length && !c.shippedAt) {
        const del = daysAway(c.deliverByDate)
        if (del >= 0 && del <= BANNER_WINDOW_DAYS)
          items.push({ competitionId: c.id, competitionName: c.name, kind: 'deliver', date: c.deliverByDate, daysAway: del, detail: `Deliver your ${myClubShip.length} club-ship entr${myClubShip.length === 1 ? 'y' : 'ies'} to the shipper` })
      }
    }
    // Officer club-wide logistics — also suppressed once shipped (it's done).
    if (isBoard && c.podTotal > 0 && !c.shippedAt) {
      const ship = daysAway(c.shippingDeadline)
      if (ship >= 0 && ship <= BANNER_WINDOW_DAYS)
        items.push({ competitionId: c.id, competitionName: c.name, kind: 'ship', date: c.shippingDeadline, daysAway: ship, detail: `${c.entries.filter((e) => e.channel === 'club_ship').length} club-ship entries · ~${c.podTotal} bottles` })
    }
  }
  return items.sort((a, b) => a.daysAway - b.daysAway)
}

function validComp(i: NewCompetitionInput): boolean {
  return !!(i.name?.trim() && i.homepageUrl?.trim() && i.registrationDeadline && i.shippingDeadline && i.bottlesRequired >= 1 && i.shippingAddress?.trim())
}

export async function addCompetition(input: NewCompetitionInput, addedById: string, deps: { db?: typeof prisma } = {}): Promise<CompResult> {
  const db = deps.db ?? prisma
  if (!validComp(input)) return { ok: false, reason: 'validation' }
  const c = await db.competition.create({ data: {
    name: input.name.trim(), homepageUrl: input.homepageUrl.trim(),
    registrationDeadline: input.registrationDeadline, shippingDeadline: input.shippingDeadline,
    bottlesRequired: input.bottlesRequired, shippingAddress: input.shippingAddress.trim(),
    dropoffAddress: input.dropoffAddress?.trim() || null, addedById,
  } })
  return { ok: true, id: c.id }
}

export async function editCompetition(id: string, patch: Partial<NewCompetitionInput>, actor: { memberId: string; isBoard: boolean }, deps: { db?: typeof prisma } = {}): Promise<MutResult> {
  const db = deps.db ?? prisma
  const c = await db.competition.findUnique({ where: { id } })
  if (!c) return { ok: false, reason: 'not_found' }
  if (!actor.isBoard && (c as any).addedById !== actor.memberId) return { ok: false, reason: 'forbidden' }
  await db.competition.update({ where: { id }, data: { ...patch } })
  return { ok: true }
}

// The trackingUrl UPS guard, reused: matches "UPS" but not "USPS".
function isUpsCarrier(carrier: string | null): boolean {
  if (!carrier) return false
  const c = carrier.toLowerCase()
  return c.includes('ups') && !c.includes('usps')
}

// Add one club-shipped package to a competition. Board-only. Empty tracking
// is a validation no-op (no row created). When the tracking number is a NEW
// UPS number, registers it with 17track so the daily delivery poll can follow
// it — fail-soft (a registration error never blocks saving) and quota-safe
// (never on a non-UPS carrier).
export async function addShipment(
  compId: string, carrier: string | null, tracking: string | null,
  deps: { db?: typeof prisma; now?: Date; registerTracking?: typeof realRegisterTracking } = {},
): Promise<MutResult> {
  const db = deps.db ?? prisma
  const comp = await db.competition.findUnique({ where: { id: compId } })
  if (!comp) return { ok: false, reason: 'not_found' }
  const cc = carrier?.trim() || null
  const tt = tracking?.trim() || null
  if (!tt) return { ok: false, reason: 'validation' }
  await db.shipment.create({
    data: { competitionId: compId, carrier: cc ?? '', tracking: tt, shippedAt: deps.now ?? new Date() },
  })
  if (isUpsCarrier(cc)) {
    const register = deps.registerTracking ?? realRegisterTracking
    // Fail-soft: never let a registration hiccup fail the save; the daily poll self-heals.
    await register(tt, UPS_CARRIER).catch(() => {})
  }
  return { ok: true }
}

// Edit one package's carrier/tracking. Board-only. Re-registers with 17track
// ONLY when the tracking number actually CHANGED and the (possibly new)
// carrier is UPS — quota-safe (never on clear/unchanged/non-UPS).
export async function editShipment(
  shipmentId: string, carrier: string | null, tracking: string | null,
  deps: { db?: typeof prisma; now?: Date; registerTracking?: typeof realRegisterTracking } = {},
): Promise<MutResult> {
  const db = deps.db ?? prisma
  const s = await db.shipment.findUnique({ where: { id: shipmentId } })
  if (!s) return { ok: false, reason: 'not_found' }
  const cc = carrier?.trim() || null
  const tt = tracking?.trim() || null
  // Same rule as addShipment: never allow an empty tracking. A blank tracking
  // would leave an unpollable, linkless "Shipped" package still feeding the
  // rollup. To remove a package, use deleteShipment.
  if (!tt) return { ok: false, reason: 'validation' }
  const changed = tt !== ((s as any).tracking ?? null)
  await db.shipment.update({ where: { id: shipmentId }, data: { carrier: cc ?? '', tracking: tt } })
  if (changed && tt && isUpsCarrier(cc)) {
    const register = deps.registerTracking ?? realRegisterTracking
    // Fail-soft: never let a registration hiccup fail the save; the daily poll self-heals.
    await register(tt, UPS_CARRIER).catch(() => {})
  }
  return { ok: true }
}

// Remove one package from a competition. Board-only.
export async function deleteShipment(shipmentId: string, deps: { db?: typeof prisma } = {}): Promise<MutResult> {
  const db = deps.db ?? prisma
  const s = await db.shipment.findUnique({ where: { id: shipmentId } })
  if (!s) return { ok: false, reason: 'not_found' }
  await db.shipment.delete({ where: { id: shipmentId } })
  return { ok: true }
}

export async function deleteCompetition(id: string, deps: { db?: typeof prisma } = {}): Promise<MutResult> {
  const db = deps.db ?? prisma
  const c = await db.competition.findUnique({ where: { id } })
  if (!c) return { ok: false, reason: 'not_found' }
  await db.competition.delete({ where: { id } }) // cascades entries
  return { ok: true }
}

export async function addEntry(competitionId: string, input: NewEntryInput, memberId: string, deps: { db?: typeof prisma } = {}): Promise<CompResult> {
  const db = deps.db ?? prisma
  if (!input.beerName?.trim() || !input.style?.trim()) return { ok: false, reason: 'validation' }
  const comp = await db.competition.findUnique({ where: { id: competitionId } })
  if (!comp) return { ok: false, reason: 'not_found' }
  const e = await db.compEntry.create({ data: { competitionId, memberId, beerName: input.beerName.trim(), style: input.style.trim(), channel: input.channel, registered: input.registered, bottled: input.bottled ?? false } })
  return { ok: true, id: e.id }
}

export async function editEntry(entryId: string, patch: Partial<NewEntryInput>, memberId: string, deps: { db?: typeof prisma } = {}): Promise<MutResult> {
  const db = deps.db ?? prisma
  const e = await db.compEntry.findUnique({ where: { id: entryId } })
  if (!e) return { ok: false, reason: 'not_found' }
  if ((e as any).memberId !== memberId) return { ok: false, reason: 'forbidden' }
  await db.compEntry.update({ where: { id: entryId }, data: { ...patch } })
  return { ok: true }
}

export async function deleteEntry(entryId: string, memberId: string, deps: { db?: typeof prisma } = {}): Promise<MutResult> {
  const db = deps.db ?? prisma
  const e = await db.compEntry.findUnique({ where: { id: entryId } })
  if (!e) return { ok: false, reason: 'not_found' }
  if ((e as any).memberId !== memberId) return { ok: false, reason: 'forbidden' }
  await db.compEntry.delete({ where: { id: entryId } })
  return { ok: true }
}
