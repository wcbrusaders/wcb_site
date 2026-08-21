import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { BylawsBody } from '@/components/governance/BylawsBody'
import { PageHeader } from '@/components/ui'
import { getGovernance } from '@/lib/governance/governance'
export const dynamic = 'force-dynamic'
export default async function BylawsPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  const gov = await getGovernance('bylaws')
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
      {gov ? (
        <div
          className="mt-6 text-foreground/75 text-[15px] leading-relaxed space-y-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-2 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_li]:my-0.5 [&_a]:text-accent [&_a]:hover:underline [&_strong]:font-semibold [&_em]:italic"
          dangerouslySetInnerHTML={{ __html: gov.bodyHtml }}
        />
      ) : (
        <div className="mt-6"><BylawsBody /></div>
      )}
    </div>
  )
}
