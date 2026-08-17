import Link from 'next/link'
import { BylawsBody } from '@/components/governance/BylawsBody'
export const dynamic = 'force-dynamic'
export default function BylawsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <Link href="/members/governance" className="text-sm text-foreground/50 hover:text-accent">← Governance</Link>
      <h1 className="text-3xl font-bold mt-3">Bylaws</h1>
      <p className="text-foreground/50 text-sm mt-1">Holly Springs Brüsaders · operating as Wake County Brusaders</p>
      <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/[0.06] p-3.5 text-sm">
        <span className="font-semibold text-amber-300">Draft v2.0 — pending Board ratification.</span> These bylaws
        have not yet been adopted by Board vote. Provided for review.
      </div>
      <div className="mt-6"><BylawsBody /></div>
    </div>
  )
}
