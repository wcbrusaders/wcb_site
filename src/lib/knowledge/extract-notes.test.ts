import { describe, it, expect } from 'vitest'
import { buildExtractionPrompt } from './extract-notes'

// Pure string assertions only — no API calls. extractMeetingNote's live call
// is intentionally NOT unit-tested here (exercised in Task 7).

describe('buildExtractionPrompt', () => {
  const { system, user } = buildExtractionPrompt('RAW TRANSCRIPT TEXT HERE')

  it('is pure and returns a system/user pair', () => {
    expect(typeof system).toBe('string')
    expect(typeof user).toBe('string')
  })

  it('carries the raw transcript text in the user message', () => {
    expect(user).toContain('RAW TRANSCRIPT TEXT HERE')
  })

  it('instructs a leading SUMMARY: line for the preview blurb', () => {
    expect(system).toMatch(/SUMMARY:/)
    expect(system.toLowerCase()).toMatch(/2.?3 sentence|preview/)
  })

  it('instructs the model to decide meeting vs event for the title', () => {
    expect(system.toLowerCase()).toMatch(/event/)
    expect(system.toLowerCase()).toMatch(/meeting/)
  })

  describe('fixed template sections', () => {
    it('requires a Title section', () => {
      expect(system).toMatch(/Title/)
    })

    it('requires a Named participants section', () => {
      expect(system).toMatch(/Named participants/i)
    })

    it('requires the "What we covered — the brewing" section', () => {
      expect(system).toMatch(/What we covered.*the brewing/i)
    })

    it('requires a Homebrew & tasting section, marked brief', () => {
      expect(system).toMatch(/Homebrew & tasting/i)
    })

    it('requires a Competitions & logistics section, marked brief', () => {
      expect(system).toMatch(/Competitions & logistics/i)
    })

    it('requires a Decisions & action items section', () => {
      expect(system).toMatch(/Decisions & action items/i)
    })
  })

  describe('depth rule', () => {
    it('instructs full teaching depth for brewing content', () => {
      expect(system).toMatch(/full teaching depth/i)
    })

    it('instructs that a non-attendee should learn the material', () => {
      expect(system).toMatch(/non-attendee/i)
      expect(system).toMatch(/learn/i)
    })

    it('instructs summarizing admin content briefly', () => {
      expect(system).toMatch(/summarize/i)
      expect(system).toMatch(/admin/i)
    })
  })

  describe('must-strip exclusion categories', () => {
    it('flags personal life content for stripping', () => {
      expect(system).toMatch(/personal life/i)
      expect(system).toMatch(/vacation/i)
      expect(system).toMatch(/pet/i)
      expect(system).toMatch(/family/i)
      expect(system).toMatch(/spouse/i)
      expect(system).toMatch(/aquarium/i)
      expect(system).toMatch(/weather/i)
    })

    it('flags off-topic tangents for stripping', () => {
      expect(system).toMatch(/off-topic/i)
      expect(system).toMatch(/bison/i)
      expect(system).toMatch(/quantum/i)
    })

    it('flags sensitive club-politics and third-party commentary for stripping', () => {
      expect(system).toMatch(/club-politics|club politics/i)
      expect(system).toMatch(/third-part(y|ies)/i)
      expect(system).toMatch(/inter-club|other clubs?/i)
      expect(system).toMatch(/other breweries/i)
    })

    it('flags distilling/moonshine legality discussion for stripping', () => {
      expect(system).toMatch(/distilling/i)
      expect(system).toMatch(/moonshine/i)
      expect(system).toMatch(/legal/i)
    })
  })

  describe('honesty constraints', () => {
    it('instructs the model to invent nothing', () => {
      expect(system).toMatch(/invent nothing|do not invent/i)
    })

    it('instructs saying "named participants" instead of fabricating a roster when roll-call is absent', () => {
      expect(system).toMatch(/roll-call/i)
      expect(system).toMatch(/named participants/i)
      expect(system).toMatch(/fabricat/i)
    })
  })

  describe('output format constraints', () => {
    it('requires clean semantic HTML output', () => {
      expect(system).toMatch(/semantic HTML/i)
    })

    it('restricts output to the allowed tag set', () => {
      expect(system).toMatch(/h2/)
      expect(system).toMatch(/h3/)
      expect(system).toMatch(/<p>|"p"|\bp\b/)
      expect(system).toMatch(/ul/)
      expect(system).toMatch(/li/)
      expect(system).toMatch(/strong/)
      expect(system).toMatch(/em/)
    })
  })
})
