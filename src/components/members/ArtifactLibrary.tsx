import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { CATEGORY_LABELS, type ArtifactCategory } from '@/lib/artifacts/categories'

function filetypeLabel(mimeType: string): string {
  if (mimeType.startsWith('image/')) return mimeType.replace('image/', '').toUpperCase()
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType.includes('presentation')) return 'Slides'
  if (mimeType.includes('spreadsheet')) return 'Sheet'
  if (mimeType.includes('word') || mimeType.includes('document')) return 'Doc'
  return mimeType
}

export async function ArtifactLibrary({ category }: { category: ArtifactCategory }) {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')

  const isBoard = !!session.user.isBoard

  // Security-critical: non-board viewers must never receive officers-only
  // rows from this query — the filter happens at the DB level, not by
  // hiding them client-side, so an officer artifact is never sent to a
  // member's browser in the first place.
  const artifacts = await prisma.artifact.findMany({
    where: {
      category,
      ...(isBoard ? {} : { audience: 'members' }),
    },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      title: true,
      mimeType: true,
      thumbnailUrl: true,
      audience: true,
    },
  })

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <Link href="/members/resources" className="text-sm text-foreground/50 hover:text-accent">
        ← Resources
      </Link>
      <h1 className="text-2xl md:text-3xl font-bold mt-3">{CATEGORY_LABELS[category]}</h1>

      {artifacts.length === 0 ? (
        <p className="text-foreground/50 mt-6">Nothing published here yet.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {artifacts.map((a) => (
            <Link
              key={a.id}
              href={`/members/resources/artifacts/${a.id}`}
              className="rounded-xl border border-border/60 bg-card-bg/30 hover:border-accent/40 overflow-hidden flex flex-col"
            >
              <div className="aspect-square w-full bg-card-bg/50 flex items-center justify-center overflow-hidden">
                {a.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-medium text-foreground/50 text-center px-2">
                    {filetypeLabel(a.mimeType)}
                  </span>
                )}
              </div>
              <div className="p-3">
                {a.audience === 'officers' && (
                  <span className="inline-block mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-400 border border-amber-500/40 rounded-full px-2 py-0.5">
                    Officers only
                  </span>
                )}
                <div className="font-semibold text-sm leading-snug">{a.title}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
