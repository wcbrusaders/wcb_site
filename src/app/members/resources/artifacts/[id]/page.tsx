import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

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
  // API route (which re-checks isBoard) — the raw blobUrl is never rendered
  // in markup, so it can't leak via view-source or a shared link.
  const fileSrc = artifact.audience === 'officers' ? `/api/artifacts/${artifact.id}` : artifact.blobUrl

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <Link href="/members/resources" className="text-sm text-foreground/50 hover:text-accent">
        ← Resources
      </Link>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold">{artifact.title}</h1>
        {artifact.audience === 'officers' && (
          <span className="inline-block text-[10px] font-semibold uppercase tracking-wide text-amber-400 border border-amber-500/40 rounded-full px-2 py-0.5">
            Officers only
          </span>
        )}
      </div>

      {artifact.description && <p className="text-foreground/55 mt-2">{artifact.description}</p>}

      <div className="mt-6">
        {artifact.mimeType.startsWith('image/') ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileSrc} alt={artifact.title} className="max-w-full rounded-xl border border-border/40" />
        ) : artifact.mimeType === 'application/pdf' ? (
          <div>
            <iframe src={fileSrc} className="w-full h-[75vh] rounded-xl border border-border/40" title={artifact.title} />
            <a
              href={fileSrc}
              download
              className="inline-block mt-3 border border-accent/40 text-accent px-3 py-1.5 rounded-full text-sm hover:border-accent/70"
            >
              Download
            </a>
          </div>
        ) : (
          <div className="flex items-center gap-4 rounded-xl border border-border/40 bg-card-bg/30 p-4">
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
              href={fileSrc}
              download
              className="border border-accent/40 text-accent px-3 py-1.5 rounded-full text-sm hover:border-accent/70"
            >
              Download
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
