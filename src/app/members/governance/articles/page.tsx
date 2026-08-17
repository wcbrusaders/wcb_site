import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { ArticlesBody } from '@/components/governance/ArticlesBody'
export const dynamic = 'force-dynamic'
export default async function ArticlesPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  if (!session.user.isBoard) redirect('/members/governance')  // officer-only
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <Link href="/members/governance" className="text-sm text-foreground/50 hover:text-accent">← Governance</Link>
      <h1 className="text-3xl font-bold mt-3">Articles of Incorporation</h1>
      <p className="text-foreground/50 text-sm mt-1">Holly Springs Brüsaders · legal founding document · officers only</p>
      <div className="mt-6"><ArticlesBody /></div>
    </div>
  )
}
