import { OFFICERS_VISUAL } from '@/lib/ui/category-visuals'

// A category pill tinted with its System-B color. `color` is a #rrggbb value
// from category-visuals; we blend it for the text/background via color-mix so
// one component covers every hue without per-color Tailwind classes.
export function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-block text-[10px] font-bold uppercase tracking-wide rounded-full px-2.5 py-0.5"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
      }}
    >
      {children}
    </span>
  )
}

// The officers-only flag. Same shape as Badge but always red with a lock —
// it rides on top of whatever category a piece of content belongs to.
export function OfficersBadge() {
  return (
    <span
      className="inline-block text-[10px] font-bold uppercase tracking-wide rounded-full px-2.5 py-0.5"
      style={{
        color: OFFICERS_VISUAL.color,
        background: `color-mix(in srgb, ${OFFICERS_VISUAL.color} 14%, transparent)`,
      }}
    >
      {OFFICERS_VISUAL.icon} {OFFICERS_VISUAL.label}
    </span>
  )
}
