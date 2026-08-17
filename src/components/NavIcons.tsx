import type { IconName } from '@/lib/nav'

// Inline stroke SVGs (currentColor) so they inherit text color + accent on
// active/hover. ~18px via className (default h-[18px] w-[18px]). No icon lib.
const PATHS: Record<IconName, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5" />,
  trophy: <path d="M7 4h10v3a5 5 0 0 1-10 0V4ZM7 5H4v1a3 3 0 0 0 3 3M17 5h3v1a3 3 0 0 1-3 3M9 14.5V17h6v-2.5M8 20h8" />,
  wrench: <path d="M14.5 6.5a3.5 3.5 0 0 0-4.6 4.2L4 16.6 6.4 19l5.9-5.9a3.5 3.5 0 0 0 4.2-4.6l-2 2-1.9-1.9 2-2Z" />,
  book: <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4ZM5 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2M18 17H7" />,
  shield: <path d="M12 3 5 6v5c0 4.2 2.9 7.5 7 9 4.1-1.5 7-4.8 7-9V6l-7-3Z" />,
  help: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM9.5 9.5a2.5 2.5 0 0 1 4.6 1.3c0 1.7-2.1 2-2.1 3.4M12 17h.01" />,
}

export function NavIcon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={className ?? 'h-[18px] w-[18px]'}>
      {PATHS[name]}
    </svg>
  )
}
