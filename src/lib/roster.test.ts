import { test, expect } from 'vitest'
import { normalizeEmail, mapSheetRow } from './roster'

test('normalizeEmail lowercases and trims', () => {
  expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com')
})

const HEADERS = ['Name','Tier','Email Address','Expires','Current','Google Email','Partner Email','Board Member']

test('mapSheetRow maps a current member with google email', () => {
  const row = ['Jane Doe','Full','Jane@Example.com','2027-01-01','TRUE','jane.g@gmail.com','partner@x.com','No']
  const m = mapSheetRow(HEADERS, row)!
  expect(m.emailAddress).toBe('jane@example.com')      // normalized
  expect(m.googleEmail).toBe('jane.g@gmail.com')
  expect(m.current).toBe(true)
  expect(m.isBoard).toBe(false)
  expect(m.partnerEmail).toBe('partner@x.com')
  expect(m.name).toBe('Jane Doe')
})

test('mapSheetRow marks non-current member', () => {
  const row = ['Bob','Full','bob@x.com','2020-01-01','FALSE','','','No']
  expect(mapSheetRow(HEADERS, row)!.current).toBe(false)
})

test('mapSheetRow returns null when no email', () => {
  const row = ['NoEmail','Full','','','TRUE','','','No']
  expect(mapSheetRow(HEADERS, row)).toBeNull()
})

test('mapSheetRow parses board member true', () => {
  const row = ['Chair','Full','chair@x.com','2027-01-01','yes','','','Yes']
  expect(mapSheetRow(HEADERS, row)!.isBoard).toBe(true)
})

test('syncRoster upserts fetched rows and deactivates absent members', async () => {
  const { syncRoster } = await import('./roster')
  const fetched = [
    { emailAddress: 'a@x.com', googleEmail: null, name: 'A', tier: null, current: true, isBoard: false, partnerEmail: null, expires: null },
    { emailAddress: 'b@x.com', googleEmail: null, name: 'B', tier: null, current: false, isBoard: false, partnerEmail: null, expires: null },
  ]
  const upserts: string[] = []
  let updateManyWhereIn: string[] = []
  const db = {
    member: {
      upsert: async ({ where }: any) => { upserts.push(where.emailAddress) },
      updateMany: async ({ where }: any) => {
        // Capture the actual `in` list from the where clause
        updateManyWhereIn = where.emailAddress.in ?? []
        return { count: updateManyWhereIn.length }
      },
      findMany: async () => [
        { emailAddress: 'a@x.com' },
        { emailAddress: 'b@x.com' },
        { emailAddress: 'c@x.com' }, // absent from fetch
      ],
    },
  }
  const res = await syncRoster({ fetchAll: async () => fetched, db: db as any })
  // Upsert called for each fetched row
  expect(upserts).toEqual(['a@x.com', 'b@x.com'])
  expect(res.synced).toBe(2)
  // Deactivation: only absent member c@x.com, not the present ones
  expect(updateManyWhereIn).toEqual(['c@x.com'])
  expect(res.deactivated).toBe(1)
})

test('syncRoster does not call updateMany when no absent members', async () => {
  const { syncRoster } = await import('./roster')
  const fetched = [
    { emailAddress: 'a@x.com', googleEmail: null, name: 'A', tier: null, current: true, isBoard: false, partnerEmail: null, expires: null },
    { emailAddress: 'b@x.com', googleEmail: null, name: 'B', tier: null, current: false, isBoard: false, partnerEmail: null, expires: null },
  ]
  const upserts: string[] = []
  let updateManyWasCalled = false
  const db = {
    member: {
      upsert: async ({ where }: any) => { upserts.push(where.emailAddress) },
      updateMany: async () => {
        updateManyWasCalled = true
        return { count: 0 }
      },
      findMany: async () => [
        { emailAddress: 'a@x.com' },
        { emailAddress: 'b@x.com' },
      ],
    },
  }
  const res = await syncRoster({ fetchAll: async () => fetched, db: db as any })
  expect(upserts).toEqual(['a@x.com', 'b@x.com'])
  expect(res.synced).toBe(2)
  expect(updateManyWasCalled).toBe(false)
  expect(res.deactivated).toBe(0)
})
