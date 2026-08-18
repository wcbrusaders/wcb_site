import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Escape a filename for use inside a Content-Disposition header value.
function sanitizeFilename(name: string): string {
  return name.replace(/["\r\n]/g, '')
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const forceDownload = new URL(req.url).searchParams.get('download') === '1'

  // Never hand a member's browser a native Office/Docs file to open inline —
  // that's exactly the "opens an editor" bug this route exists to prevent.
  // If the artifact has a rendered, read-only PDF, serve THAT inline (unless
  // the caller explicitly asked to download). Otherwise the original is
  // download-only, always as an attachment.
  const serveRendered = artifact.viewable && artifact.renderedPdfUrl && !forceDownload
  const sourceUrl = serveRendered ? artifact.renderedPdfUrl! : artifact.blobUrl
  const contentType = serveRendered ? 'application/pdf' : artifact.mimeType

  const blobRes = await fetch(sourceUrl)
  if (!blobRes.ok || !blobRes.body) return new NextResponse(null, { status: 404 })

  // Inline only for a viewable artifact being served for on-page viewing
  // (the rendered PDF, or an image/native-PDF original) and not forced to
  // download. Everything else — non-viewable originals, or any request with
  // ?download=1 — is an attachment so the browser downloads it instead of
  // opening it in Google Docs/Office Online or similar.
  const canInline =
    !forceDownload && artifact.viewable && (serveRendered || contentType.startsWith('image/') || contentType === 'application/pdf')
  const disposition = canInline ? 'inline' : `attachment; filename="${sanitizeFilename(artifact.title)}"`

  return new NextResponse(blobRes.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': disposition,
      'Cache-Control': artifact.audience === 'officers' ? 'private, no-store' : 'public, max-age=3600',
    },
  })
}
