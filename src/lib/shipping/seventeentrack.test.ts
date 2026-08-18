import { describe, it, expect, vi } from 'vitest'
import {
  mapPackageStatus,
  UPS_CARRIER,
  registerTracking,
  getTracking,
} from './seventeentrack'

describe('mapPackageStatus', () => {
  it('maps Delivered to delivered', () => {
    expect(mapPackageStatus('Delivered')).toBe('delivered')
  })
  it('maps failure/exception/expired to exception', () => {
    expect(mapPackageStatus('Exception')).toBe('exception')
    expect(mapPackageStatus('DeliveryFailure')).toBe('exception')
    expect(mapPackageStatus('Expired')).toBe('exception')
  })
  it('maps all in-transit-ish statuses to in_transit', () => {
    for (const s of ['NotFound', 'InfoReceived', 'InTransit', 'AvailableForPickup', 'OutForDelivery']) {
      expect(mapPackageStatus(s)).toBe('in_transit')
    }
  })
  it('fails safe: unknown/empty never maps to delivered', () => {
    expect(mapPackageStatus('SomethingNew')).toBe('in_transit')
    expect(mapPackageStatus('')).toBe('in_transit')
  })
  it('exposes the UPS carrier code', () => {
    expect(UPS_CARRIER).toBe(100002)
  })
})

// A fake fetch that returns a given JSON body with ok:true unless overridden.
function fakeFetch(body: unknown, init?: { ok?: boolean; throws?: boolean; badJson?: boolean }) {
  return vi.fn(async () => {
    if (init?.throws) throw new Error('network down')
    return {
      ok: init?.ok ?? true,
      status: init?.ok === false ? 500 : 200,
      json: async () => {
        if (init?.badJson) throw new Error('bad json')
        return body
      },
    } as unknown as Response
  })
}

const DEPS = (fetchImpl: typeof fetch) => ({ fetch: fetchImpl, apiKey: 'test-key', base: 'https://api.example/v2.4' })

function accepted(number: string, status: string, timeIso: string | null) {
  return {
    code: 0,
    data: {
      accepted: [
        {
          number,
          track_info: {
            latest_status: { status },
            latest_event: timeIso ? { time_iso: timeIso } : {},
          },
        },
      ],
      rejected: [],
    },
  }
}

describe('getTracking', () => {
  it('returns delivered + deliveredAt from a Delivered entry', async () => {
    const f = fakeFetch(accepted('1Z9', 'Delivered', '2026-08-18T15:00:00Z'))
    const r = await getTracking('1Z9', UPS_CARRIER, DEPS(f as unknown as typeof fetch))
    expect(r).toEqual({ status: 'delivered', deliveredAt: new Date('2026-08-18T15:00:00Z') })
  })

  it('returns in_transit with null deliveredAt', async () => {
    const f = fakeFetch(accepted('1Z9', 'InTransit', '2026-08-17T10:00:00Z'))
    const r = await getTracking('1Z9', UPS_CARRIER, DEPS(f as unknown as typeof fetch))
    expect(r).toEqual({ status: 'in_transit', deliveredAt: null })
  })

  it('returns exception with null deliveredAt', async () => {
    const f = fakeFetch(accepted('1Z9', 'Exception', '2026-08-17T10:00:00Z'))
    const r = await getTracking('1Z9', UPS_CARRIER, DEPS(f as unknown as typeof fetch))
    expect(r).toEqual({ status: 'exception', deliveredAt: null })
  })

  it('returns null when the number is rejected (unregistered)', async () => {
    const body = { code: 0, data: { accepted: [], rejected: [{ number: '1Z9', carrier: UPS_CARRIER, error: { code: -18019902, message: 'not registered' } }] } }
    const f = fakeFetch(body)
    const r = await getTracking('1Z9', UPS_CARRIER, DEPS(f as unknown as typeof fetch))
    expect(r).toBeNull()
  })

  it('returns null on HTTP error', async () => {
    const f = fakeFetch({}, { ok: false })
    const r = await getTracking('1Z9', UPS_CARRIER, DEPS(f as unknown as typeof fetch))
    expect(r).toBeNull()
  })

  it('returns null on thrown fetch / malformed JSON (never throws)', async () => {
    const t = fakeFetch({}, { throws: true })
    expect(await getTracking('1Z9', UPS_CARRIER, DEPS(t as unknown as typeof fetch))).toBeNull()
    const b = fakeFetch({}, { badJson: true })
    expect(await getTracking('1Z9', UPS_CARRIER, DEPS(b as unknown as typeof fetch))).toBeNull()
  })
})

describe('registerTracking', () => {
  it('POSTs to /register with the token header and [{number,carrier}] body', async () => {
    const f = fakeFetch({ code: 0, data: { accepted: [{ number: '1Z9' }], rejected: [] } })
    await registerTracking('1Z9', UPS_CARRIER, DEPS(f as unknown as typeof fetch))
    expect(f).toHaveBeenCalledTimes(1)
    const [url, opts] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://api.example/v2.4/register')
    expect((opts as RequestInit).method).toBe('POST')
    const headers = (opts as RequestInit).headers as Record<string, string>
    expect(headers['17token']).toBe('test-key')
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual([{ number: '1Z9', carrier: UPS_CARRIER }])
  })

  it('treats an already-registered response as success (no throw)', async () => {
    const body = { code: 0, data: { accepted: [], rejected: [{ number: '1Z9', error: { code: -18019901, message: 'already registered' } }] } }
    const f = fakeFetch(body)
    await expect(registerTracking('1Z9', UPS_CARRIER, DEPS(f as unknown as typeof fetch))).resolves.toBeUndefined()
  })

  it('is fail-soft on HTTP/network error (never throws)', async () => {
    const err = fakeFetch({}, { ok: false })
    await expect(registerTracking('1Z9', UPS_CARRIER, DEPS(err as unknown as typeof fetch))).resolves.toBeUndefined()
    const thrown = fakeFetch({}, { throws: true })
    await expect(registerTracking('1Z9', UPS_CARRIER, DEPS(thrown as unknown as typeof fetch))).resolves.toBeUndefined()
  })
})
