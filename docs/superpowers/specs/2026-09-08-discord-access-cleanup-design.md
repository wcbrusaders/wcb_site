# Discord Permission Cleanup + Membership Role Provisioning — Design

**Date:** 2026-09-08
**Status:** Design (brainstormed) → review
**Repo:** wcb_bot (Discord bot owns all Discord API actions). Prerequisite for
Phase 2 of the membership-lifecycle project (`2026-09-08-membership-lifecycle-to-site-design.md`).

## Problem / motivation

The membership plan's Phase 2 wants to remove a lapsed member's Discord access
(role-strip → lapsed lobby) and restore it on rejoin. A read-only audit
(`/admin channel_gating`, `full_perms_audit`, `role_overlap`, `link_coverage`
— all built + deployed 2026-09-08) proved the current server can't support that:

1. **`@everyone` has server-wide `view_channel`.** So every channel not explicitly
   denied is visible to anyone in the server. The Brusader role grants almost
   nothing `@everyone` doesn't already have → **role-strip removes nothing today.**
   The real gate is server ENTRY (the invite), not the role.
2. **Nothing reliably assigns the Brusader role.** The ONLY code path that grants
   it is the opt-in `/link` command (`member_linking.py:276`). `on_member_join`
   assigns no role. So members who never `/link`ed have no role. Audit: **12 of 32
   current members unlinked (62% linked); 2 leadership members (arycella,
   trippposke — both Coordinators) hold a tier role but not Brusader.**
3. Role permissions are over-provisioned: Officer has `administrator` AND every
   individual perm (redundant); Moderator (0 members) & Manager (2) have near-admin
   (`manage_guild/roles/channels`, `ban`).

Net: the whole "membership → Discord access" chain rests on a manual, opt-in step
a third of members never did. Building role-gating on top of this as-is would make
new paid members join and **see nothing** until they happen to `/link` — worse than
today.

## ADDENDUM (2026-09-10) — corrected flip after the live dry-run

The first flip impl drifted from this spec and had to be corrected against the REAL
server (dry-run caught it before any apply). Binding corrections:

- **Gate rule is an EXCLUDE-list, not an allow-list.** Gate EVERY category to Brusader
  EXCEPT `Club Management` (officer/coordinator area — holds `#wcb-coordinators`, already
  gated). The original impl hardcoded specific member-category NAMES (Brewing/Events/…)
  which didn't match the real names (`Brewing and Recipes`, `Events and Activities`,
  `Voice Channels`) and would have left them PUBLIC. Real categories (8): Bot Help,
  Brewing and Recipes, Events and Activities, Social, Voice Channels, Equipment (all
  gated); Club Info + Club Management handled specially (below).
- **The lobby is ONE CHANNEL, `#welcome`, not a category.** Club Info is NO LONGER
  excluded — it gets gated like the rest, so its other channels (#announcements,
  #club-business, #voting-booth) become members-only. `#welcome` keeps an explicit
  @everyone-ALLOW override so it stays the sole public lobby channel.
- **CHANNEL-level overrides matter (37 channels).** Category gating only affects
  INHERIT channels (they follow the category). Channels with their own @everyone-ALLOW
  override (`OPEN` in the audit) survive the category deny — so the flip must ALSO remove
  those overrides. Live OPEN channels to fix → members-only by removing their override:
  `#bot-help`, `#equipment-program`, `#announcements`, `#club-business`, `#voting-booth`.
  KEEP `#welcome` open. Never touch Club Management channels (already GATED).
- apply_flip must therefore emit CHANNEL ops (remove @everyone override / ensure
  #welcome allow) in addition to category ops, and the dry-run + channel_gating audit
  together must show both levels before confirm.

## Decisions (settled in brainstorming, 2026-09-08)

### A. The permission flip (makes role-gating actually work)
1. **Remove `view_channel` from the base `@everyone` role** (server-level). Being in
   the server then grants nothing by default.
2. **Brusader becomes the member key** — it keeps view/send/connect, so holding it is
   what unlocks member channels.
3. **Gate member categories at the CATEGORY level** (`@everyone DENY view` +
   `Brusader ALLOW view`), channels stay synced — ~6 category edits, not ~30 channel
   edits. Fewer changes = lower risk.
4. **Minimal lobby:** a role-less / lapsed person sees ONLY `#welcome` + a renew/join
   prompt. Everything else (brewing, social, events, announcements, equipment)
   requires Brusader.
5. **[Club Management] leadership channels untouched** — already correctly gated
   (`@everyone` denied at the category; Manager/Coordinator/named-member allows).

### B. Stacked roles
Coordinator / Manager / Officer are **additive on top of Brusader** — everyone with a
tier role must ALSO hold Brusader. Coordinator = Brusader (member access) + Coordinator
(their private channel + event powers). **Pre-flight backfill:** add Brusader to the 2
at-risk holders (arycella, trippposke — both Coordinators) BEFORE the flip, or they'd
lose member-channel access. Adding a role locks no one out, so this is safe to do first.
(Officers/President have `administrator`, which bypasses ALL overwrites — they can never
be locked out by the flip; that's the safety net.)

### C. Role right-sizing (security)
- Officer + President: keep `administrator`; drop the redundant individual perms admin
  already covers.
- Moderator (0 members): candidate for deletion. Manager (2): review whether it truly
  needs `manage_guild/roles/channels/ban`.
- Keep the bot's role perms (it needs role add/remove + kick/ban for enforcement).

### D. Role PROVISIONING on join/membership (the keystone — fixes the root cause)
Assign the Brusader role reliably, tied to MEMBERSHIP, mirroring the de-provision model
(auto-if-linked / officer-confirm-if-not):
- **Linked + confirmed paid member → bot auto-grants Brusader.**
- **Unlinked → officer-confirm:** bot prompts an officer (Discord notification → admin
  surface) to pick/confirm the Discord handle, then grants.
- **Member not on Discord at all → first-class "no Discord" state:** skip the Discord
  step SILENTLY. Never flagged as an error or a pending task. Google Group + site access
  still apply. Discord-optional membership is legitimate (e.g. Eric).
- Same auto/confirm logic in reverse for de-provision (lapse) — see the lifecycle spec.

### E. Existing tooling reused (no new linking tool needed)
- `/admin forcelink` (`officer_commands.py:1134`) already links an email→Discord handle
  AND runs the role-assignment path — so force-linking an unlinked member typically fixes
  BOTH the link and the missing role in one action. `/admin unlink_member` is the reverse.
- Backlog cleanup (one-time, Jordan does it): use `/admin forcelink` for the on-Discord
  unlinked members; add Brusader to arycella + trippposke. The provisioning system (D)
  prevents the backlog from rebuilding.

### F. Apply mechanism (when we execute the flip — Phase later, not now)
Bot command with **dry-run + confirm**: compute the diff, show EXACTLY what changes,
apply only on confirmation. Category-level changes; reversible plan captured first.

## Audit facts (2026-09-08, ground truth)
- 37 channels, 10 roles. Only [Club Management] is truly private today.
- `@everyone` server perms include `view_channel` (root cause).
- Link coverage 20/32 (62%). Unlinked 12 (named; some may not be on Discord).
- Role-overlap at-risk: arycella, trippposke (both Coordinators; hold tier role, no Brusader).
- Categories with no overwrites (→ public via @everyone view): Brewing, Events, Social,
  Voice. [Club Info]/[Bot Help] explicitly allow @everyone view. [Equipment] grants several
  roles view but doesn't deny @everyone → still public. [Club Management] denies @everyone.

## Migration order (each step shippable + reversible; dry-run before the flip)
1. **Pre-flight backfill (safe, additive):** add Brusader to arycella + trippposke; Jordan
   force-links the on-Discord unlinked members. Nothing gated yet — no lockout possible.
2. **Role right-sizing (C):** trim redundant Officer perms; review Manager/Moderator; delete
   empty Moderator if unused. (Officers keep admin → safe throughout.)
3. **Provisioning (D):** build auto-grant-if-linked / officer-confirm-if-not role assignment
   tied to membership, with the "no Discord" silent-skip state. Deploy + verify BEFORE the
   flip, so new/existing members reliably HAVE the role before it starts gating.
4. **The flip (A):** remove `view_channel` from base `@everyone`; set member categories to
   `@everyone DENY + Brusader ALLOW`; confirm the minimal lobby (#welcome + renew) stays
   visible to role-less. Via the dry-run+confirm apply command. THIS is the moment gating
   goes live — do it only after 1-3 are done + verified.
5. Unblocks membership Phase 2 (lapse role-strip now actually removes access).

## Safety / zero-disruption
- All changes are bot-executed via a dry-run+confirm command (see the plan for the apply tool).
- Category-level edits (few), not per-channel; synced channels inherit automatically.
- Administrator (Officer/President) bypasses every overwrite → leadership can't be locked out.
- Order is designed so no gating turns on until everyone who should have Brusader does
  (steps 1 + 3 precede step 4). Adding roles is non-destructive; the risky step (the flip)
  is last and dry-run-previewed.
- Read-only audits (already deployed) let us re-verify state before and after each step.

## Out of scope
- The membership-lifecycle work itself (separate spec; this is its Phase-2 prerequisite).
- Changing how members pay / the roster source of truth.
- Voice-channel-specific perms beyond view/connect parity.
