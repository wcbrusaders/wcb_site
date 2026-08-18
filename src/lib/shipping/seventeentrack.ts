// 17track delivery-tracking client for competition club shipments.
//
// Why 17track: the official UPS Track API needs a business account (we don't
// have one); scraping ups.com is fragile (status arrives via an authenticated
// XHR / needs headless Chromium, which doesn't run on Vercel). 17track gives a
// one-time 200 free tracking REGISTRATIONS, no business account. The 200 is
// consumed only by registerTracking (one per new number); getTracking (polling)
// is quota-free — so 200 ≈ 200 club shipments.
//
// Fail-closed everywhere: any HTTP/network/parse failure (or a rejected number)
// → getTracking returns null so the caller leaves state unchanged; unknown
// statuses map to in_transit, never delivered.
//
// Pure module boundary: no Next/prisma imports; fetch/apiKey/base are injectable.
//
// 17track v2.4 (verified against the live API + docs, 2026-08-18):
//   base   https://api.17track.net/track/v2.4
//   header 17token: <key>
//   POST /register     body [{ number, carrier }]  (spends 1 quota per new number)
//   POST /gettrackinfo body [{ number, carrier }]  (no quota)
//   envelope { code, data: { accepted: [...], rejected: [{ number, carrier, error:{code,message} }] } }
//   status  data.accepted[].track_info.latest_status.status  (one of the 9 below)
//   time    data.accepted[].track_info.latest_event.time_iso (delivery time when Delivered)

export type DeliveryStatus = 'in_transit' | 'delivered' | 'exception'

export const UPS_CARRIER = 100002

const DEFAULT_BASE = 'https://api.17track.net/track/v2.4'

export interface TrackDeps {
  fetch?: typeof fetch
  apiKey?: string
  base?: string
}

/**
 * Map a 17track `package_status` string to our normalized status.
 * Fail-safe: anything not explicitly delivered/exception → in_transit, so an
 * unknown or new 17track status can never be read as "delivered".
 */
export function mapPackageStatus(raw: string): DeliveryStatus {
  switch (raw) {
    case 'Delivered':
      return 'delivered'
    case 'Exception':
    case 'DeliveryFailure':
    case 'Expired':
      return 'exception'
    // NotFound, InfoReceived, InTransit, AvailableForPickup, OutForDelivery,
    // and anything unrecognized:
    default:
      return 'in_transit'
  }
}

function resolveDeps(deps?: TrackDeps) {
  return {
    fetchImpl: deps?.fetch ?? globalThis.fetch,
    apiKey: deps?.apiKey ?? process.env.SEVENTEENTRACK_API_KEY ?? '',
    base: deps?.base ?? process.env.SEVENTEENTRACK_API_BASE ?? DEFAULT_BASE,
  }
}

async function post(path: string, number: string, carrier: number, deps?: TrackDeps): Promise<any | null> {
  const { fetchImpl, apiKey, base } = resolveDeps(deps)
  try {
    const res = await fetchImpl(`${base}/${path}`, {
      method: 'POST',
      headers: { '17token': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify([{ number, carrier }]),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Ask 17track to start following a tracking number. Fail-soft: any error
 * (HTTP, network, already-registered) resolves without throwing so a
 * registration hiccup never blocks a board member saving tracking. The daily
 * poll self-heals (getTracking null-returns until the number is registered).
 */
export async function registerTracking(number: string, carrier: number, deps?: TrackDeps): Promise<void> {
  // post() already swallows network/HTTP errors → null. An "already registered"
  // response comes back as a normal envelope in data.rejected, which is also fine
  // — we don't need to inspect it; registration is best-effort.
  await post('register', number, carrier, deps)
}

/**
 * Read the current delivery status for a tracking number. Returns null when the
 * status can't be determined (HTTP/network/parse error, or the number is not in
 * data.accepted — e.g. unregistered/rejected), signalling the caller to leave
 * stored state unchanged.
 */
export async function getTracking(
  number: string,
  carrier: number,
  deps?: TrackDeps,
): Promise<{ status: DeliveryStatus; deliveredAt: Date | null } | null> {
  const body = await post('gettrackinfo', number, carrier, deps)
  if (!body) return null
  try {
    const accepted: any[] = body?.data?.accepted ?? []
    const entry = accepted.find((e) => e?.number === number) ?? accepted[0]
    if (!entry) return null
    const rawStatus: string = entry?.track_info?.latest_status?.status ?? ''
    if (!rawStatus) return null
    const status = mapPackageStatus(rawStatus)
    let deliveredAt: Date | null = null
    if (status === 'delivered') {
      const iso: string | undefined = entry?.track_info?.latest_event?.time_iso
      const d = iso ? new Date(iso) : null
      deliveredAt = d && !isNaN(d.getTime()) ? d : null
    }
    return { status, deliveredAt }
  } catch {
    return null
  }
}
