'use client'

import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'
import type { TrendRow } from '@/lib/metrics/trends'
import type { RevenueRow } from '@/lib/metrics/revenue'

// Curated event markers overlaid on the comparison chart's quarter axis, so
// growth/decline can be read against what plausibly drove it. This is the
// seed of Phase-5 event-attribution — a real events feed can later replace
// this const without touching the render logic (still `{ quarter, label }`).
const MILESTONES: { quarter: string; label: string }[] = [
  { quarter: '2025-Q4', label: 'Reorg / restructure' },
  { quarter: '2026-Q3', label: 'Bylaws effective (Sep 25 2026)' },
  { quarter: '2026-Q4', label: 'NCHF (~Oct 18 · annual signups)' },
  // TODO(jordan): Brulosophy / Martin Keene exBEERiment — add
  // { quarter: '20XX-QX', label: 'Brulosophy exBEERiment (Martin Keene)' }
  // once the date is known.
]

type SeriesKey = 'new' | 'churn' | 'activeEOQ' | 'retentionPct' | 'revenueNetDues'

type SeriesDef = {
  key: SeriesKey
  label: string
  color: string
  unit: 'count' | 'pct' | 'usd'
  defaultOn: boolean
}

// Fixed categorical order (never reassigned/cycled) so a series keeps its
// color when other series are toggled off — "color follows the entity."
const SERIES: SeriesDef[] = [
  { key: 'activeEOQ', label: 'Active (EOQ)', color: '#ff9500', unit: 'count', defaultOn: true },
  { key: 'new', label: 'New', color: '#2a78d6', unit: 'count', defaultOn: true },
  { key: 'churn', label: 'Churn', color: '#e34948', unit: 'count', defaultOn: false },
  { key: 'retentionPct', label: 'Retention %', color: '#1baf7a', unit: 'pct', defaultOn: false },
  { key: 'revenueNetDues', label: 'Revenue (net dues)', color: '#e87ba4', unit: 'usd', defaultOn: false },
]

type ChartRow = {
  quarter: string
  new: number
  churn: number
  activeEOQ: number
  retentionPct: number
  revenueNetDues: number
}

/**
 * Joins trends + revenue by quarter and indexes every series to 100 at the
 * first quarter it has data for. All series then share ONE y-axis — a
 * dual-axis chart invents an alignment between unrelated scales (counts vs
 * % vs $) that isn't in the data, so this indexes instead of adding a second
 * axis. Hovering the tooltip still shows each series' real value+unit.
 */
function buildIndexedRows(
  chartRows: ChartRow[]
): { indexed: Record<string, number | string>[]; baselines: Record<SeriesKey, number | null> } {
  const baselines: Record<SeriesKey, number | null> = {
    new: null,
    churn: null,
    activeEOQ: null,
    retentionPct: null,
    revenueNetDues: null,
  }
  for (const def of SERIES) {
    for (const row of chartRows) {
      const v = row[def.key]
      if (v !== 0) {
        baselines[def.key] = v
        break
      }
    }
    // If every value is 0, fall back to null (rendered as flat 0 line via guard below).
  }

  const indexed = chartRows.map((row) => {
    const out: Record<string, number | string> = { quarter: row.quarter }
    for (const def of SERIES) {
      const base = baselines[def.key]
      const v = row[def.key]
      out[def.key] = base ? (v / base) * 100 : 0
    }
    return out
  })

  return { indexed, baselines }
}

function fmtRaw(key: SeriesKey, value: number): string {
  const def = SERIES.find((s) => s.key === key)!
  if (def.unit === 'pct') return `${value}%`
  if (def.unit === 'usd') return `$${value.toFixed(2)}`
  return String(Math.round(value))
}

export function TrendsCompareChart({ trends, revenue }: { trends: TrendRow[]; revenue: RevenueRow[] }) {
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>(() => {
    const initial = {} as Record<SeriesKey, boolean>
    for (const s of SERIES) initial[s.key] = s.defaultOn
    return initial
  })

  const chartRows: ChartRow[] = useMemo(() => {
    const revenueByQuarter = new Map(revenue.map((r) => [r.quarter, r]))
    return trends.map((t) => ({
      quarter: t.quarter,
      new: t.new,
      churn: t.churn,
      activeEOQ: t.activeEOQ,
      retentionPct: t.retentionPct,
      revenueNetDues: revenueByQuarter.get(t.quarter)?.netDues ?? 0,
    }))
  }, [trends, revenue])

  // Raw values keyed by quarter, for the tooltip (which should show real
  // units, not the indexed-to-100 plot value).
  const rawByQuarter = useMemo(() => {
    const m = new Map<string, ChartRow>()
    for (const row of chartRows) m.set(row.quarter, row)
    return m
  }, [chartRows])

  const { indexed } = useMemo(() => buildIndexedRows(chartRows), [chartRows])

  const quarterSet = new Set(chartRows.map((r) => r.quarter))
  const visibleMilestones = MILESTONES.filter((m) => quarterSet.has(m.quarter))

  function toggle(key: SeriesKey) {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  if (chartRows.length === 0) {
    return (
      <div className="rounded-2xl border p-6 text-center text-sm text-foreground/50" style={{ borderColor: '#2c2c2c' }}>
        No quarterly data yet.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border p-4 md:p-6" style={{ borderColor: '#2c2c2c', background: '#1c1c1c' }}>
      {/* Series toggles — simple checkboxes above the chart (clean + reliable
          across Recharts versions vs relying on Legend's onClick payload). */}
      <div className="flex flex-wrap gap-3 mb-3">
        {SERIES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => toggle(s.key)}
            className="flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 border transition-opacity"
            style={{
              borderColor: visible[s.key] ? s.color : '#333333',
              opacity: visible[s.key] ? 1 : 0.45,
              background: visible[s.key] ? `color-mix(in srgb, ${s.color} 14%, transparent)` : 'transparent',
            }}
            aria-pressed={visible[s.key]}
          >
            <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: s.color }} />
            <span style={{ color: visible[s.key] ? s.color : '#898781' }}>{s.label}</span>
          </button>
        ))}
      </div>

      <p className="text-[11px] text-foreground/40 mb-2">
        All series indexed to 100 at their first non-zero quarter, so counts/%/$ share one axis — hover for real values.
      </p>

      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={indexed} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="#2c2c2c" strokeDasharray="0" vertical={false} />
          <XAxis dataKey="quarter" stroke="#666666" tick={{ fill: '#898781', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#383835' }} />
          <YAxis
            stroke="#666666"
            tick={{ fill: '#898781', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#383835' }}
            label={{ value: 'Index (100 = first quarter)', angle: -90, position: 'insideLeft', fill: '#898781', fontSize: 11 }}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null
              const raw = rawByQuarter.get(String(label))
              return (
                <div style={{ background: '#161616', border: '1px solid #2c2c2c', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>
                  <div style={{ color: '#f5f5f5', marginBottom: 4, fontWeight: 600 }}>{label}</div>
                  {payload.map((p) => {
                    const key = p.dataKey as SeriesKey
                    const def = SERIES.find((s) => s.key === key)
                    if (!def || !raw) return null
                    return (
                      <div key={key} style={{ color: def.color }}>
                        {def.label}: {fmtRaw(key, raw[key] as number)}
                      </div>
                    )
                  })}
                </div>
              )
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: '#898781' }}
            onClick={(e) => {
              const key = SERIES.find((s) => s.label === e.value)?.key
              if (key) toggle(key)
            }}
          />
          {visibleMilestones.map((m) => (
            <ReferenceLine
              key={m.quarter}
              x={m.quarter}
              stroke="#666666"
              strokeDasharray="4 3"
              label={{
                value: m.label,
                position: 'top',
                fill: '#898781',
                fontSize: 10,
                angle: 0,
              }}
            />
          ))}
          {SERIES.filter((s) => visible[s.key]).map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
