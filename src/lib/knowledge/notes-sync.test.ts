import { describe, it, expect } from 'vitest'
import { isMeetingNotesDoc } from './notes-sync'

// Pure string assertions only — no Drive/DB calls. syncMeetingNotes's live
// Drive calls are intentionally NOT unit-tested here; dependency injection
// exists so the loop *could* be exercised with fakes, but that's optional.

describe('isMeetingNotesDoc', () => {
  describe('positive cases', () => {
    it('matches a dated WCB monthly meeting doc with "Notes by Gemini" suffix', () => {
      expect(isMeetingNotesDoc('WCB Monthly Meeting - 2026/07/16 ... Notes by Gemini')).toBe(true)
    })

    it('matches "Meeting Notes - <Month> <Year>"', () => {
      expect(isMeetingNotesDoc('Meeting Notes - Feb 2026')).toBe(true)
    })

    it('matches "WCB Meeting - <Month> <Year> ..."', () => {
      expect(isMeetingNotesDoc('WCB Meeting - January 2026 ...')).toBe(true)
    })

    it('matches a WCB Holiday Meeting doc with "Notes by Gemini" suffix', () => {
      expect(isMeetingNotesDoc('WCB Holiday Meeting 2025 ... Notes by Gemini')).toBe(true)
    })

    it('matches "<Month> <Year> Meeting Notes"', () => {
      expect(isMeetingNotesDoc('May 2025 Meeting Notes')).toBe(true)
    })

    it('is case-insensitive', () => {
      expect(isMeetingNotesDoc('wcb monthly meeting - 2026/07/16 notes by gemini')).toBe(true)
      expect(isMeetingNotesDoc('MEETING NOTES - FEB 2026')).toBe(true)
    })
  })

  describe('negative cases', () => {
    it('rejects a TEMPLATE meeting-announcement doc', () => {
      expect(isMeetingNotesDoc('TEMPLATE - Meeting Announcement')).toBe(false)
    })

    it('rejects a WORKFLOW meeting-documentation doc', () => {
      expect(isMeetingNotesDoc('WORKFLOW - Meeting Documentation')).toBe(false)
    })

    it('rejects a TEMPLATE recording-announcement doc', () => {
      expect(isMeetingNotesDoc('TEMPLATE - Recording Announcement')).toBe(false)
    })

    it('rejects a non-meeting doc', () => {
      expect(isMeetingNotesDoc('Club Bylaws Draft')).toBe(false)
    })

    it('rejects a doc that mentions "meeting" but has no notes/date signal', () => {
      expect(isMeetingNotesDoc('Meeting Room Booking Form')).toBe(false)
    })

    it('rejects TEMPLATE even if it otherwise looks like a meeting-notes doc', () => {
      expect(isMeetingNotesDoc('TEMPLATE - Meeting Notes by Gemini')).toBe(false)
    })

    it('rejects WORKFLOW even if it otherwise looks like a meeting-notes doc', () => {
      expect(isMeetingNotesDoc('WORKFLOW - WCB Monthly Meeting Notes')).toBe(false)
    })

    it('rejects an empty string', () => {
      expect(isMeetingNotesDoc('')).toBe(false)
    })
  })
})
