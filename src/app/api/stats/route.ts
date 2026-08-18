import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { recordView } from '@/lib/stats/record'

// Lightweight pageview beacon. The client posts the pathname; we derive the
// area + signed-in member server-side (client never sends member identity).
// Fail-soft: always 204, never surfaces an error to the page.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const pathname = typeof body?.pathname === 'string' ? body.pathname : null
    if (pathname) {
      const session = await auth().catch(() => null)
      const memberId = session?.user?.memberId ?? null
      await recordView(pathname, memberId)
    }
  } catch {
    // swallow — counting must never break navigation
  }
  return new NextResponse(null, { status: 204 })
}
