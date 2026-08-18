import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { CATEGORY_LABELS, type ArtifactCategory } from '@/lib/artifacts/categories'
import { artifactCategoryVisual } from '@/lib/ui/category-visuals'
import { PageHeader, EmptyState, OfficersBadge } from '@/components/ui'

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
  const visual = artifactCategoryVisual(category)

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
      <PageHeader
        back={{ href: '/members/resources', label: 'Resources' }}
        eyebrow={`${visual.icon} Library`}
        title={CATEGORY_LABELS[category]}
      />

      {artifacts.length === 0 ? (
        <EmptyState icon={visual.icon}>Nothing published here yet.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {artifacts.map((a) => (
            <Link
              key={a.id}
              href={`/members/resources/artifacts/${a.id}`}
              className="group rounded-2xl border overflow-hidden flex flex-col bg-[linear-gradient(#1c1c1c,#161616)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
              style={{ borderColor: '#2c2c2c', borderTop: `3px solid ${visual.color}` }}
            >
              <div className="aspect-square w-full bg-black/30 flex items-center justify-center overflow-hidden">
                {a.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span
                    aria-hidden
                    className="w-10 h-10 rounded-lg grid place-items-center text-lg"
                    style={{ background: `color-mix(in srgb, ${visual.color} 20%, transparent)` }}
                  >
                    {visual.icon}
                  </span>
                )}
              </div>
              <div className="p-3">
                {a.audience === 'officers' && (
                  <div className="mb-1.5">
                    <OfficersBadge />
                  </div>
                )}
                <div className="font-semibold text-sm leading-snug">{a.title}</div>
                <div className="text-[11px] text-foreground/40 mt-1">{filetypeLabel(a.mimeType)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
