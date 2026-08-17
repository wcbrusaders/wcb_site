// src/app/members/resources/learn/page.tsx
import Link from 'next/link'
import { GuidePage } from '@/components/members/guide/GuideChrome'

export default function Page() {
  return (
    <GuidePage title="Learn & level up" dest="academy">
      <p>The club runs a full self-paced <strong>Brusaders Academy</strong> at
        {' '}<a href="https://academy.wcbrusaders.com">academy.wcbrusaders.com</a>. Its own tagline: &quot;Level
        up your brewing skills through quests, challenges, and badges.&quot;</p>
      <h2>What&apos;s there</h2>
      <p>250+ bite-size lessons (&quot;challenges&quot;) across <strong>five tiers</strong> — Foundations →
        Core Brewer → Skilled Brewer → Advanced Brewer → Expert Brewer — and <strong>three paths</strong>:
        Technical (brewing science &amp; data), Creative (innovation, wild ferm, unique ingredients), and
        Competitive (BJCP mastery &amp; competition strategy). You earn XP, streaks, and badges as you go, plus
        BJCP 2021 style flashcards. Foundations starts from zero — no experience needed.</p>
      <p>This learning progression, Foundations → Expert, is what &quot;your tier&quot; refers to on the
        Academy. (The members-site profile also shows a &quot;tier&quot; field from the club roster — that&apos;s
        a separate label; see <Link href="/members/resources/the-club">How the club runs</Link>.)</p>
      <h2>Signing in</h2>
      <p>Open <a href="https://academy.wcbrusaders.com">academy.wcbrusaders.com</a> and click
        <strong> &quot;Start Your Journey&quot;</strong> → sign in <strong>with Google</strong>. This is a
        separate login from this members site, and access is granted to current club members.</p>
      <p>Known rough edge: if the Academy says you&apos;re not authorized even though your membership is
        current, its roster hasn&apos;t picked you up yet — contact the board.</p>
      <p className="text-foreground/60">Content is still growing — the Competitive path&apos;s upper tiers are
        partly in progress, and a lesson with no content yet shows a &quot;coming soon&quot; note.</p>
    </GuidePage>
  )
}
