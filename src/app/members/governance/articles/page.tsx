import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { ArticlesBody } from '@/components/governance/ArticlesBody'
import { PageHeader } from '@/components/ui'
export const dynamic = 'force-dynamic'
export default async function ArticlesPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <PageHeader
        back={{ href: '/members/governance', label: 'Governance' }}
        eyebrow="⚖️ Governance"
        title="Articles of Incorporation"
        lead="Holly Springs Brüsaders · legal founding document (public record)"
      />
      <div><ArticlesBody /></div>
    </div>
  )
}
