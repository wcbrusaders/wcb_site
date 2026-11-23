import { describe, it, expect } from 'vitest'
import { fetchMetricsData } from './query'

describe('fetchMetricsData', () => {
  it('excludes the webhook idempotency markers (source "ipn:<txn>", $0) from payments', async () => {
    const db = {
      member: { findMany: async () => [] },
      payment: {
        findMany: async () => [
          { date: new Date('2026-09-01'), netDues: 38.11, source: 'PayPal' },
          { date: new Date('2026-11-22'), netDues: 0, source: 'ipn:80C852113M439871V' },
          { date: new Date('2026-11-22'), netDues: 38.11, source: 'PayPal' },
        ],
      },
    }
    const { payments } = await fetchMetricsData(db as never)
    expect(payments.map((p) => p.source)).toEqual(['PayPal', 'PayPal'])
    expect(payments.reduce((s, p) => s + p.netDues, 0)).toBeCloseTo(76.22)
  })
})
