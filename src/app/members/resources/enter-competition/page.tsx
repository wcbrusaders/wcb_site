// src/app/members/resources/enter-competition/page.tsx
import { GuidePage } from '@/components/members/guide/GuideChrome'

export default function Page() {
  return (
    <GuidePage title="Enter a competition" dest="site">
      <p>Competitions live at <a href="/members/competitions">/members/competitions</a>.
        <strong> Any member</strong> can add a competition (name, homepage, entry-registration date,
        beer-arrival date, bottles per entry, ship-to address, optional drop-off). <strong>Any member</strong> can
        add, edit, or delete their own entries (beer name, style, channel, registered flag). Deleting a whole
        competition is board-only.</p>
      <h2>Three ways a beer gets there</h2>
      <ul>
        <li><strong>Club ships</strong> — the club ships it for you. Only these entries count toward the club
          pack, its reminders, and &quot;the club covers shipping.&quot;</li>
        <li><strong>I ship it</strong> — you handle shipping yourself.</li>
        <li><strong>I drop off</strong> — you deliver it in person.</li>
      </ul>
      <h2>Deadlines</h2>
      <p><strong>Deliver-by = beer-arrival deadline − 7 days.</strong> If you have a club-ship entry, the
        competition card shows &quot;Get your bottles to the shipper by {'{date}'}&quot; and turns urgent within
        7 days of that date. In short: get club-ship bottles to the shipper a week before they need to arrive.</p>
      <h2>Registered flag</h2>
      <p>The <strong>Registered</strong> checkbox is your own bookkeeping for whether you registered on the
        competition&apos;s website — the site doesn&apos;t verify it for you.</p>
      <h2>Shipment tracking</h2>
      <p>Officers set the carrier and tracking number for the club shipment (one per competition), and
        <strong> every member can see it</strong> with a clickable tracking link (UPS, FedEx, DHL — USPS isn&apos;t
        supported since it&apos;s illegal to mail alcohol).</p>
    </GuidePage>
  )
}
