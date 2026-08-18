import { describe, it, expect } from 'vitest'
import { buildArtifactDescribePrompt, cleanFilename } from './describe'

// Pure string / string-utility assertions only — no API calls.
// describeArtifact's live Anthropic call is intentionally NOT unit-tested
// here; only buildArtifactDescribePrompt (pure) and cleanFilename (pure) are.

describe('buildArtifactDescribePrompt', () => {
  const { system, user } = buildArtifactDescribePrompt(
    'RAW EXTRACTED TEXT HERE',
    'Brewfather_SixDegreesofSeparationSaison_20251021.pdf',
  )

  it('is pure and returns a system/user pair', () => {
    expect(typeof system).toBe('string')
    expect(typeof user).toBe('string')
  })

  it('carries the filename in the user message', () => {
    expect(user).toContain('Brewfather_SixDegreesofSeparationSaison_20251021.pdf')
  })

  it('carries the text excerpt in the user message', () => {
    expect(user).toContain('RAW EXTRACTED TEXT HERE')
  })

  it('instructs the exact TITLE:/DESCRIPTION: output format', () => {
    expect(system).toMatch(/TITLE:/)
    expect(system).toMatch(/DESCRIPTION:/)
  })

  it('describes the task as titling a club document', () => {
    expect(system.toLowerCase()).toMatch(/club document/)
  })

  it('instructs a concise, human-readable, proper-case title', () => {
    expect(system.toLowerCase()).toMatch(/concise/)
    expect(system.toLowerCase()).toMatch(/proper case/)
    expect(system.toLowerCase()).toMatch(/human-readable/)
  })

  it('mentions basing the title on filename when text is thin', () => {
    expect(system.toLowerCase()).toMatch(/filename/)
    expect(system.toLowerCase()).toMatch(/thin/)
  })

  it('mentions a beer/recipe name or talk/presentation title as example subjects', () => {
    expect(system.toLowerCase()).toMatch(/recipe/)
    expect(system.toLowerCase()).toMatch(/presentation|talk/)
  })

  it('instructs a one-sentence description', () => {
    expect(system.toLowerCase()).toMatch(/one-sentence|one sentence/)
  })

  it('instructs noting the document type within the description', () => {
    expect(system.toLowerCase()).toMatch(/type/)
    expect(system.toLowerCase()).toMatch(/meeting minutes/)
    expect(system.toLowerCase()).toMatch(/recipe sheet/)
    expect(system.toLowerCase()).toMatch(/slide deck/)
    expect(system.toLowerCase()).toMatch(/how-to guide/)
  })

  it('explains the document-type note helps catch mis-categorization', () => {
    expect(system.toLowerCase()).toMatch(/mis-categoriz|miscategoriz/)
  })

  it('instructs inventing nothing not supported by the text', () => {
    expect(system.toLowerCase()).toMatch(/invent nothing/)
  })

  it('the user message carries both filename and text excerpt clearly labeled', () => {
    expect(user.toUpperCase()).toMatch(/FILENAME/)
  })
})

describe('cleanFilename', () => {
  it('replaces underscores and hyphens with spaces, drops extension, collapses spaces', () => {
    expect(cleanFilename('Brewfather_SixDegreesofSeparationSaison_20251021')).toBe(
      'Brewfather SixDegreesofSeparationSaison 20251021',
    )
  })

  it('drops a file extension', () => {
    expect(cleanFilename('some-report.pdf')).toBe('some report')
  })

  it('collapses multiple separators into a single space', () => {
    expect(cleanFilename('a__b--c')).toBe('a b c')
  })

  it('trims leading/trailing whitespace after replacement', () => {
    expect(cleanFilename('_leading_and_trailing_.docx')).toBe('leading and trailing')
  })

  it('handles a plain name with no separators or extension', () => {
    expect(cleanFilename('SimpleName')).toBe('SimpleName')
  })
})
