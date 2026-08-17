// src/app/members/resources/grain-buys/page.tsx
import { GuidePage } from '@/components/members/guide/GuideChrome'

export default function Page() {
  return (
    <GuidePage title="Buy grain in bulk" dest="discord">
      <p>The club runs bulk grain buys <strong>2–4 times a year</strong>, coordinated by an officer.</p>
      <h2>Check the active buy</h2>
      <p>In Discord, run <strong>/grainbuy</strong> (no arguments) to see the coordinator, order deadline,
        delivery date, pickup location, running totals, a link to the order Google Sheet, and a
        &quot;📋 Browse Products&quot; button showing the live Epiphany Craft Malt catalog (price per 55 lb bag
        and SRM). No account link is required to use <strong>/grainbuy</strong>.</p>
      <h2>Ordering</h2>
      <p>You order in the <strong>Google Sheet</strong>, not in Discord: on the &quot;Order Form&quot; tab, enter
        your first/last name, email, grain type, and quantity (1–10 bags) — price and total auto-fill.</p>
      <h2>Paying</h2>
      <p>Pay via PayPal or Venmo, and <strong>you must include &quot;WCB - Grain Buy&quot;</strong> in the
        payment note — that&apos;s how your payment auto-tracks to your order. Orders placed after the
        deadline get flagged as late.</p>
      <h2>Reminders & pickup</h2>
      <p>The bot posts an announcement to <strong>#grain-buy</strong> when a buy opens, then sends
        <strong> 3-day and 1-day</strong> deadline reminders. Pickup location is shown in the buy details —
        the Epiphany order picks up where noted, and CMC Pilsner pickup is at Bond Brothers, Cary NC.</p>
    </GuidePage>
  )
}
