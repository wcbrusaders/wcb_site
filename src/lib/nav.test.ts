import { test, expect, describe, it } from 'vitest'
import { MEMBER_LINKS, visibleLinks, isActive } from './nav'

test('MEMBER_LINKS are in usage order with correct routes + labels', () => {
  expect(MEMBER_LINKS.map((l) => l.label)).toEqual(['Hub', 'Competitions', 'Equipment', 'Books', 'Resources', 'Holdings', 'Admin'])
  const byLabel = Object.fromEntries(MEMBER_LINKS.map((l) => [l.label, l.href]))
  expect(byLabel.Hub).toBe('/members')
  expect(byLabel.Competitions).toBe('/members/competitions')
  expect(byLabel.Equipment).toBe('/members/equipment')
  expect(byLabel.Books).toBe('/members/library')     // label "Books", route unchanged
  expect(byLabel.Resources).toBe('/members/resources')
  expect(byLabel.Holdings).toBe('/members/holdings')
  expect(byLabel.Admin).toBe('/members/admin')
  expect(MEMBER_LINKS.find((l) => l.label === 'Resources')!.board).toBeFalsy()  // Resources is for everyone
  expect(MEMBER_LINKS.find((l) => l.label === 'Holdings')!.board).toBe(true)
  expect(MEMBER_LINKS.find((l) => l.label === 'Admin')!.board).toBe(true)
})

test('visibleLinks hides board links for non-board, shows them for board', () => {
  expect(visibleLinks(false).some((l) => l.label === 'Holdings')).toBe(false)
  expect(visibleLinks(false).some((l) => l.label === 'Admin')).toBe(false)
  expect(visibleLinks(false).some((l) => l.label === 'Resources')).toBe(true)  // Resources visible to all
  expect(visibleLinks(false).length).toBe(5)   // Hub, Competitions, Equipment, Books, Resources
  expect(visibleLinks(true).some((l) => l.label === 'Holdings')).toBe(true)
  expect(visibleLinks(true).some((l) => l.label === 'Admin')).toBe(true)
  expect(visibleLinks(true).length).toBe(7)
})

test('isActive: Hub matches only exact /members (not every /members/*)', () => {
  expect(isActive('/members', '/members')).toBe(true)
  expect(isActive('/members/', '/members')).toBe(true)
  expect(isActive('/members/equipment', '/members')).toBe(false)  // the load-bearing case
})

test('isActive: feature links match their route and nested paths', () => {
  expect(isActive('/members/equipment', '/members/equipment')).toBe(true)
  expect(isActive('/members/equipment/123', '/members/equipment')).toBe(true)  // prefix
  expect(isActive('/members/competitions', '/members/equipment')).toBe(false)
  expect(isActive('/members/library', '/members/library')).toBe(true)
})

describe('admin nav link', () => {
  it('shows the Admin link to board members', () => {
    expect(visibleLinks(true).some((l) => l.href === '/members/admin')).toBe(true)
  })
  it('hides the Admin link from non-board members', () => {
    expect(visibleLinks(false).some((l) => l.href === '/members/admin')).toBe(false)
  })
})
