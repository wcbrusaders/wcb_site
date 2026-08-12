import { SiteHeader } from '@/components/SiteHeader'

// SiteHeader renders ONLY on members pages. Non-members pages (/, /login, /bot)
// have their own headers, so the global header lived in the root layout before
// and double-stacked. Scoping it here fixes that structurally.
export default function MembersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  )
}
