import { test, expect } from 'vitest'
import { sanitizeArticleHtml } from '../src/lib/knowledge/extract-notes'
import { GOVERNANCE_ARTICLES } from './seed-governance'

// Validates the seed's content-building logic without touching any database
// (no local/dev DB is available in this environment; PROD seeding is a
// separate, paused step). Confirms: both governance rows are well-formed,
// sanitize-html doesn't strip anything unexpected, and no `status` field is
// ever present (Article has no status column — existence = published).
test('seed-governance: both rows are well-formed and carry no status field', () => {
  expect(GOVERNANCE_ARTICLES.length).toBe(2)
  const slugs = GOVERNANCE_ARTICLES.map((g) => g.slug).sort()
  expect(slugs).toEqual(['bylaws', 'code-of-conduct'])

  for (const gov of GOVERNANCE_ARTICLES) {
    expect('status' in gov).toBe(false)

    const bodyHtml = sanitizeArticleHtml(gov.html)
    expect(bodyHtml.length).toBeGreaterThan(500)
    // sanitize-html should pass through the semantic tags we used unchanged...
    expect(bodyHtml).toContain('<h2>')
    expect(bodyHtml).toContain('<p>')
    expect(bodyHtml).toContain('<strong>')
    // ...and strip anything not on the allowlist (no class/style/script residue).
    expect(bodyHtml).not.toContain('<script')
    expect(bodyHtml).not.toContain('class=')
    expect(bodyHtml).not.toContain('style=')
  }
})

test('seed-governance: bylaws body includes all fourteen articles', () => {
  const bylaws = GOVERNANCE_ARTICLES.find((g) => g.slug === 'bylaws')!
  const bodyHtml = sanitizeArticleHtml(bylaws.html)
  for (const article of [
    'Article One', 'Article Two', 'Article Three', 'Article Four', 'Article Five',
    'Article Six', 'Article Seven', 'Article Eight', 'Article Nine', 'Article Ten',
    'Article Eleven', 'Article Twelve', 'Article Thirteen', 'Article Fourteen',
  ]) {
    expect(bodyHtml).toContain(article)
  }
})

test('seed-governance: code-of-conduct body includes the strike ladder and reporting section', () => {
  const coc = GOVERNANCE_ARTICLES.find((g) => g.slug === 'code-of-conduct')!
  const bodyHtml = sanitizeArticleHtml(coc.html)
  expect(bodyHtml).toContain('Strike 1')
  expect(bodyHtml).toContain('Strike 2')
  expect(bodyHtml).toContain('Reporting a problem')
})
