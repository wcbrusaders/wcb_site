import { NextResponse } from 'next/server'
import { syncMeetingNotes } from '@/lib/knowledge/notes-sync'
import { processPendingDrafts } from '@/lib/knowledge/process-drafts'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const s = await syncMeetingNotes()
    const p = await processPendingDrafts()
    return NextResponse.json({
      ok: true,
      scanned: s.scanned,
      created: s.created,
      processed: p.processed,
      errored: p.errored,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
