'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

// Fire-and-forget pageview beacon, mounted in the root layout so it runs on
// every route (public + members). Posts only the pathname; the server derives
// area + member from the session. Errors are swallowed — this must never affect
// the page. Excluded paths are filtered server-side (classifyArea).
export function StatsBeacon() {
  const pathname = usePathname()
  useEffect(() => {
    if (!pathname) return
    try {
      fetch('/api/stats', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pathname }),
        keepalive: true,
      }).catch(() => {})
    } catch {
      // ignore
    }
  }, [pathname])
  return null
}
