// src/app/members/resources/the-club/page.tsx
import { GuidePage, GuideTodo } from '@/components/members/guide/GuideChrome'

export default function Page() {
  return (
    <GuidePage title="How the club runs">
      <h2>Your membership</h2>
      <p>The <a href="/members">hub</a> shows your status, tier, tenure (&quot;Member for…&quot;), join/renew/last-payment
        dates, linked partner, and Drive &amp; Calendar access — all read-only and synced from the club roster.
        You can&apos;t edit your own profile in the app; ask the board to change your details.</p>
      <h2>Dues & renewal</h2>
      <GuideTodo>the dues amount and how/when to renew.</GuideTodo>
      <p>Dues are paid off-site via PayPal — the link lives on the public <a href="/join">/join</a> page.</p>
      <h2>Meetings</h2>
      <GuideTodo>meeting cadence, location, and what to expect.</GuideTodo>
      <h2>Membership tier</h2>
      <GuideTodo>what the roster &quot;Tier&quot; label means and what benefits come with it.</GuideTodo>
      <p>This roster tier is separate from your Academy progress. For the learning tiers (Foundations →
        Expert), see <a href="/members/resources/learn">Learn &amp; level up</a>.</p>
      <h2>The board & Code of Conduct</h2>
      <p>See the public <a href="/board">Board</a> and <a href="/code-of-conduct">Code of Conduct</a> pages.
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
        {' '}<a href="/members/resources/brewing-help">Brewing help</a>.</p>
    </GuidePage>
  )
}
