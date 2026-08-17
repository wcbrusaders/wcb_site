// src/app/members/resources/borrow-gear/page.tsx
import { GuidePage } from '@/components/members/guide/GuideChrome'
export default function Page() {
  return (
    <GuidePage title="Borrow gear & books" dest="site">
      <p>The club lends equipment and books to members. Two catalogs:
        {' '}<a href="/members/equipment">Equipment</a> and <a href="/members/library">Books</a>.</p>
      <h2>Checking out</h2>
      <p>Open a title and click <strong>Check out</strong> when a copy is available and you don&apos;t
        already hold that title. For equipment, pick the item&apos;s condition on the way out. An officer
        is notified so you can arrange handoff — pickup is coordinated directly, not through the site.</p>
      <h2>How long you keep it</h2>
      <ul>
        <li><strong>Books:</strong> 30 days. <strong>Equipment:</strong> 14 days.</li>
        <li><strong>Renew</strong> up to <strong>2 times</strong> (each renewal adds another full period).</li>
        <li>Return any time; equipment asks what condition it&apos;s coming back in.</li>
        <li>One copy per title at a time. No limit on how many different titles you hold. No fines.</li>
      </ul>
      <h2>Add to the library</h2>
      <p><strong>Any member</strong> can add a book or piece of equipment for others to borrow.</p>
      <p className="text-foreground/60"><em>Coming soon:</em> a member store to buy, sell, and donate gear — proceeds to the club.</p>
    </GuidePage>
  )
}
