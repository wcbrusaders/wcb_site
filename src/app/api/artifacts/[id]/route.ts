import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const artifact = await prisma.artifact.findUnique({ where: { id } })
  if (!artifact) return new NextResponse(null, { status: 404 })

  // This route serves member-area files; require a logged-in member for ANY
  // tier (the /members/* layout doesn't cover /api/*, so gate here explicitly).
  const session = await auth()
  if (!session?.user?.memberId) return new NextResponse(null, { status: 404 })

  // Security-critical: officer-audience artifacts additionally require a board
  // session. 404 (not 403) so a member probing ids can't distinguish "not
  // board" from "doesn't exist" — existence of officers-only artifacts is never
  // revealed.
  if (artifact.audience === 'officers' && !session.user.isBoard) {
    return new NextResponse(null, { status: 404 })
  }

  // Officer bytes must be proxied, never redirected: a redirect to the public
  // blobUrl would hand the member's browser a URL that works for anyone,
  // permanently bypassing this gate. So fetch the blob server-side and stream
  // the bytes back through this authenticated route.
  //
  // Member artifacts could be redirected safely (their blobUrl is already
  // public), but streaming works for both and keeps this route's behavior
  // uniform — member pages link directly to blobUrl anyway, so this branch
  // rarely serves them.
  const blobRes = await fetch(artifact.blobUrl)
  if (!blobRes.ok || !blobRes.body) return new NextResponse(null, { status: 404 })

  return new NextResponse(blobRes.body, {
    status: 200,
    headers: {
      'Content-Type': artifact.mimeType,
      'Cache-Control': artifact.audience === 'officers' ? 'private, no-store' : 'public, max-age=3600',
    },
  })
}
