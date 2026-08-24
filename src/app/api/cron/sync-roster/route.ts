import { NextResponse } from 'next/server'
import { syncRoster, syncPayments } from '@/lib/roster'

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const r = await syncRoster()
    // Payments sync runs independently: a payments hiccup must not fail the
    // roster sync (the more critical of the two). Report its outcome separately.
    let payments: { payments: number } | { error: string }
    try {
      payments = await syncPayments()
    } catch (e) {
      payments = { error: e instanceof Error ? e.message : String(e) }
    }
    return NextResponse.json({ ok: true, ...r, payments })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
