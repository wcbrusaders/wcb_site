'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { SeasonalityRow } from '@/lib/metrics/composition'

export function SeasonalityBars({ seasonality }: { seasonality: SeasonalityRow[] }) {
  const total = seasonality.reduce((sum, s) => sum + s.joins, 0)

  if (seasonality.length === 0 || total === 0) {
    return (
      <div className="rounded-2xl border p-6 text-center text-sm text-foreground/50 h-full" style={{ borderColor: '#2c2c2c' }}>
        No join-date data yet.
      </div>
    )
  }

  const maxJoins = Math.max(...seasonality.map((s) => s.joins))

  return (
    <div className="rounded-2xl border p-4 md:p-6" style={{ borderColor: '#2c2c2c', background: '#1c1c1c' }}>
      <p className="text-[11px] text-foreground/40 mb-2">Joins by month, all-time ({total} total)</p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={seasonality} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="#2c2c2c" strokeDasharray="0" vertical={false} />
          <XAxis dataKey="month" stroke="#666666" tick={{ fill: '#898781', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#383835' }} />
          <YAxis stroke="#666666" tick={{ fill: '#898781', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#383835' }} allowDecimals={false} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null
              return (
                <div style={{ background: '#161616', border: '1px solid #2c2c2c', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
                  <span style={{ color: '#f5f5f5' }}>{label}</span>: <span style={{ color: '#ff9500' }}>{payload[0].value} joins</span>
                </div>
              )
            }}
          />
          <Bar dataKey="joins" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {seasonality.map((s) => (
              <Cell
                key={s.month}
                fill={s.joins === maxJoins ? '#ff9500' : 'color-mix(in srgb, #ff9500 55%, transparent)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
