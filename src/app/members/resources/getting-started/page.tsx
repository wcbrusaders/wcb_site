// src/app/members/resources/getting-started/page.tsx
import Link from 'next/link'
import { GuidePage } from '@/components/members/guide/GuideChrome'

export default function Page() {
  return (
    <GuidePage title="Getting started">
      <p>Here&apos;s the real path from new name to logged-in member.</p>
      <h2>Before you can log in</h2>
      <ul>
        <li>Read the <Link href="/code-of-conduct">Code of Conduct</Link> and agree to it.</li>
        <li>Pay dues via PayPal on the public <Link href="/join">/join</Link> page (handled off-site).</li>
        <li>Get added to the club roster and Google Group — this happens out-of-band, not instantly.</li>
      </ul>
      <p>Once you&apos;re on the roster, you can log in: enter your email and we send a 6-digit code
        (valid 10 minutes) — no password. Only current roster members can sign in.</p>
      <h2>Once you&apos;re in</h2>
      <p>The <Link href="/members">hub</Link> shows your membership status, tier, tenure, and important dates.
        From there, each task on this Resources page tells you what to do and where it happens.</p>
      <ul>
        <li>Link your Discord account with <strong>/link</strong> in the server — this DM-based command uses
          your join email and unlocks things like <strong>/dashboard</strong>.</li>
        <li>Say hi in the server and explore — the bot can also answer brewing questions in plain English.</li>
      </ul>
      <h2>Where to go next</h2>
      <ul>
        <li>Want to borrow something? See <Link href="/members/resources/borrow-gear">Borrow gear &amp; books</Link>.</li>
        <li>Want to compete? See <Link href="/members/resources/enter-competition">Enter a competition</Link>.</li>
        <li>Curious how the club runs? See <Link href="/members/resources/the-club">How the club runs</Link>.</li>
      </ul>
    </GuidePage>
  )
}
