import { NextResponse } from 'next/server'
import { syncArtifacts, ARTIFACT_FOLDER_IDS } from '@/lib/artifacts/artifacts-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const r = await syncArtifacts(ARTIFACT_FOLDER_IDS)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
