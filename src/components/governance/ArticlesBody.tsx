function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <div className="text-foreground/75 text-[15px] leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

/**
 * The full Articles of Incorporation body — single source of truth, transcribed faithfully from
 * docs/governance/articles-of-incorporation.md. Edit the legal text HERE only, keeping it in sync
 * with the source (and with the filed original, which remains the controlling legal document).
 */
export function ArticlesBody() {
  return (
    <>
      <p className="text-foreground/75 text-[15px] leading-relaxed">
        Legal founding document of the incorporated entity (<strong>Holly Springs Brüsaders</strong>), which operates
        publicly as <strong>Wake County Brusaders</strong>. This document is current as filed; the WCB name is a
        trade name / DBA and does not change the incorporated entity.
      </p>

      <Section title="Article I — Name">
        <p>The name of this corporation shall be Holly Springs Brüsaders, hereinafter referred to as HSB.</p>
      </Section>

      <Section title="Article II — Purpose">
        <p>
          The purpose of HSB is to enjoy and promote the hobby of homebrewing, engage in activities focused on
          homebrewing as a common foundation, and foster a community of brewers through social activities,
          education, and responsible enjoyment of alcoholic beverages.
        </p>
      </Section>

      <Section title="Article III — Duration">
        <p>The duration of the corporate existence shall be perpetual.</p>
      </Section>

      <Section title="Article IV — Membership">
        <p>
          HSB is open to all individuals of legal drinking age in the State of North Carolina. Membership shall not
          be denied based on race, color, creed, national origin, sex, gender identity, sexual orientation, age,
          disability, religion, marital status, or any other characteristic protected by law.
        </p>
      </Section>

      <Section title="Article V — Board of Directors">
        <p>The initial board of directors shall consist of three members:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Jordan D LaFontaine — President and Co-Founder</li>
          <li>Brandon Kelly — Co-Founder</li>
          <li>Evan Lawrence — Co-Founder</li>
        </ul>
      </Section>

      <Section title="Article VI — Registered Office and Agent">
        <p>
          The corporation&apos;s initial registered office and agent will be determined by the board of directors
          and updated as necessary. Registered agent of record:
        </p>
        <p>Northwest Registered Agent Service, Inc., 4030 Wake Forest Road, STE 349, Raleigh, NC, 27609, USA</p>
        <p className="italic">(Renewal date of record: September 13, 2024 — verify current standing.)</p>
      </Section>

      <Section title="Article VII — Incorporator">
        <ul className="list-disc pl-6 space-y-2">
          <li>Jordan D LaFontaine — President and Co-Founder</li>
          <li>Brandon Kelly — Co-Founder</li>
          <li>Evan Lawrence — Co-Founder</li>
        </ul>
      </Section>

      <Section title="Article VIII — Dissolution">
        <p>
          Upon dissolution, any remaining assets of HSB should be donated to a non-profit organization or charity as
          decided by the majority of the members.
        </p>
      </Section>

      <Section title="Article IX — Amendments">
        <p>
          Amendments to these Articles of Incorporation may be proposed by any member and shall be approved by a
          majority vote of a quorum of the club&apos;s current members as described within HSB bylaws.
        </p>
      </Section>

      <Section title="Article X — Indemnification">
        <p>
          All officers and directors of HSB shall be indemnified by the corporation against all expenses and
          liabilities, including counsel fees, reasonably incurred or imposed upon such members of the board in
          connection with any threatened, pending, or completed action, suit, or proceeding to which the director or
          officer may become involved by reason of being or having been a member of the board, or any settlement
          thereof, unless adjudged therein to be liable for gross negligence or misconduct in the performance of
          duties as outlined in HSB bylaws.
        </p>
      </Section>

      <p className="mt-8 text-foreground/50 text-sm italic">
        Signed by the incorporators: Jordan D LaFontaine (President), Brandon Kelly (Co-Founder), Evan Lawrence
        (Co-Founder). This is a transcription of the filed Articles of Incorporation for club reference; the filed
        original is the controlling legal document.
      </p>
    </>
  );
}
