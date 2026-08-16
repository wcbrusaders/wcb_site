import Link from "next/link";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <div className="text-foreground/75 text-[15px] leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

/**
 * The full ratified Code of Conduct body — single source of truth, rendered by
 * both /code-of-conduct and the /join captive gate. Edit the policy text HERE only.
 */
export function CodeOfConductBody() {
  return (
    <>
      <Section title="Our commitment">
        <p>
          The Wake County Brusaders exist to make, share, and enjoy good beer together. We are committed to keeping this a
          welcoming, respectful, and safe community for everyone, online and in person, and free from harassment and
          discrimination of any kind.
        </p>
        <p>
          The plain-language version: don&apos;t be a jerk. Everything below is that, spelled out, so nobody has to guess
          where the line is.
        </p>
      </Section>

      <Section title="Who and where this applies">
        <p>
          This Code applies to every member, guest, and leader, both online and in person. That includes the Discord and
          our official social accounts; meetings, brew days, competitions, festivals, and social gatherings; and the way
          members treat one another in direct messages and conversations that come out of the club. It applies before,
          during, and after club events.
        </p>
        <p>
          It governs conduct toward members, not the venue. Two people who both want to discuss an off-topic subject
          privately are free to. Using a private message to harass, threaten, or demean a fellow member is a violation,
          the same as doing it in a channel or to their face. What matters is that a member was mistreated, not where it
          happened.
        </p>
      </Section>

      <Section title="What we expect of each other">
        <p>In every club space and at every club event:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Treat people with respect and good faith, including when you disagree.</li>
          <li>Ask whether someone wants honest feedback before you give it, keep it gracious both ways, and critique the beer, not the person.</li>
          <li>Make room for newcomers and for people whose backgrounds, identities, and beliefs differ from your own.</li>
          <li>If someone asks you to stop a behavior, stop immediately and without argument.</li>
          <li>Bring concerns about the club, an event, or a leader in good faith — through the Ombudsman or a board member — rather than working members privately against one another. Disagreement is welcome and expected; sabotage is not.</li>
          <li>Drink responsibly, look out for one another, and help anyone who has had too much get home safely.</li>
          <li>Keep club channels focused on beer, brewing, and the community around it.</li>
        </ul>
      </Section>

      <Section title="Conduct we do not allow">
        <p>
          Harassment is any unwelcome conduct — verbal, written, physical, or visual — that intimidates, demeans,
          humiliates, or creates a hostile environment for another person. It is not allowed in any club space or at any
          club event. Harassment includes, but is not limited to:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Demeaning, hateful, or discriminatory comments, slurs, or content directed at a person or group based on race, national origin, religion, sex, sexual orientation, gender identity or expression, age, disability, medical condition, body size, or veteran status.</li>
          <li>Threats, intimidation, or incitement of violence.</li>
          <li>Stalking, following, or unwanted persistent contact, online or in person.</li>
          <li>Photographing or recording someone over their objection, or in order to harass them.</li>
          <li>Deliberate intimidation, sustained disruption of events or discussions, or ganging up on a member.</li>
          <li>Bullying, or using a leadership, judging, or organizing role to pressure, favor, or retaliate against members.</li>
          <li>Publishing a member&apos;s private information without their consent.</li>
        </ul>
      </Section>

      <Section title="Sexual harassment">
        <p>
          Sexual harassment is specifically prohibited. It includes unwelcome sexual attention or advances, requests for
          sexual favors, sexualized comments or jokes, displaying sexually explicit material, and any non-consensual
          physical contact. No one may condition club opportunities, recognition, or goodwill on a romantic or sexual
          response. If your attention is unwelcome and you are asked to stop, stop immediately.
        </p>
      </Section>

      <Section title="Divisive off-topic content">
        <p>
          Politics, religion, and comparable hot-button topics do not belong in club channels or at club events. Keep
          them to private conversations with people who welcome them. A simple test: if it would start a fight at
          Thanksgiving dinner, it does not belong here. One point is not up for debate: protecting members from being
          demeaned is not the club taking a political side. We are neutral on partisan and religious argument. We are
          not neutral on whether our own members deserve respect.
        </p>
      </Section>

      <Section title="Retaliation">
        <p>
          Retaliating against anyone who reports a concern, supports a report, or takes part in handling one is itself a
          violation, regardless of how the original concern turns out.
        </p>
        <p>
          Retaliation also includes campaigns to damage a member&apos;s standing in response to their good-faith
          participation in the club&apos;s rules or reporting process — for example, turning members against someone, or
          drawing in their family or people outside the club, because they raised or acted on a concern.
        </p>
      </Section>

      <Section title="Impact, not intent">
        <p>
          Conduct is judged by its effect, not only by what was intended. You can mean something as a joke, or aim it at
          someone who does not personally mind, and it can still cross the line if others reasonably find it demeaning
          or unwelcome. Good intentions do not excuse harm. When in doubt, don&apos;t.
        </p>
      </Section>

      <Section title="Alcohol and safety">
        <p>
          We are a brewing club, and alcohol is part of what we do, which makes handling it responsibly part of this
          Code:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Never serve or provide alcohol to anyone under 21. Members are responsible for ensuring minors in their care do not obtain alcohol.</li>
          <li>Do not pressure anyone to drink, and never treat someone&apos;s choice not to drink as a problem.</li>
          <li>Do not drive impaired. Look out for members who have had too much, and help arrange a safe ride home.</li>
          <li>At events, watch out for anyone who is vulnerable or in trouble.</li>
          <li>Leaders may wind down service or ask an intoxicated member to step away, in order to keep everyone safe.</li>
        </ul>
      </Section>

      <Section title="Reporting a problem">
        <p>
          If something crosses a line, tell us. You do not have to be the target, and you do not have to be certain.
        </p>
        <p>
          Start with the Ombudsman, so no one has to wonder who to approach. Who currently holds the role, and how to
          reach them, is listed with the{" "}
          <Link href="/board" className="text-accent hover:underline">board</Link> on our website. The role exists so
          anyone has a safe person to reach, especially members who would not feel comfortable going to club leadership
          directly. If you would rather not go to the Ombudsman, or your concern is about them, you can bring it to any
          board member instead.
        </p>
        <p>
          The Ombudsman works independently of the Board and takes reports in confidence. They do not decide anything
          alone; any action is a leadership decision, and every removal requires a Board vote. Anyone who is the subject
          of a report, or close to them, steps out of handling it, so a concern about any leader, the President
          included, is still dealt with fairly.
        </p>
        <p>
          The Ombudsman may also serve as a board member. When they take in a report, they act as a neutral intake and
          step out of the Board&apos;s decision on that matter, so the two roles never overlap in a single case. If a
          concern is about the Ombudsman, or someone they are close to, it goes to any other board member instead.
        </p>
        <p>
          <strong>We act on a clock.</strong> The Ombudsman acknowledges a report within 48 hours. Leadership reaches a
          decision within 7 days of a report being raised. These are commitments to both sides: the person who reported
          is not left wondering, and the person a report is about is not left in limbo.
        </p>
        <p>
          In an emergency, or if someone is in immediate danger at an event, safety comes first: get a club leader,
          event staff, or venue security, and contact local authorities if needed.
        </p>
        <p>
          Reports are handled promptly and kept as private as possible, and no one is retaliated against for raising a
          concern in good faith.
        </p>
      </Section>

      <Section title="How we handle violations">
        <p>
          We aim for the lightest response that resolves the problem. Most issues never become a strike. Formal strikes
          are tracked so escalation is fair and no one is surprised — anyone who reaches a strike is told privately what
          happened and where it stands.
        </p>

        <table className="w-full text-sm border border-border/50 rounded-lg overflow-hidden">
          <thead className="bg-card-bg/50 text-left">
            <tr><th className="p-3">Step</th><th className="p-3">What it is</th><th className="p-3">What happens</th></tr>
          </thead>
          <tbody>
            <tr className="border-t border-border/40"><td className="p-3 font-medium">Correction <span className="text-foreground/40">(not a strike)</span></td><td className="p-3">A one-off slip; off-topic or unwelcome behavior</td><td className="p-3">A private word about what crossed the line. Usually that&apos;s the end of it.</td></tr>
            <tr className="border-t border-border/40"><td className="p-3 font-medium">Strike 1 — Warning</td><td className="p-3">A clear violation, or a repeat after a Correction</td><td className="p-3">A formal warning, told privately and logged (date and what happened), sometimes with a defined cool-off period.</td></tr>
            <tr className="border-t border-border/40"><td className="p-3 font-medium">Strike 2 — Board decides</td><td className="p-3">A further violation after a warning</td><td className="p-3">The Board convenes and decides, based on severity: a time-limited suspension, or removal (by two-thirds vote). A member suspended here who violates again is removed.</td></tr>
          </tbody>
        </table>

        <p>
          <strong>Who issues a strike.</strong> Any board member may issue a Correction or a Strike 1 (Warning). A
          Strike 2 brings the Board together to decide: a suspension requires two board members to agree, and a removal
          requires a vote of the full Board, with at least two-thirds of eligible (non-recused) members in favor. No
          single person, the President included, can suspend or remove a member alone — escalating consequences require
          escalating agreement.
        </p>
        <p>
          <strong>Strikes reset.</strong> A strike ages off after 12 months with no further violations. The Board may
          note prior history when weighing a new matter, but a cleared strike no longer counts toward escalation.
        </p>
        <p>
          <strong>Board fast-track.</strong> The ladder is the default, not a shield. A single violation serious enough
          to make the community unsafe — threats, harassment, or conduct that endangers members — can result in
          immediate suspension or removal by Board vote, skipping the strike count entirely. Leadership may also take a
          gentler path when that better serves the club.
        </p>
        <p>
          <strong>Emergency interim measure.</strong> When something serious is actively happening, any board member
          may immediately restrict a member&apos;s access to keep people safe — pausing their Discord, Drive, calendar,
          and members-area access until a decision is reached. Whoever does this must notify the whole Board at once,
          and the 7-day decision clock starts immediately, so an interim freeze cannot quietly become an indefinite ban.
          The Board confirms, adjusts, or lifts the measure as part of its decision.
        </p>
        <p>
          <strong>Conflicts of interest.</strong> Anyone who is the subject of a report, or personally close to the
          subject, takes no part in reviewing or deciding it, and is not counted toward the vote. The matter is handled
          by the rest of the Board.
        </p>
        <p>
          <strong>Records.</strong> Strikes and their outcomes are recorded and held in confidence by the Board and the
          Ombudsman. They are used only to handle conduct fairly and consistently. Expired strikes are marked as
          cleared.
        </p>
        <p>
          <strong>Appeals.</strong> Anyone who is warned, suspended, or removed may ask the Board to review the decision
          — including whether a strike should still count. All removals are decided by a vote of the WCB Board.
        </p>
      </Section>

      <Section title="Guests and non-members">
        <p>
          Guests are welcome, and this Code applies to them too. Because the strike ladder is for members, we handle
          guest conduct directly: a serious violation means immediate removal from the space — physical or digital —
          and no longer being welcome at club events. A minor issue is handled with a private word, the same as it
          would be for a member.
        </p>
      </Section>

      <Section title="Everyone is accountable">
        <p>
          Two things should be true for every member, especially newcomers: you belong here as you are and will not be
          pushed out for being different, and you know exactly where the limits are. These rules apply the same to
          everyone, regardless of who they are, how long they have been in the club, or what role they hold. We address
          the behavior, not the person.
        </p>
      </Section>

      <Section title="Adoption">
        <p>
          This is a living document. Leadership reviews it at least once a year and after any significant incident.
          Changes follow the same process by which it was adopted. It is published on our website, and every new
          member must read and acknowledge it before joining — they confirm they have read and agree to it as part of
          signing up and paying dues.
        </p>
      </Section>
    </>
  );
}
