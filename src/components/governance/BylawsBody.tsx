function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <div className="text-foreground/75 text-[15px] leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

/**
 * The full draft v2.0 Bylaws body — single source of truth, transcribed faithfully from
 * docs/governance/bylaws-v2.md. Edit the policy text HERE only, keeping it in sync with the source.
 */
export function BylawsBody() {
  return (
    <>
      <p className="text-foreground/75 text-[15px] leading-relaxed">
        The legal entity is <strong>Holly Springs Brüsaders</strong>, a North Carolina corporation. The club operates
        publicly as <strong>Wake County Brusaders</strong>. Both names refer to the same organization.
      </p>

      <Section title="Article One — Name of Organization">
        <p>
          The legal name of this organization is <strong>Holly Springs Brüsaders</strong>, a North Carolina
          corporation (hereinafter &quot;the club&quot;). The club operates publicly as{" "}
          <strong>Wake County Brusaders</strong> (&quot;WCB&quot;), a trade name adopted as the club grew beyond
          Holly Springs. Both names refer to the same organization; references to &quot;HSB,&quot; &quot;WCB,&quot;
          &quot;Brusaders,&quot; or &quot;the club&quot; in these bylaws mean this single entity.
        </p>
      </Section>

      <Section title="Article Two — Purpose and Goals">
        <p>
          The club is organized exclusively for social and recreational purposes within the meaning of Section
          501(c)(7) of the Internal Revenue Code. Its primary purpose is to enjoy and promote the hobby of
          homebrewing, and to provide members a comfortable community centered on that shared craft and on
          friendship — insulated from outside pressure. The club pursues the following goals:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Enhancing knowledge about beer, beer tasting, beer judging, and brewing techniques through shared experiences.</li>
          <li>Advocating for the hobby and enjoyment of homebrewing.</li>
          <li>Fostering a brewers&apos; community through social activities.</li>
          <li>Championing the responsible consumption of alcoholic beverages.</li>
          <li>Fostering a comfortable, pressure-free environment where every member belongs — insulated from external conflict, centered on friendship and the craft.</li>
        </ul>
      </Section>

      <Section title="Article Three — Membership">
        <p><strong>Eligibility.</strong> All individuals of legal drinking age in North Carolina are eligible for membership.</p>
        <p><strong>Admission.</strong> Membership is granted upon application and payment of dues.</p>
        <p><strong>Term.</strong> Membership runs for twelve (12) months from the date of payment and is renewed by paying the following year&apos;s dues.</p>
        <p><strong>Dues &amp; tiers.</strong> The club has a single membership standing — <strong>Brusader</strong> — offered at two rates:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Individual — $40/year:</strong> one named member with full voting rights.</li>
          <li><strong>Dual — $65/year:</strong> two named members (e.g., a couple or brewing partners), each with full voting rights (two votes).</li>
        </ul>
        <p>Dues amounts are set by the Board of Officers; the rates above are current as of ratification.</p>
        <p>
          <strong>Rights.</strong> Each paid member has full voting rights on club matters. No member is personally
          liable for the club&apos;s debts or obligations. No member receives compensation for services, though
          approved expenses may be reimbursed.
        </p>
        <p>
          <strong>Honorary &amp; sponsor memberships.</strong> The Board of Officers may grant honorary or sponsor
          memberships for durations it determines. These members enjoy all membership benefits except voting rights
          and Board membership.
        </p>
        <p>
          <strong>Guests &amp; family.</strong> Members may bring guests to club meetings and events. Family of a
          paid member is welcome at meetings and events without a separate membership.
        </p>
        <p>
          <strong>Non-discrimination &amp; conduct.</strong> Membership is open to all eligible individuals without
          discrimination. The club is committed to a welcoming, respectful, and safe community — online and in
          person — free from harassment and discrimination of any kind. All members agree to and are bound by the
          club&apos;s Code of Conduct (see Article Eleven), which governs conduct, protected characteristics, and
          enforcement.
        </p>
      </Section>

      <Section title="Article Four — Meetings">
        <p>
          <strong>Regular meetings.</strong> The club meets monthly, on the third Thursday, rotating between
          members&apos; home breweries and local production breweries. The Board confirms each meeting&apos;s exact
          location in advance. A typical meeting includes a workshop, a technique nugget, and a style guide segment,
          and always includes homebrew sharing.
        </p>
        <p>
          <strong>No annual meeting required.</strong> The club does not hold a separate annual membership meeting;
          regular monthly meetings, digital voting (Article Six), and the Board&apos;s quarterly financial review
          (Article Twelve) cover club business.
        </p>
        <p>
          <strong>Special meetings.</strong> The President may call a special meeting when in the club&apos;s best
          interest. On written request of two Board members or ten general members, the President must call one.
          Members receive at least five days&apos; notice stating the purpose and agenda; only noticed business is
          conducted unless all present unanimously agree otherwise.
        </p>
        <p>
          <strong>Notices.</strong> Meeting and vote notices may be given by email, the club newsletter, the club
          website, Discord, or other channels the Board deems appropriate.
        </p>
        <p>
          <strong>Voting quorum (digital).</strong> Because club voting is conducted digitally (Article Six) so
          every member can participate regardless of attendance, quorum is measured by participation, not physical
          presence. A vote is valid when it remains open for at least 72 hours, and at least 25% of eligible members
          cast a ballot within that window. Votes that fail to reach 25% participation do not carry and may be
          re-run. (Amendments, dissolution, and officer-removal votes are governed by their own higher thresholds
          and windows in Articles Eight, Ten, and Five.)
        </p>
        <p>
          <strong>Meeting conduct.</strong> Meetings cover old business, new business, coordinator reports, and
          officer reports. An officer or delegated member records decisions.
        </p>
      </Section>

      <Section title="Article Five — Board of Officers & Coordinators">
        <p>
          <strong>Governance.</strong> The club is governed by a Board of Officers. The Board directs the club&apos;s
          affairs, sets policy, approves the budget, and is collectively responsible for the club&apos;s operation
          and wellbeing.
        </p>
        <p>
          <strong>Core functions.</strong> The Board ensures these functions are always covered — by one officer
          each or combined among officers as the Board sees fit:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Leadership (President)</strong> — chief executive responsibility: final decisions on budget and priorities, legal compliance, securing venues, and acting as a signatory on the club&apos;s accounts.</li>
          <li><strong>Finance</strong> — club finances, second account signatory, expenditure approval, financial reports, membership list.</li>
          <li><strong>Records</strong> — communications, meeting minutes, member notifications, recordkeeping.</li>
          <li><strong>Member wellbeing / Ombudsman</strong> — receiving and handling conduct concerns in confidence per the Code of Conduct (Article Eleven).</li>
        </ul>
        <p>
          <strong>Additional officers.</strong> The Board may establish and fill additional officer roles as needs
          require — currently including Events, Logistics, and Technical officers — and define their duties. An
          Emeritus officer is a past officer who retains a full, standing seat on the Board (with vote) in an
          advisory capacity, without active operational duties.
        </p>
        <p>
          <strong>Coordinators.</strong> The Board may appoint Coordinators who are accountable for a specific
          ongoing function and report to the Board — currently including workshops, technique nuggets, style guide,
          events-external, and brewday captain — and may create, assign, or retire coordinator roles at any time.
          Coordinators are not voting members of the Board by virtue of the coordinator role. A person may serve as
          both an officer and a coordinator.
        </p>
        <p>
          <strong>Assignment of duties.</strong> The Board assigns and may reassign titles and responsibilities among
          its members; a single officer may cover more than one function (e.g., serving as both President and
          Technical Officer).
        </p>
        <p><strong>Voting.</strong> All officers — including additional and emeritus officers — have equal voting rights on the Board.</p>
        <p>
          <strong>Terms.</strong> Officers serve at will — indefinitely, until they resign or are removed under this
          Article. There is no fixed term or mandatory annual election. The Board may, by resolution, adopt fixed
          terms and an election schedule in the future without amending these bylaws.
        </p>
        <p>
          <strong>Selection &amp; vacancies.</strong> New officers are selected by the Board. If an officer resigns
          or is removed, the Board selects a replacement. If the President function becomes vacant, the Board
          designates an acting lead until it fills the role.
        </p>
        <p>
          <strong>Removal.</strong> An officer may be removed by a two-thirds vote of the other officers, with a
          quorum of at least three, consistent with the club&apos;s enforcement safeguards. Conduct-based removals
          follow the Code of Conduct enforcement process (Article Eleven).
        </p>
      </Section>

      <Section title="Article Six — Voting">
        <p>
          <strong>Digital voting.</strong> Club votes are conducted primarily through a digital polling platform so
          that every eligible member can participate regardless of physical presence. A vote&apos;s validity
          (window and participation quorum) is governed by Article Four.
        </p>
        <p>
          <strong>How matters reach a vote.</strong> The Board may put any matter to a member vote. Any member may
          petition an officer to bring a specific issue to a vote; officers will bring forward good-faith requests.
        </p>
        <p>
          <strong>Expenditure approval.</strong> The Board of Officers manages the club&apos;s routine and
          operational spending at its discretion, consistent with the approved budget and its duty of financial
          oversight (Article Twelve). Any single expenditure over $500 requires approval by a full membership vote.
        </p>
        <p className="italic">
          (Officer selection is governed by Article Five; there is no membership election of officers.)
        </p>
      </Section>

      <Section title="Article Seven — Dues">
        <p>
          Dues are set by the Board of Officers and are paid annually. The current rates — $40/year individual and
          $65/year dual — are stated in Article Three (Membership). The Board may adjust dues amounts; material
          changes will be communicated to the membership in advance through the club&apos;s channels. Dues are paid
          per member on a rolling twelve-month basis from the date of payment.
        </p>
      </Section>

      <Section title="Article Eight — Amendments">
        <p>
          Any member may petition for an amendment by submitting it to the Board digitally or in writing. Proposed
          changes are communicated to all members through the club&apos;s channels. A 30-day notice period follows,
          for members to review and discuss. After the notice period, a digital vote is held; an amendment passes on
          a two-thirds vote of the ballots cast, provided the vote meets the participation quorum (at least 25% of
          eligible members; Article Four). This process also governs amendments to the Articles of Incorporation, as
          referenced therein.
        </p>
      </Section>

      <Section title="Article Nine — Indemnification">
        <p>
          All officers of the club shall be indemnified by the club against all expenses and liabilities, including
          counsel fees, reasonably incurred or imposed upon such officers in connection with any threatened,
          pending, or completed action, suit, or proceeding to which the officer may become involved by reason of
          being or having been an officer of the club, or any settlement thereof, unless adjudged therein to be
          liable for gross negligence or misconduct in the performance of duties. In the event of a settlement,
          indemnification applies only when the Board of Officers approves the settlement and reimbursement as being
          in the best interest of the club.
        </p>
      </Section>

      <Section title="Article Ten — Dissolution">
        <p>
          The dissolution of the club can only be proposed if 80% of the club&apos;s paid members, including the
          Board of Officers, vote in favor of dissolution. Upon dissolution, any remaining assets should be donated
          to a non-profit organization or charity as decided by the majority of the members.
        </p>
      </Section>

      <Section title="Article Eleven — Code of Conduct">
        <p>
          All members, officers, and coordinators are bound by the club&apos;s Code of Conduct, ratified August 15,
          2026, as amended from time to time. The Code of Conduct is the club&apos;s authoritative statement of
          expected behavior and governs, among other things: respectful and good-faith conduct; the prohibition of
          harassment and discrimination; reporting of concerns through the Ombudsman or any Board member; the strike
          ladder (Correction → Warning → Board decides); and the enforcement and removal process, including interim
          suspension and the Board safeguards (quorum and two-thirds vote) that protect against misuse. Officer
          discipline and removal follow this same process (see Article Five). The Code of Conduct is maintained
          separately and may be amended through its own process; the current text is published on the club website.
        </p>
      </Section>

      <Section title="Article Twelve — Financial Oversight">
        <p>
          The Board of Officers shall conduct a quarterly review of the club&apos;s financials by performing an
          audit. This ensures transparency, accountability, and the financial health of the club.
        </p>
      </Section>

      <Section title="Article Thirteen — Conflict Resolution">
        <p>
          In the event of general disagreements among members: both parties should first attempt to resolve the
          issue amicably through open dialogue; if unresolved, the matter is brought to the Board, which mediates
          and provides a resolution; if necessary, a neutral third-party mediator may be brought in. Concerns
          involving harassment, discrimination, or other Code-of-Conduct violations go through the Code of
          Conduct&apos;s Ombudsman and enforcement process (Article Eleven), not this article.
        </p>
      </Section>

      <Section title="Article Fourteen — Membership Termination">
        <p>
          <strong>Voluntary.</strong> A member may end their membership at any time by notifying the Board digitally
          or in writing. Membership otherwise lapses automatically at the end of its twelve-month term if dues are
          not renewed.
        </p>
        <p>
          <strong>Refunds.</strong> Annual dues are non-refundable. A member who leaves before their term ends is not
          owed a refund; their membership simply lapses at its expiry.
        </p>
        <p>
          <strong>Involuntary.</strong> A membership may be terminated for cause under the Code of Conduct
          enforcement process (Article Eleven), including its Board safeguards.
        </p>
      </Section>

      <Section title="Revision Log">
        <table className="w-full text-sm border border-border/50 rounded-lg overflow-hidden">
          <thead className="bg-card-bg/50 text-left">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Version</th>
              <th className="p-3">Editing Party</th>
              <th className="p-3">Changes</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border/40">
              <td className="p-3">2023-09-13</td>
              <td className="p-3">1.0</td>
              <td className="p-3">Jordan LaFontaine</td>
              <td className="p-3">Document inception</td>
            </tr>
            <tr className="border-t border-border/40">
              <td className="p-3">2023-09-19</td>
              <td className="p-3">1.1</td>
              <td className="p-3">Jordan LaFontaine</td>
              <td className="p-3">Dues and membership tier definitions</td>
            </tr>
            <tr className="border-t border-border/40">
              <td className="p-3">2026-08-17</td>
              <td className="p-3">2.0 (draft)</td>
              <td className="p-3">Jordan LaFontaine</td>
              <td className="p-3">
                Full rebuild: WCB rebrand/DBA; single Brusader tier + annual dues ($40/$65); rolling 12-month
                membership; digital-voting participation quorum (25% / 72h); at-will Board with no fixed terms;
                two-tier Board + Coordinator structure (incl. Emeritus); officer removal aligned to enforcement
                safeguards; Code of Conduct incorporated by reference; Committees article removed; apolitical-refuge
                purpose added; expenditure member-vote threshold $500.
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <p className="mt-8 text-foreground/50 text-sm italic">
        Status: DRAFT v2.0 — pending ratification by Board vote. Flagged real-world to-dos: verify the &quot;Wake
        County Brusaders&quot; assumed-name (DBA) certificate is filed in NC; confirm 501(c)(7) status; verify the
        registered-agent renewal (Articles of Incorporation list Sept 13, 2024).
      </p>
    </>
  );
}
