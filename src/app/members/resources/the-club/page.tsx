// src/app/members/resources/the-club/page.tsx
import Link from 'next/link'
import { GuidePage } from '@/components/members/guide/GuideChrome'

export default function Page() {
  return (
    <GuidePage title="How the club runs">
      <h2>Your membership</h2>
      <p>The <Link href="/members">hub</Link> shows your status, tier, tenure (&quot;Member for…&quot;), join/renew/last-payment
        dates, linked partner, and Drive &amp; Calendar access — all read-only and synced from the club roster.
        You can&apos;t edit your own profile in the app; ask the board to change your details.</p>
      <h2>Dues & renewal</h2>
      <p>Dues are <strong>$40/year</strong> for an individual membership, or <strong>$65/year</strong> for a
        dual membership (for couples and friends who brew together). They&apos;re paid off-site via PayPal —
        the link lives on the public <Link href="/join">/join</Link> page.</p>
      <h2>Meetings</h2>
      <p>We meet the <strong>third Thursday of each month</strong>, rotating between members&apos; home
        breweries and local production breweries. Find the next one on the club calendar or in Discord
        events.</p>
      <p>A typical meet covers all three kinds of brewer — a <strong>workshop</strong>, a
        {' '}<strong>technique nugget</strong>, and a <strong>style guide</strong> — spanning the scientific,
        the casual, and the competitive. And we always make room for <strong>homebrew sharing</strong>:
        tasting each other&apos;s beer is never not part of a meet.</p>
      <h2>Tiers</h2>
      <p>There&apos;s only one membership tier: <strong>Brusader</strong>. (If you see a &quot;Tier&quot; label
        elsewhere, that&apos;s your <em>learning</em> progress in the academy — Foundations → Expert — which is
        a different thing; see <Link href="/members/resources/learn">Learn &amp; level up</Link>.)</p>
      <h2>The board & Code of Conduct</h2>
      <p>See the public <Link href="/board">Board</Link> and <Link href="/code-of-conduct">Code of Conduct</Link> pages.
        To report a concern, contact the Ombudsman or any board member — the board commits to acknowledging
        within 48 hours and deciding within 7 days. The strike ladder runs Correction → Warning → Board
        decides, and access can be paused (interim) or removed by board vote.</p>
      <h2>Discord commands you can use</h2>
      <ul>
        <li><strong>/link</strong> — connect your Discord account to your membership (DM-based, use your
          join email; needed for <strong>/dashboard</strong>).</li>
        <li><strong>/grainbuy</strong> — see the active grain buy.</li>
        <li><strong>/dashboard</strong> — view your membership info in Discord.</li>
        <li><strong>/help</strong> — list available bot commands.</li>
        <li><strong>/catchup</strong> — an AI recap of what you missed in a channel.</li>
      </ul>
      <p>No account link is needed to ask the bot brewing questions — see
        {' '}<Link href="/members/resources/brewing-help">Brewing help</Link>.</p>
    </GuidePage>
  )
}
