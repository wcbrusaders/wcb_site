'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import type { TierMixRow } from '@/lib/metrics/composition'

// Fixed categorical order — colors follow the tier name, not its rank, so
// they don't get reassigned if counts shift between renders.
const COLORS: Record<string, string> = {
  Single: '#2a78d6',
  Couple: '#eb6834',
  Family: '#1baf7a',
  Student: '#eda100',
  Unknown: '#666666',
}
const FALLBACK_COLORS = ['#4a3aa7', '#e34948', '#e87ba4', '#008300']

function colorFor(tier: string, fallbackIndex: number): string {
  return COLORS[tier] ?? FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length]
}

export function TierDonut({ tierMix }: { tierMix: TierMixRow[] }) {
  const total = tierMix.reduce((sum, t) => sum + t.count, 0)

  if (tierMix.length === 0 || total === 0) {
    return (
      <div className="rounded-2xl border p-6 text-center text-sm text-foreground/50 h-full" style={{ borderColor: '#2c2c2c' }}>
        No current members yet.
      </div>
    )
  }

  let fallbackIdx = 0
  const data = tierMix.map((t) => {
    const color = colorFor(t.tier, fallbackIdx)
    if (!COLORS[t.tier]) fallbackIdx++
    return { name: t.tier, value: t.count, color }
  })

  return (
    <div className="rounded-2xl border p-4 md:p-6" style={{ borderColor: '#2c2c2c', background: '#1c1c1c' }}>
      <p className="text-[11px] text-foreground/40 mb-2">Current members by tier ({total} total)</p>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            stroke="#1c1c1c"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null
              const p = payload[0]
              const pct = total > 0 ? Math.round(((p.value as number) / total) * 100) : 0
              return (
                <div style={{ background: '#161616', border: '1px solid #2c2c2c', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
                  <span style={{ color: p.payload.color }}>{p.name}</span>: {p.value} ({pct}%)
                </div>
              )
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#898781' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
