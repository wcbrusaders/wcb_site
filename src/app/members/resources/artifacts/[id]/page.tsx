import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { PageHeader, OfficersBadge } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function ArtifactPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')

  const { id } = await params
  const artifact = await prisma.artifact.findUnique({ where: { id } })
  if (!artifact) notFound()

  // Security-critical direct-link gate: a member with a link to an
  // officers-only artifact (bookmarked, shared, guessed id) must never see
  // it — 404, not a redirect, so the artifact's existence isn't confirmed.
  if (artifact.audience === 'officers' && !session.user.isBoard) notFound()

  // For officer artifacts, the file is only ever served through the gated
  // API route (which re-checks isBoard) — the raw blobUrl/renderedPdfUrl is
  // never rendered in markup, so it can't leak via view-source or a shared
  // link. Member artifacts can point straight at the public blob URLs.
  const isOfficer = artifact.audience === 'officers'
  const gatedSrc = `/api/artifacts/${artifact.id}`
  const downloadSrc = isOfficer ? `${gatedSrc}?download=1` : artifact.blobUrl

  // Render decision — never fall through to a link that opens Google Docs/an
  // online editor. Only three outcomes: rendered read-only PDF inline, an
  // image inline, or a download-only button.
  const isImage = artifact.mimeType.startsWith('image/')
  const hasRenderedPdf = Boolean(artifact.renderedPdfUrl)
  const showInlinePdf = hasRenderedPdf || (artifact.viewable && artifact.mimeType === 'application/pdf')
  const inlineSrc = isOfficer ? gatedSrc : hasRenderedPdf ? artifact.renderedPdfUrl! : artifact.blobUrl

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <PageHeader
        back={{ href: '/members/resources', label: 'Resources' }}
        title={artifact.title}
        lead={artifact.description ?? undefined}
      />
      {artifact.audience === 'officers' && (
        <div className="-mt-4 mb-6">
          <OfficersBadge />
        </div>
      )}

      <div>
        {showInlinePdf ? (
          // Read-only PDF viewer only — the rendered export (or a native PDF
          // original) is embedded inline via <iframe>. Never a Google
          // Docs/Office Online URL, which would open an editable document.
          <div>
            <iframe src={inlineSrc} className="w-full h-[75vh] rounded-xl border border-border/40" title={artifact.title} />
            <a
              href={downloadSrc}
              download
              className="inline-flex items-center gap-1.5 mt-3 rounded-full border border-border/60 text-foreground/80 hover:text-foreground hover:border-accent/50 px-5 py-2 text-sm font-medium transition-colors"
            >
              ⬇ Download
            </a>
          </div>
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={inlineSrc} alt={artifact.title} className="max-w-full rounded-xl border border-border/40" />
        ) : (
          // No usable rendition: download-only, never an inline embed of the
          // original (which could hand the browser a native Office/Docs file
          // and trigger an online editor).
          <div className="flex items-center gap-4 rounded-2xl border p-4 bg-[linear-gradient(#1c1c1c,#161616)]" style={{ borderColor: '#2c2c2c' }}>
            {artifact.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={artifact.thumbnailUrl}
                alt=""
                className="w-16 h-16 object-cover rounded-lg border border-border/40 shrink-0"
              />
            ) : (
              <div className="w-16 h-16 flex items-center justify-center rounded-lg border border-border/40 text-xs font-medium text-foreground/50 shrink-0">
                File
              </div>
            )}
            <a
              href={downloadSrc}
              download
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 text-foreground/80 hover:text-foreground hover:border-accent/50 px-5 py-2 text-sm font-medium transition-colors"
            >
              ⬇ Download
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
