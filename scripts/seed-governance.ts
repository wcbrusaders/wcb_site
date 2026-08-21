// Idempotent seed for the two governance Articles (bylaws, code-of-conduct).
// Content is transcribed faithfully from the existing rendered components
// (src/components/governance/BylawsBody.tsx and src/components/CodeOfConductBody.tsx)
// — the same prose members see today — into semantic HTML, then sanitized
// with the same allowlist notes use before being stored.
//
// Run: npx tsx scripts/seed-governance.ts
// Safe to re-run: upserts on the unique `slug`.

import { PrismaClient } from '@prisma/client'
import { pathToFileURL } from 'node:url'
import { sanitizeArticleHtml } from '../src/lib/knowledge/extract-notes'

const prisma = new PrismaClient()

const BYLAWS_HTML = `
<p>The legal entity is <strong>Holly Springs Brüsaders</strong>, a North Carolina corporation. The club operates publicly as <strong>Wake County Brusaders</strong>. Both names refer to the same organization.</p>

<h2>Article One — Name of Organization</h2>
<p>The legal name of this organization is <strong>Holly Springs Brüsaders</strong>, a North Carolina corporation (hereinafter "the club"). The club operates publicly as <strong>Wake County Brusaders</strong> ("WCB"), a trade name adopted as the club grew beyond Holly Springs. Both names refer to the same organization; references to "HSB," "WCB," "Brusaders," or "the club" in these bylaws mean this single entity.</p>

<h2>Article Two — Purpose and Goals</h2>
<p>The club is organized exclusively for social and recreational purposes within the meaning of Section 501(c)(7) of the Internal Revenue Code. Its primary purpose is to enjoy and promote the hobby of homebrewing — the club's founding craft — and to welcome and support the broader craft of fermentation in all its forms, whether beverage, food, or otherwise. The club provides members a comfortable community centered on that shared craft and on friendship, insulated from outside pressure. The club pursues the following goals:</p>
<ul>
<li>Enhancing knowledge about beer, beer tasting, beer judging, and brewing techniques through shared experiences.</li>
<li>Advocating for the hobby and enjoyment of homebrewing.</li>
<li>Welcoming anyone with a genuine interest in fermentation — beer, cider, mead, wine, kombucha, cheese, bread, hot sauce, and beyond — and helping them pursue that interest.</li>
<li>Fostering a brewers' and fermenters' community through social activities.</li>
<li>Championing the responsible consumption of alcoholic beverages.</li>
<li>Fostering a comfortable, pressure-free environment where every member belongs — insulated from external conflict, centered on friendship and the craft.</li>
</ul>

<h2>Article Three — Membership</h2>
<p><strong>Eligibility.</strong> All individuals of legal drinking age in North Carolina are eligible for membership. Membership is open to anyone with an interest in fermentation of any kind — you need not be a homebrewer. Brewers, and anyone curious about fermented food or drink, are equally welcome.</p>
<p><strong>Admission.</strong> Membership is granted upon application and payment of dues.</p>
<p><strong>Term.</strong> Membership runs for twelve (12) months from the date of payment and is renewed by paying the following year's dues.</p>
<p><strong>Dues &amp; tiers.</strong> The club has a single membership standing — <strong>Brusader</strong> — offered at two rates:</p>
<ul>
<li><strong>Individual — $40/year:</strong> one named member with full voting rights.</li>
<li><strong>Dual — $65/year:</strong> two named members (e.g., a couple or brewing partners), each with full voting rights (two votes).</li>
</ul>
<p>Dues amounts are set by the Board of Officers; the rates above are current as of ratification.</p>
<p><strong>Rights.</strong> Each paid member has full voting rights on club matters. No member is personally liable for the club's debts or obligations. No member receives compensation for services, though approved expenses may be reimbursed.</p>
<p><strong>Honorary &amp; sponsor memberships.</strong> The Board of Officers may grant honorary or sponsor memberships for durations it determines. These members enjoy all membership benefits except voting rights and Board membership.</p>
<p><strong>Guests &amp; family.</strong> Members may bring guests to club meetings and events. Family of a paid member is welcome at meetings and events without a separate membership.</p>
<p><strong>Non-discrimination &amp; conduct.</strong> Membership is open to all eligible individuals without discrimination. The club is committed to a welcoming, respectful, and safe community — online and in person — free from harassment and discrimination of any kind. All members agree to and are bound by the club's Code of Conduct (see Article Eleven), which governs conduct, protected characteristics, and enforcement.</p>

<h2>Article Four — Meetings</h2>
<p><strong>Regular meetings.</strong> The club meets monthly, on the third Thursday, rotating between members' home breweries and local production breweries. The Board confirms each meeting's exact location in advance. A typical meeting includes a workshop, a technique nugget, and a style guide segment, and always includes homebrew sharing.</p>
<p><strong>Board meetings.</strong> The Board of Officers meets monthly, typically about one week before the regular club meeting, to align on initiatives, plan meeting content, and address club matters. Board meetings are closed (board members only) so that initiatives and sensitive matters — including member-wellbeing and conduct concerns under the Code of Conduct — can be discussed candidly; outcomes and decisions are shared with the membership as appropriate. The Board may invite a member or coordinator to a meeting for a specific topic. Board meetings may be held in person or virtually.</p>
<p><strong>No annual meeting required.</strong> The club does not hold a separate annual membership meeting; regular monthly meetings, digital voting (Article Six), and the Board's quarterly financial review (Article Twelve) cover club business.</p>
<p><strong>Special meetings.</strong> The President may call a special meeting when in the club's best interest. On written request of two Board members or ten general members, the President must call one. Members receive at least five days' notice stating the purpose and agenda; only noticed business is conducted unless all present unanimously agree otherwise.</p>
<p><strong>Notices.</strong> Meeting and vote notices may be given by email, the club newsletter, the club website, Discord, or other channels the Board deems appropriate.</p>
<p><strong>Voting quorum (digital).</strong> Because club voting is conducted digitally (Article Six) so every member can participate regardless of attendance, quorum is measured by participation, not physical presence. A vote is valid when it remains open for at least 72 hours, and at least 25% of eligible members cast a ballot within that window. Votes that fail to reach 25% participation do not carry and may be re-run. (Amendments, dissolution, and officer-removal votes are governed by their own higher thresholds and windows in Articles Eight, Ten, and Five.)</p>
<p><strong>Meeting conduct.</strong> Meetings cover old business, new business, coordinator reports, and officer reports. An officer or delegated member records decisions.</p>

<h2>Article Five — Board of Officers &amp; Coordinators</h2>
<p><strong>Governance.</strong> The club is governed by a Board of Officers. The Board directs the club's affairs, sets policy, approves the budget, and is collectively responsible for the club's operation and wellbeing.</p>
<p><strong>Core functions.</strong> The Board ensures these functions are always covered — by one officer each or combined among officers as the Board sees fit:</p>
<ul>
<li><strong>Leadership (President)</strong> — chief executive responsibility: final decisions on budget and priorities, legal compliance, securing venues, and acting as a signatory on the club's accounts.</li>
<li><strong>Finance</strong> — club finances, second account signatory, expenditure approval, financial reports, membership list.</li>
<li><strong>Records</strong> — communications, meeting minutes, member notifications, recordkeeping.</li>
<li><strong>Member wellbeing / Ombudsman</strong> — receiving and handling conduct concerns in confidence per the Code of Conduct (Article Eleven).</li>
</ul>
<p><strong>Additional officers.</strong> The Board may establish and fill additional officer roles as needs require — currently including Events, Logistics, and Technical officers — and define their duties. An Emeritus officer is a past officer who retains a full, standing seat on the Board (with vote) in an advisory capacity, without active operational duties.</p>
<p><strong>Coordinators.</strong> The Board may appoint Coordinators who are accountable for a specific ongoing function and report to the Board — currently including workshops, technique nuggets, style guide, events-external, and brewday captain — and may create, assign, or retire coordinator roles at any time. Coordinators are not voting members of the Board by virtue of the coordinator role. A person may serve as both an officer and a coordinator.</p>
<p><strong>Assignment of duties.</strong> The Board assigns and may reassign titles and responsibilities among its members; a single officer may cover more than one function (e.g., serving as both President and Technical Officer).</p>
<p><strong>Voting.</strong> All officers — including additional and emeritus officers — have equal voting rights on the Board.</p>
<p><strong>Terms.</strong> Officers serve at will — indefinitely, until they resign or are removed under this Article. There is no fixed term or mandatory annual election. The Board may, by resolution, adopt fixed terms and an election schedule in the future without amending these bylaws.</p>
<p><strong>Selection &amp; vacancies.</strong> New officers are selected by the Board. If an officer resigns or is removed, the Board selects a replacement. If the President function becomes vacant, the Board designates an acting lead until it fills the role.</p>
<p><strong>Removal.</strong> An officer may be removed by a two-thirds vote of the other officers, with a quorum of at least three, consistent with the club's enforcement safeguards. Conduct-based removals follow the Code of Conduct enforcement process (Article Eleven).</p>

<h2>Article Six — Voting</h2>
<p><strong>Digital voting.</strong> Club votes are conducted primarily through a digital polling platform so that every eligible member can participate regardless of physical presence. A vote's validity (window and participation quorum) is governed by Article Four.</p>
<p><strong>How matters reach a vote.</strong> The Board may put any matter to a member vote. Any member may petition an officer to bring a specific issue to a vote; officers will bring forward good-faith requests.</p>
<p><strong>Expenditure approval.</strong> The Board of Officers manages the club's routine and operational spending at its discretion, consistent with the approved budget and its duty of financial oversight (Article Twelve). Any single expenditure over $500 requires approval by a full membership vote.</p>
<p><em>(Officer selection is governed by Article Five; there is no membership election of officers.)</em></p>

<h2>Article Seven — Dues</h2>
<p>Dues are set by the Board of Officers and are paid annually. The current rates — $40/year individual and $65/year dual — are stated in Article Three (Membership). The Board may adjust dues amounts; material changes will be communicated to the membership in advance through the club's channels. Dues are paid per member on a rolling twelve-month basis from the date of payment.</p>

<h2>Article Eight — Amendments</h2>
<p>Any member may petition for an amendment by submitting it to the Board digitally or in writing. Proposed changes are communicated to all members through the club's channels. A 30-day notice period follows, for members to review and discuss. After the notice period, a digital vote is held; an amendment passes on a two-thirds vote of the ballots cast, provided the vote meets the participation quorum (at least 25% of eligible members; Article Four). This process also governs amendments to the Articles of Incorporation, as referenced therein.</p>

<h2>Article Nine — Indemnification</h2>
<p>All officers of the club shall be indemnified by the club against all expenses and liabilities, including counsel fees, reasonably incurred or imposed upon such officers in connection with any threatened, pending, or completed action, suit, or proceeding to which the officer may become involved by reason of being or having been an officer of the club, or any settlement thereof, unless adjudged therein to be liable for gross negligence or misconduct in the performance of duties. In the event of a settlement, indemnification applies only when the Board of Officers approves the settlement and reimbursement as being in the best interest of the club.</p>

<h2>Article Ten — Dissolution</h2>
<p>The dissolution of the club can only be proposed if 80% of the club's paid members, including the Board of Officers, vote in favor of dissolution. Upon dissolution, any remaining assets should be donated to a non-profit organization or charity as decided by the majority of the members.</p>

<h2>Article Eleven — Code of Conduct</h2>
<p>All members, officers, and coordinators are bound by the club's Code of Conduct, ratified August 15, 2026, as amended from time to time. The Code of Conduct is the club's authoritative statement of expected behavior and governs, among other things: respectful and good-faith conduct; the prohibition of harassment and discrimination; reporting of concerns through the Ombudsman or any Board member; the strike ladder (Correction → Warning → Board decides); and the enforcement and removal process, including interim suspension and the Board safeguards (quorum and two-thirds vote) that protect against misuse. Officer discipline and removal follow this same process (see Article Five). The Code of Conduct is maintained separately and may be amended through its own process; the current text is published on the club website.</p>

<h2>Article Twelve — Financial Oversight</h2>
<p>The Board of Officers shall conduct a quarterly review of the club's financials by performing an audit. This ensures transparency, accountability, and the financial health of the club.</p>

<h2>Article Thirteen — Conflict Resolution</h2>
<p>In the event of general disagreements among members: both parties should first attempt to resolve the issue amicably through open dialogue; if unresolved, the matter is brought to the Board, which mediates and provides a resolution; if necessary, a neutral third-party mediator may be brought in. Concerns involving harassment, discrimination, or other Code-of-Conduct violations go through the Code of Conduct's Ombudsman and enforcement process (Article Eleven), not this article.</p>

<h2>Article Fourteen — Membership Termination</h2>
<p><strong>Voluntary.</strong> A member may end their membership at any time by notifying the Board digitally or in writing. Membership otherwise lapses automatically at the end of its twelve-month term if dues are not renewed.</p>
<p><strong>Refunds.</strong> Annual dues are non-refundable. A member who leaves before their term ends is not owed a refund; their membership simply lapses at its expiry.</p>
<p><strong>Involuntary.</strong> A membership may be terminated for cause under the Code of Conduct enforcement process (Article Eleven), including its Board safeguards.</p>
`

const CODE_OF_CONDUCT_HTML = `
<h2>Our commitment</h2>
<p>The Wake County Brusaders exist to make, share, and enjoy good beer together. We are committed to keeping this a welcoming, respectful, and safe community for everyone, online and in person, and free from harassment and discrimination of any kind.</p>
<p>The plain-language version: don't be a jerk. Everything below is that, spelled out, so nobody has to guess where the line is.</p>

<h2>Who and where this applies</h2>
<p>This Code applies to every member, guest, and leader, both online and in person. That includes the Discord and our official social accounts; meetings, brew days, competitions, festivals, and social gatherings; and the way members treat one another in direct messages and conversations that come out of the club. It applies before, during, and after club events.</p>
<p>It governs conduct toward members, not the venue. Two people who both want to discuss an off-topic subject privately are free to. Using a private message to harass, threaten, or demean a fellow member is a violation, the same as doing it in a channel or to their face. What matters is that a member was mistreated, not where it happened.</p>

<h2>What we expect of each other</h2>
<p>In every club space and at every club event:</p>
<ul>
<li>Treat people with respect and good faith, including when you disagree.</li>
<li>Ask whether someone wants honest feedback before you give it, keep it gracious both ways, and critique the beer, not the person.</li>
<li>Make room for newcomers and for people whose backgrounds, identities, and beliefs differ from your own.</li>
<li>If someone asks you to stop a behavior, stop immediately and without argument.</li>
<li>Bring concerns about the club, an event, or a leader in good faith — through the Ombudsman or a board member — rather than working members privately against one another. Disagreement is welcome and expected; sabotage is not.</li>
<li>Drink responsibly, look out for one another, and help anyone who has had too much get home safely.</li>
<li>Keep club channels focused on beer, brewing, and the community around it.</li>
</ul>

<h2>Conduct we do not allow</h2>
<p>Harassment is any unwelcome conduct — verbal, written, physical, or visual — that intimidates, demeans, humiliates, or creates a hostile environment for another person. It is not allowed in any club space or at any club event. Harassment includes, but is not limited to:</p>
<ul>
<li>Demeaning, hateful, or discriminatory comments, slurs, or content directed at a person or group based on race, national origin, religion, sex, sexual orientation, gender identity or expression, age, disability, medical condition, body size, or veteran status.</li>
<li>Threats, intimidation, or incitement of violence.</li>
<li>Stalking, following, or unwanted persistent contact, online or in person.</li>
<li>Photographing or recording someone over their objection, or in order to harass them.</li>
<li>Deliberate intimidation, sustained disruption of events or discussions, or ganging up on a member.</li>
<li>Bullying, or using a leadership, judging, or organizing role to pressure, favor, or retaliate against members.</li>
<li>Publishing a member's private information without their consent.</li>
</ul>

<h2>Sexual harassment</h2>
<p>Sexual harassment is specifically prohibited. It includes unwelcome sexual attention or advances, requests for sexual favors, sexualized comments or jokes, displaying sexually explicit material, and any non-consensual physical contact. No one may condition club opportunities, recognition, or goodwill on a romantic or sexual response. If your attention is unwelcome and you are asked to stop, stop immediately.</p>

<h2>Divisive off-topic content</h2>
<p>Politics, religion, and comparable hot-button topics do not belong in club channels or at club events. Keep them to private conversations with people who welcome them. A simple test: if it would start a fight at Thanksgiving dinner, it does not belong here. One point is not up for debate: protecting members from being demeaned is not the club taking a political side. We are neutral on partisan and religious argument. We are not neutral on whether our own members deserve respect.</p>

<h2>Retaliation</h2>
<p>Retaliating against anyone who reports a concern, supports a report, or takes part in handling one is itself a violation, regardless of how the original concern turns out.</p>
<p>Retaliation also includes campaigns to damage a member's standing in response to their good-faith participation in the club's rules or reporting process — for example, turning members against someone, or drawing in their family or people outside the club, because they raised or acted on a concern.</p>

<h2>Impact, not intent</h2>
<p>Conduct is judged by its effect, not only by what was intended. You can mean something as a joke, or aim it at someone who does not personally mind, and it can still cross the line if others reasonably find it demeaning or unwelcome. Good intentions do not excuse harm. When in doubt, don't.</p>

<h2>Alcohol and safety</h2>
<p>We are a brewing club, and alcohol is part of what we do, which makes handling it responsibly part of this Code:</p>
<ul>
<li>Never serve or provide alcohol to anyone under 21. Members are responsible for ensuring minors in their care do not obtain alcohol.</li>
<li>Do not pressure anyone to drink, and never treat someone's choice not to drink as a problem.</li>
<li>Do not drive impaired. Look out for members who have had too much, and help arrange a safe ride home.</li>
<li>At events, watch out for anyone who is vulnerable or in trouble.</li>
<li>Leaders may wind down service or ask an intoxicated member to step away, in order to keep everyone safe.</li>
</ul>

<h2>Reporting a problem</h2>
<p>If something crosses a line, tell us. You do not have to be the target, and you do not have to be certain.</p>
<p>Start with the Ombudsman, so no one has to wonder who to approach. Who currently holds the role, and how to reach them, is listed with the <a href="/board">board</a> on our website. The role exists so anyone has a safe person to reach, especially members who would not feel comfortable going to club leadership directly. If you would rather not go to the Ombudsman, or your concern is about them, you can bring it to any board member instead.</p>
<p>The Ombudsman works independently of the Board and takes reports in confidence. They do not decide anything alone; any action is a leadership decision, and every removal requires a Board vote. Anyone who is the subject of a report, or close to them, steps out of handling it, so a concern about any leader, the President included, is still dealt with fairly.</p>
<p>The Ombudsman may also serve as a board member. When they take in a report, they act as a neutral intake and step out of the Board's decision on that matter, so the two roles never overlap in a single case. If a concern is about the Ombudsman, or someone they are close to, it goes to any other board member instead.</p>
<p><strong>We act on a clock.</strong> The Ombudsman acknowledges a report within 48 hours. Leadership reaches a decision within 7 days of a report being raised. These are commitments to both sides: the person who reported is not left wondering, and the person a report is about is not left in limbo.</p>
<p>In an emergency, or if someone is in immediate danger at an event, safety comes first: get a club leader, event staff, or venue security, and contact local authorities if needed.</p>
<p>Reports are handled promptly and kept as private as possible, and no one is retaliated against for raising a concern in good faith.</p>

<h2>How we handle violations</h2>
<p>We aim for the lightest response that resolves the problem. Most issues never become a strike. Formal strikes are tracked so escalation is fair and no one is surprised — anyone who reaches a strike is told privately what happened and where it stands.</p>
<p><strong>Correction (not a strike)</strong> — a one-off slip; off-topic or unwelcome behavior. A private word about what crossed the line. Usually that's the end of it.</p>
<p><strong>Strike 1 — Warning</strong> — a clear violation, or a repeat after a Correction. A formal warning, told privately and logged (date and what happened), sometimes with a defined cool-off period.</p>
<p><strong>Strike 2 — Board decides</strong> — a further violation after a warning. The Board convenes and decides, based on severity: a time-limited suspension, or removal (by two-thirds vote). A member suspended here who violates again is removed.</p>
<p><strong>Who issues a strike.</strong> Any board member may issue a Correction or a Strike 1 (Warning). A Strike 2 brings the Board together to decide: a suspension requires two board members to agree, and a removal requires a vote of the full Board, with at least two-thirds of eligible (non-recused) members in favor. No single person, the President included, can suspend or remove a member alone — escalating consequences require escalating agreement.</p>
<p><strong>Strikes reset.</strong> A strike ages off after 12 months with no further violations. The Board may note prior history when weighing a new matter, but a cleared strike no longer counts toward escalation.</p>
<p><strong>Board fast-track.</strong> The ladder is the default, not a shield. A single violation serious enough to make the community unsafe — threats, harassment, or conduct that endangers members — can result in immediate suspension or removal by Board vote, skipping the strike count entirely. Leadership may also take a gentler path when that better serves the club.</p>
<p><strong>Emergency interim measure.</strong> When something serious is actively happening, any board member may immediately restrict a member's access to keep people safe — pausing their Discord, Drive, calendar, and members-area access until a decision is reached. Whoever does this must notify the whole Board at once, and the 7-day decision clock starts immediately, so an interim freeze cannot quietly become an indefinite ban. The Board confirms, adjusts, or lifts the measure as part of its decision.</p>
<p><strong>Conflicts of interest.</strong> Anyone who is the subject of a report, or personally close to the subject, takes no part in reviewing or deciding it, and is not counted toward the vote. The matter is handled by the rest of the Board.</p>
<p><strong>Records.</strong> Strikes and their outcomes are recorded and held in confidence by the Board and the Ombudsman. They are used only to handle conduct fairly and consistently. Expired strikes are marked as cleared.</p>
<p><strong>Appeals.</strong> Anyone who is warned, suspended, or removed may ask the Board to review the decision — including whether a strike should still count. All removals are decided by a vote of the WCB Board.</p>

<h2>Guests and non-members</h2>
<p>Guests are welcome, and this Code applies to them too. Because the strike ladder is for members, we handle guest conduct directly: a serious violation means immediate removal from the space — physical or digital — and no longer being welcome at club events. A minor issue is handled with a private word, the same as it would be for a member.</p>

<h2>Everyone is accountable</h2>
<p>Two things should be true for every member, especially newcomers: you belong here as you are and will not be pushed out for being different, and you know exactly where the limits are. These rules apply the same to everyone, regardless of who they are, how long they have been in the club, or what role they hold. We address the behavior, not the person.</p>

<h2>Adoption</h2>
<p>This is a living document. Leadership reviews it at least once a year and after any significant incident. Changes follow the same process by which it was adopted. It is published on our website, and every new member must read and acknowledge it before joining — they confirm they have read and agree to it as part of signing up and paying dues.</p>
`

export const GOVERNANCE_ARTICLES = [
  {
    slug: 'bylaws',
    category: 'bylaws',
    title: 'Bylaws',
    excerpt: 'The WCB (Holly Springs Brüsaders) governing bylaws — membership, meetings, the Board, voting, dues, and amendments.',
    html: BYLAWS_HTML,
  },
  {
    slug: 'code-of-conduct',
    category: 'code-of-conduct',
    title: 'Code of Conduct',
    excerpt: 'The WCB Code of Conduct — expected behavior, harassment policy, reporting, and the enforcement strike ladder.',
    html: CODE_OF_CONDUCT_HTML,
  },
] as const

async function main() {
  for (const gov of GOVERNANCE_ARTICLES) {
    const bodyHtml = sanitizeArticleHtml(gov.html)
    await prisma.article.upsert({
      where: { slug: gov.slug },
      create: {
        slug: gov.slug,
        kind: 'governance',
        category: gov.category,
        title: gov.title,
        excerpt: gov.excerpt,
        bodyHtml,
      },
      update: {
        kind: 'governance',
        category: gov.category,
        title: gov.title,
        excerpt: gov.excerpt,
        bodyHtml,
      },
    })
    console.log(`upserted governance article: ${gov.slug}`)
  }
  await prisma.$disconnect()
}

// run only when invoked directly, not when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
