// src/app/members/resources/brewing-help/page.tsx
import { GuidePage } from '@/components/members/guide/GuideChrome'

export default function Page() {
  return (
    <GuidePage title="Brewing help" dest="discord">
      <p>The bot is a <strong>brewing-knowledge partner</strong> — ask it in <strong>plain English</strong>,
        not a slash command.</p>
      <h2>How to reach it</h2>
      <ul>
        <li><strong>@mention it</strong> in any channel.</li>
        <li><strong>DM it</strong> directly.</li>
        <li>Post <strong>in a thread</strong>.</li>
        <li>Post in <strong>#bot-help</strong> — no mention needed there.</li>
      </ul>
      <h2>What you can ask</h2>
      <p>Brewing science and styles, water chemistry, hops/grains/yeast, recipes and brewing guides, quick
        calculations (for example, &quot;calculate ABV from OG 1.055 FG 1.012&quot;), and live content from
        Brulosophy, BYO, HomebrewTalk, and BJCP. You can also <strong>attach a beer photo</strong> for feedback.</p>
      <h2>Limits</h2>
      <p>Up to <strong>10 questions per hour</strong>. <strong>No account link is required</strong> to ask.</p>
      <p><em>Example:</em> <code>@WCB Bot what&apos;s the difference between American and English IPA?</code></p>
    </GuidePage>
  )
}
