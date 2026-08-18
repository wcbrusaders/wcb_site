import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { BylawsBody } from '@/components/governance/BylawsBody'
import { PageHeader } from '@/components/ui'
export const dynamic = 'force-dynamic'
export default async function BylawsPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <PageHeader
        back={{ href: '/members/governance', label: 'Governance' }}
        eyebrow="⚖️ Governance"
        title="Bylaws"
        lead="Holly Springs Brüsaders · operating as Wake County Brusaders"
      />
      <div className="rounded-xl border border-amber-400/40 bg-amber-400/[0.06] p-3.5 text-sm">
        <span className="font-semibold text-amber-300">Draft v2.0 — pending member ratification.</span> This is a
        proposed rewrite of the bylaws currently in force. It is not yet adopted. Per the current bylaws
        (Article Nine), amending the bylaws requires the Board to put the change to the membership with 30 days&apos;
        notice, followed by a member vote. Provided here for review during that process.
      </div>
      <div className="mt-6"><BylawsBody /></div>
    </div>
  )
}
