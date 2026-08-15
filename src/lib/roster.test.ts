import { test, describe, it, expect, vi, afterEach } from 'vitest'
import { normalizeEmail, mapSheetRow, isCurrentMember, syncRoster, validateSecondaryEmail } from './roster'

afterEach(() => {
  vi.unstubAllEnvs()
})

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
    { emailAddress: 'a@x.com', googleEmail: null, name: 'A', tier: null, current: true, isBoard: false, role: null, partnerEmail: null, expires: null, joinDate: null, paymentDate: null, referredBy: null },
    { emailAddress: 'b@x.com', googleEmail: null, name: 'B', tier: null, current: false, isBoard: false, role: null, partnerEmail: null, expires: null, joinDate: null, paymentDate: null, referredBy: null },
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
  const res = await syncRoster({ fetchAll: async () => fetched, db: db as any, fetchGroupMembers: async () => new Set() })
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
    { emailAddress: 'a@x.com', googleEmail: null, name: 'A', tier: null, current: true, isBoard: false, role: null, partnerEmail: null, expires: null, joinDate: null, paymentDate: null, referredBy: null },
    { emailAddress: 'b@x.com', googleEmail: null, name: 'B', tier: null, current: false, isBoard: false, role: null, partnerEmail: null, expires: null, joinDate: null, paymentDate: null, referredBy: null },
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
  const res = await syncRoster({ fetchAll: async () => fetched, db: db as any, fetchGroupMembers: async () => new Set() })
  expect(upserts).toEqual(['a@x.com', 'b@x.com'])
  expect(res.synced).toBe(2)
  expect(updateManyWasCalled).toBe(false)
  expect(res.deactivated).toBe(0)
})

// isCurrentMember tests

const M = (over = {}) => ({ emailAddress: 'a@x.com', googleEmail: null, name: 'A', tier: null, current: true, isBoard: false, role: null, partnerEmail: null, expires: null, joinDate: null, paymentDate: null, referredBy: null, ...over })

function fakeDb(row: any, honorsWhere = false) {
  return { member: {
    findFirst: async (args: any) => {
      if (honorsWhere && args?.where?.current !== true) {
        return null
      }
      return row
    },
    upsert: async () => {},
  } } as any
}

test('isCurrentMember: DB hit (current) allows', async () => {
  const currentRow = M()
  const db = {
    member: {
      findFirst: async ({ where }: any) => (where.current === true ? currentRow : null),
      upsert: async () => {},
    },
  } as any
  const r = await isCurrentMember('A@X.com', { db, fetchByEmail: async () => null })
  expect(r.ok).toBe(true)
  if (r.ok) {
    expect(r.member.emailAddress).toBe('a@x.com')
  }
})

test('isCurrentMember: DB miss + live fallback finds current -> allow', async () => {
  let upsertCalled = false
  const db = {
    member: {
      findFirst: async () => null,
      upsert: async () => { upsertCalled = true },
    },
  } as any
  const r = await isCurrentMember('new@x.com', { db, fetchByEmail: async () => M({ emailAddress: 'new@x.com' }) })
  expect(r.ok).toBe(true)
  if (r.ok) {
    expect(r.member.emailAddress).toBe('new@x.com')
  }
  // Verify upsert was called (caching the new member)
  expect(upsertCalled).toBe(true)
})

test('isCurrentMember: DB miss + fallback lapsed -> deny', async () => {
  const db = {
    member: {
      findFirst: async () => null,
      upsert: async () => {},
    },
  } as any
  const r = await isCurrentMember('lapsed@x.com', { db, fetchByEmail: async () => M({ emailAddress: 'lapsed@x.com', current: false }) })
  expect(r.ok).toBe(false)
})

test('isCurrentMember: DB miss + fallback stranger -> deny', async () => {
  const db = {
    member: {
      findFirst: async () => null,
      upsert: async () => {},
    },
  } as any
  const r = await isCurrentMember('nobody@x.com', { db, fetchByEmail: async () => null })
  expect(r.ok).toBe(false)
})

test('isCurrentMember: fail-closed on error', async () => {
  const db = { member: { findFirst: async () => { throw new Error('db down') } } } as any
  const r = await isCurrentMember('a@x.com', { db, fetchByEmail: async () => { throw new Error('sheet down') } })
  expect(r.ok).toBe(false)
})

// DEV_ALLOWED_EMAILS bypass: works in dev, MUST be inert in production.
// A db/fetch that throws proves the bypass is short-circuiting BEFORE any roster check.
const throwingDeps = {
  db: { member: { findFirst: async () => { throw new Error('should not query') } } } as any,
  fetchByEmail: async () => { throw new Error('should not fetch') },
}

test('isCurrentMember: DEV_ALLOWED_EMAILS bypass allows a listed email in non-production', async () => {
  vi.stubEnv('NODE_ENV', 'development')
  vi.stubEnv('DEV_ALLOWED_EMAILS', 'Dev@Example.com')
  const r = await isCurrentMember('dev@example.com', throwingDeps)
  expect(r.ok).toBe(true) // bypassed the (throwing) roster check entirely
})

test('isCurrentMember: DEV_ALLOWED_EMAILS bypass is IGNORED in production even when set', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('DEV_ALLOWED_EMAILS', 'dev@example.com')
  // In prod the bypass must not fire, so the gate falls through to the roster check.
  // A non-throwing db that returns no match must then DENY (not allow via the dev list).
  const db = { member: { findFirst: async () => null, upsert: async () => {} } } as any
  const r = await isCurrentMember('dev@example.com', { db, fetchByEmail: async () => null })
  expect(r.ok).toBe(false)
})

// Dashboard fields tests

const HEADERS_FULL = ['Name','Tier','Payment Date','Expires','Current','Partner Email','Board Member','Join Date','Referred By','Email Address','Google Email']

test('mapSheetRow maps the dashboard sheet fields', () => {
  const row = ['Jane Doe','Full','2026-01-15','2027-01-01','TRUE','partner@x.com','No','2022-05-10','Bob','jane@example.com','jane.g@gmail.com']
  const m = mapSheetRow(HEADERS_FULL, row)!
  expect(m.joinDate?.toISOString().slice(0,10)).toBe('2022-05-10')
  expect(m.paymentDate?.toISOString().slice(0,10)).toBe('2026-01-15')
  expect(m.referredBy).toBe('Bob')
})

test('mapSheetRow: blank/invalid dashboard fields become null', () => {
  const row = ['Bob','Full','not-a-date','','TRUE','','No','','','bob@x.com','']
  const m = mapSheetRow(HEADERS_FULL, row)!
  expect(m.paymentDate).toBeNull()   // invalid date -> null (isNaN guard)
  expect(m.joinDate).toBeNull()      // blank -> null
  expect(m.referredBy).toBeNull()
})

// resourceAccess from Google Group membership (fail-soft)

test('syncRoster sets resourceAccess from group membership', async () => {
  const upserts: any[] = []
  const db = { member: {
    upsert: async (a: any) => { upserts.push(a); },
    findMany: async () => [],
    updateMany: async () => ({ count: 0 }),
  } } as any
  const rows = [
    { emailAddress:'in@x.com', googleEmail:null, name:'A', tier:null, current:true, isBoard:false, role:null, partnerEmail:null, expires:null, joinDate:null, paymentDate:null, referredBy:null },
    { emailAddress:'out@x.com', googleEmail:null, name:'B', tier:null, current:true, isBoard:false, role:null, partnerEmail:null, expires:null, joinDate:null, paymentDate:null, referredBy:null },
  ]
  await syncRoster({ db, fetchAll: async () => rows, fetchGroupMembers: async () => new Set(['in@x.com']) })
  const inU = upserts.find(u => u.where.emailAddress === 'in@x.com')
  const outU = upserts.find(u => u.where.emailAddress === 'out@x.com')
  expect(inU.update.resourceAccess).toBe(true)
  expect(outU.update.resourceAccess).toBe(false)  // absent from set -> false, NOT skipped
})

test('syncRoster is fail-soft when the group read throws (resourceAccess untouched, sheet sync completes)', async () => {
  const upserts: any[] = []
  const db = { member: {
    upsert: async (a: any) => { upserts.push(a); },
    findMany: async () => [],
    updateMany: async () => ({ count: 0 }),
  } } as any
  const rows = [{ emailAddress:'a@x.com', googleEmail:null, name:'A', tier:null, current:true, isBoard:false, role:null, partnerEmail:null, expires:null, joinDate:null, paymentDate:null, referredBy:null }]
  const r = await syncRoster({ db, fetchAll: async () => rows, fetchGroupMembers: async () => { throw new Error('directory down') } })
  expect(r.synced).toBe(1)                                  // sheet sync still completed
  expect('resourceAccess' in upserts[0].update).toBe(false) // omitted -> left unchanged
})

describe('validateSecondaryEmail', () => {
  it('accepts and normalizes a valid email', () => {
    expect(validateSecondaryEmail('  Jane2@Example.COM ')).toEqual({ ok: true, value: 'jane2@example.com' })
  })
  it('rejects empty', () => {
    expect(validateSecondaryEmail('   ').ok).toBe(false)
  })
  it('rejects a string with no @', () => {
    expect(validateSecondaryEmail('notanemail').ok).toBe(false)
  })
})

describe('mapSheetRow role', () => {
  it('maps the Role column onto MemberRecord.role', () => {
    const headers = ['Email Address', 'Name', 'Board Member', 'Role']
    const row = ['jordan@example.com', 'Jordan', 'yes', 'President']
    const rec = mapSheetRow(headers, row)
    expect(rec?.role).toBe('President')
  })

  it('sets role to null when the Role column is absent or empty', () => {
    const headers = ['Email Address', 'Name', 'Board Member']
    const row = ['a@example.com', 'A', 'no']
    const rec = mapSheetRow(headers, row)
    expect(rec?.role).toBeNull()
  })
})
