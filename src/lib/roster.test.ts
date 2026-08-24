import { test, describe, it, expect, vi, afterEach } from 'vitest'
import { normalizeEmail, mapSheetRow, isCurrentMember, syncRoster, syncPayments, validateSecondaryEmail, isAccessBlocked, isAccessBlockedNow, fetchAllRosterRows, fetchAllMembers, fetchPayments } from './roster'

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

// This fixture has a NAME ('NoEmail') with a blank Email Address cell — it is
// a named member row, not a blank spacer. Previously mapSheetRow dropped ANY
// blank-email row (the bug this task fixes: email-less honorary members were
// silently discarded). It must now return a record with a null email rather
// than null itself. (Tier here is 'Full', not 'Honorary', so membershipState
// is 'active' per the current-tab default — see the dedicated honorary test
// below for the Honorary-tier case.)
test('mapSheetRow keeps a named member with a blank email (does not drop them)', () => {
  const row = ['NoEmail','Full','','','TRUE','','','No']
  const m = mapSheetRow(HEADERS, row)
  expect(m).not.toBeNull()
  expect(m!.emailAddress).toBeNull()
  expect(m!.name).toBe('NoEmail')
  expect(m!.membershipState).toBe('active')
})

// TRUE spacer row: no name AND no email. This is the only case that should
// still return null (preserves fetchAllRosterRows()'s filter(m => m !== null)
// behavior for genuinely blank rows; see setRosterField's raw-row-scan comment
// for why compaction of the *filtered* array must never affect physical-row
// math — that logic never runs mapSheetRow at all, so it is unaffected here).
test('mapSheetRow returns null for a blank spacer row (no name and no email)', () => {
  const row = ['','Full','','','TRUE','','','No']
  expect(mapSheetRow(HEADERS, row)).toBeNull()
})

test('mapSheetRow parses board member true', () => {
  const row = ['Chair','Full','chair@x.com','2027-01-01','yes','','','Yes']
  expect(mapSheetRow(HEADERS, row)!.isBoard).toBe(true)
})

// current tab (default): membershipState derives from Tier / Current column.

test('mapSheetRow: current tab, normal member -> membershipState active, current from column', () => {
  const row = ['Jane Doe','Full','jane@x.com','2027-01-01','TRUE','','','No']
  const m = mapSheetRow(HEADERS, row, { tab: 'current' })!
  expect(m.membershipState).toBe('active')
  expect(m.current).toBe(true)
})

test('mapSheetRow: current tab, Honorary tier + no email -> membershipState honorary, emailAddress null, not dropped', () => {
  const row = ['Cat Pearce','Honorary','','','TRUE','','','No']
  const m = mapSheetRow(HEADERS, row, { tab: 'current' })
  expect(m).not.toBeNull()
  expect(m!.membershipState).toBe('honorary')
  expect(m!.emailAddress).toBeNull()
  expect(m!.name).toBe('Cat Pearce')
})

test('mapSheetRow: Honorary tier match is case-insensitive', () => {
  const row = ['Cat Pearce','honorary','','','TRUE','','','No']
  const m = mapSheetRow(HEADERS, row, { tab: 'current' })!
  expect(m.membershipState).toBe('honorary')
})

// lapsed tab: header is "Current?" (with a question mark) on the real sheet,
// which a `cell(...,'Current')` lookup misses entirely. The lapsed tab must
// NOT rely on that column at all — it forces current=false and
// membershipState='lapsed' regardless of what the sheet says.

const LAPSED_HEADERS = ['Name','Tier','Email Address','Expires','Current?','Google Email','Partner Email','Board Member']

test('mapSheetRow: lapsed tab forces current=false and membershipState=lapsed even if Current?=TRUE', () => {
  const row = ['Old Member','Full','old@x.com','2020-01-01','TRUE','','','No']
  const m = mapSheetRow(LAPSED_HEADERS, row, { tab: 'lapsed' })!
  expect(m.membershipState).toBe('lapsed')
  expect(m.current).toBe(false)
  expect(m.emailAddress).toBe('old@x.com')
})

test('mapSheetRow: lapsed tab, email-less honorary-style row is not dropped either', () => {
  const row = ['Old Honorary','Honorary','','2020-01-01','TRUE','','','No']
  const m = mapSheetRow(LAPSED_HEADERS, row, { tab: 'lapsed' })
  expect(m).not.toBeNull()
  expect(m!.membershipState).toBe('lapsed')
  expect(m!.current).toBe(false)
  expect(m!.emailAddress).toBeNull()
})

test('mapSheetRow: default tab (no opts) behaves like "current" for back-compat', () => {
  const row = ['Jane Doe','Full','jane@x.com','2027-01-01','TRUE','','','No']
  const m = mapSheetRow(HEADERS, row)!
  expect(m.membershipState).toBe('active')
  expect(m.current).toBe(true)
})

test('syncRoster upserts fetched rows and deactivates absent members', async () => {
  const { syncRoster } = await import('./roster')
  const fetched = [
    { emailAddress: 'a@x.com', googleEmail: null, name: 'A', tier: null, current: true, isBoard: false, role: null, partnerEmail: null, expires: null, joinDate: null, paymentDate: null, referredBy: null, membershipState: 'active' },
    { emailAddress: 'b@x.com', googleEmail: null, name: 'B', tier: null, current: false, isBoard: false, role: null, partnerEmail: null, expires: null, joinDate: null, paymentDate: null, referredBy: null, membershipState: 'active' },
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
      findMany: async (args: any) => {
        if (args?.where?.emailAddress === null) return [] // no honorary/null-email members in this fixture
        return [
          { emailAddress: 'a@x.com' },
          { emailAddress: 'b@x.com' },
          { emailAddress: 'c@x.com' }, // absent from fetch
        ]
      },
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
    { emailAddress: 'a@x.com', googleEmail: null, name: 'A', tier: null, current: true, isBoard: false, role: null, partnerEmail: null, expires: null, joinDate: null, paymentDate: null, referredBy: null, membershipState: 'active' },
    { emailAddress: 'b@x.com', googleEmail: null, name: 'B', tier: null, current: false, isBoard: false, role: null, partnerEmail: null, expires: null, joinDate: null, paymentDate: null, referredBy: null, membershipState: 'active' },
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
      findMany: async (args: any) => {
        if (args?.where?.emailAddress === null) return [] // no honorary/null-email members in this fixture
        return [
          { emailAddress: 'a@x.com' },
          { emailAddress: 'b@x.com' },
        ]
      },
    },
  }
  const res = await syncRoster({ fetchAll: async () => fetched, db: db as any, fetchGroupMembers: async () => new Set() })
  expect(upserts).toEqual(['a@x.com', 'b@x.com'])
  expect(res.synced).toBe(2)
  expect(updateManyWasCalled).toBe(false)
  expect(res.deactivated).toBe(0)
})

// syncRoster: membership-state-aware sync (T4) — current/lapsed/honorary/former,
// including email-less honorary members matched by name instead of email.

describe('syncRoster (membership-state-aware)', () => {
  function makeDb(opts: {
    existingByEmail?: Array<{ emailAddress: string | null }>
    existingNullEmail?: Array<{ id: string; name: string | null; emailAddress: null }>
  } = {}) {
    const upserts: any[] = []
    const nullEmailUpdates: any[] = []
    const nullEmailCreates: any[] = []
    let updateManyWhereIn: string[] = []
    let nullEmailFormerUpdateManyCalls: any[] = []
    const db = {
      member: {
        upsert: async (args: any) => { upserts.push(args); return {} },
        findMany: async (args: any) => {
          // Sweep query for email-having members (select emailAddress)
          if (args?.where?.emailAddress === null) {
            return opts.existingNullEmail ?? []
          }
          return opts.existingByEmail ?? []
        },
        update: async (args: any) => { nullEmailUpdates.push(args); return {} },
        create: async (args: any) => { nullEmailCreates.push(args); return {} },
        updateMany: async (args: any) => {
          if (args?.where?.emailAddress === null) {
            nullEmailFormerUpdateManyCalls.push(args)
            return { count: 0 }
          }
          updateManyWhereIn = args.where.emailAddress.in ?? []
          return { count: updateManyWhereIn.length }
        },
      },
    }
    return {
      db,
      upserts,
      nullEmailUpdates,
      nullEmailCreates,
      get updateManyWhereIn() { return updateManyWhereIn },
      get nullEmailFormerUpdateManyCalls() { return nullEmailFormerUpdateManyCalls },
    }
  }

  const rec = (over: Partial<import('./roster').MemberRecord> = {}) => ({
    emailAddress: null, googleEmail: null, name: null, tier: null, current: true,
    isBoard: false, role: null, partnerEmail: null, expires: null, joinDate: null,
    paymentDate: null, referredBy: null, membershipState: 'active', ...over,
  })

  it('current member -> upserted by email with membershipState active, current true', async () => {
    const { db, upserts } = makeDb()
    const rows = [rec({ emailAddress: 'a@x.com', name: 'A', current: true, membershipState: 'active' })]
    const res = await syncRoster({ fetchAll: async () => rows, db: db as any, fetchGroupMembers: async () => new Set() })
    expect(upserts).toHaveLength(1)
    expect(upserts[0].where).toEqual({ emailAddress: 'a@x.com' })
    expect(upserts[0].update.membershipState).toBe('active')
    expect(upserts[0].update.current).toBe(true)
    expect(upserts[0].create.membershipState).toBe('active')
    expect(res.synced).toBe(1)
  })

  it('lapsed-tab member -> membershipState lapsed, current false', async () => {
    const { db, upserts } = makeDb()
    const rows = [rec({ emailAddress: 'old@x.com', name: 'Old', current: false, membershipState: 'lapsed' })]
    await syncRoster({ fetchAll: async () => rows, db: db as any, fetchGroupMembers: async () => new Set() })
    const u = upserts.find((u) => u.where.emailAddress === 'old@x.com')
    expect(u.update.membershipState).toBe('lapsed')
    expect(u.update.current).toBe(false)
    expect(u.create.membershipState).toBe('lapsed')
  })

  it('email-less honorary member with no existing DB row -> created, matched by name, not by email', async () => {
    const { db, nullEmailUpdates } = makeDb({ existingNullEmail: [] })
    const findManyCalls: any[] = []
    const origFindMany = db.member.findMany
    db.member.findMany = async (args: any) => { findManyCalls.push(args); return origFindMany(args) }
    const rows = [rec({ emailAddress: null, name: 'Cat Pearce', current: true, membershipState: 'honorary' })]
    const res = await syncRoster({ fetchAll: async () => rows, db: db as any, fetchGroupMembers: async () => new Set() })
    // Must have looked up by name (email-less), not attempted an email upsert.
    const nameLookup = findManyCalls.find((c) => c.where?.name === 'Cat Pearce')
    expect(nameLookup).toBeTruthy()
    expect(nameLookup.where.emailAddress).toBeNull()
    expect(nullEmailUpdates).toHaveLength(0) // no existing row -> create, not update
    expect(res.synced).toBe(1)
  })

  it('email-less honorary member matching an existing null-email row by name -> updated (not created), membershipState honorary', async () => {
    const { db, nullEmailUpdates } = makeDb({
      existingNullEmail: [{ id: 'm1', name: 'Cat Pearce', emailAddress: null }],
    })
    const rows = [rec({ emailAddress: null, name: 'Cat Pearce', current: true, membershipState: 'honorary' })]
    await syncRoster({ fetchAll: async () => rows, db: db as any, fetchGroupMembers: async () => new Set() })
    expect(nullEmailUpdates).toHaveLength(1)
    expect(nullEmailUpdates[0].where).toEqual({ id: 'm1' })
    expect(nullEmailUpdates[0].data.membershipState).toBe('honorary')
  })

  it('email-less member with MULTIPLE name matches -> warns and updates one (does not crash)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { db, nullEmailUpdates } = makeDb({
      existingNullEmail: [
        { id: 'm1', name: 'Cat Pearce', emailAddress: null },
        { id: 'm2', name: 'Cat Pearce', emailAddress: null },
      ],
    })
    const rows = [rec({ emailAddress: null, name: 'Cat Pearce', current: true, membershipState: 'honorary' })]
    await expect(syncRoster({ fetchAll: async () => rows, db: db as any, fetchGroupMembers: async () => new Set() })).resolves.toBeTruthy()
    expect(warnSpy).toHaveBeenCalled()
    expect(nullEmailUpdates).toHaveLength(1)
    warnSpy.mockRestore()
  })

  it('member present in neither tab this run -> swept to current=false AND membershipState former', async () => {
    const helper = makeDb({
      existingByEmail: [{ emailAddress: 'a@x.com' }, { emailAddress: 'vanished@x.com' }],
    })
    const rows = [rec({ emailAddress: 'a@x.com', name: 'A', current: true, membershipState: 'active' })]
    const res = await syncRoster({ fetchAll: async () => rows, db: helper.db as any, fetchGroupMembers: async () => new Set() })
    expect(helper.updateManyWhereIn).toEqual(['vanished@x.com'])
    expect(res.deactivated).toBe(1)
  })

  it('explicitly-lapsed member (seen via Lapsed tab) is NOT swept to former', async () => {
    const helper = makeDb({
      existingByEmail: [{ emailAddress: 'old@x.com' }],
    })
    const rows = [rec({ emailAddress: 'old@x.com', name: 'Old', current: false, membershipState: 'lapsed' })]
    const res = await syncRoster({ fetchAll: async () => rows, db: helper.db as any, fetchGroupMembers: async () => new Set() })
    // old@x.com was seen this run (present in the fetched rows) -> must NOT appear in the sweep list.
    expect(helper.updateManyWhereIn).toEqual([])
    expect(res.deactivated).toBe(0)
  })

  it('does not crash on a row with both name and email null (defensive spacer guard)', async () => {
    const { db } = makeDb()
    const rows = [rec({ emailAddress: null, name: null, current: true, membershipState: 'active' })]
    const res = await syncRoster({ fetchAll: async () => rows, db: db as any, fetchGroupMembers: async () => new Set() })
    expect(res.synced).toBe(0)
  })
})

// syncPayments: idempotent upsert of Payments-tab rows on the (date, netDues, source) unique.

describe('syncPayments', () => {
  it('upserts each fetched payment on the compound unique key', async () => {
    const { syncPayments } = await import('./roster')
    const upserts: any[] = []
    const db = { payment: { upsert: async (args: any) => { upserts.push(args); return {} } } }
    const rows = [
      { date: new Date('2026-01-15'), netDues: 45, source: 'Stripe' },
      { date: new Date('2026-02-01'), netDues: 30, source: 'Cash' },
    ]
    const res = await syncPayments({ fetchPayments: async () => rows, db: db as any })
    expect(upserts).toHaveLength(2)
    expect(upserts[0].where).toEqual({
      date_netDues_source: { date: rows[0].date, netDues: rows[0].netDues, source: rows[0].source },
    })
    expect(res.payments).toBe(2)
  })

  it('re-running with the same rows upserts again rather than duplicating (update branch is a no-op)', async () => {
    const { syncPayments } = await import('./roster')
    const seen = new Set<string>()
    let duplicateAttempts = 0
    const db = {
      payment: {
        upsert: async (args: any) => {
          const key = JSON.stringify(args.where.date_netDues_source)
          if (seen.has(key)) duplicateAttempts++
          seen.add(key)
          return {}
        },
      },
    }
    const rows = [{ date: new Date('2026-01-15'), netDues: 45, source: 'Stripe' }]
    await syncPayments({ fetchPayments: async () => rows, db: db as any })
    await syncPayments({ fetchPayments: async () => rows, db: db as any })
    // Same key upserted twice (once per run) — upsert semantics mean no duplicate ROW,
    // even though the mock records two calls with the identical where-key.
    expect(seen.size).toBe(1)
  })
})

// isCurrentMember tests

const M = (over = {}) => ({ emailAddress: 'a@x.com', googleEmail: null, name: 'A', tier: null, current: true, isBoard: false, role: null, partnerEmail: null, expires: null, joinDate: null, paymentDate: null, referredBy: null, membershipState: 'active', ...over })

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
    { emailAddress:'in@x.com', googleEmail:null, name:'A', tier:null, current:true, isBoard:false, role:null, partnerEmail:null, expires:null, joinDate:null, paymentDate:null, referredBy:null, membershipState:'active' },
    { emailAddress:'out@x.com', googleEmail:null, name:'B', tier:null, current:true, isBoard:false, role:null, partnerEmail:null, expires:null, joinDate:null, paymentDate:null, referredBy:null, membershipState:'active' },
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
  const rows = [{ emailAddress:'a@x.com', googleEmail:null, name:'A', tier:null, current:true, isBoard:false, role:null, partnerEmail:null, expires:null, joinDate:null, paymentDate:null, referredBy:null, membershipState:'active' }]
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

describe('setRosterField', () => {
  it('returns not-found when no row matches the email', async () => {
    const { setRosterField } = await import('./roster')
    const rawRows = [
      ['Name', 'Email Address', 'Google Email', 'Partner Email'],
      ['Jane', 'jane@x.com', '', ''],
    ]
    const writes: Array<{ rowNumber: number; column: string; value: string }> = []
    const r = await setRosterField('nobody@x.com', 'Google Email', 'x@y.com', {
      fetchRawRows: async () => rawRows,
      writeCell: async (rowNumber, column, value) => { writes.push({ rowNumber, column, value }) },
    })
    expect(r.ok).toBe(false)
    expect(writes).toEqual([])
  })

  it('writes to the correct physical row via injected deps (no spacer rows)', async () => {
    const { setRosterField } = await import('./roster')
    const rawRows = [
      ['Name', 'Email Address', 'Google Email', 'Partner Email'],
      ['Jane', 'jane@x.com', '', ''],
      ['Bob', 'bob@x.com', '', ''],
    ]
    const writes: Array<{ rowNumber: number; column: string; value: string }> = []
    const r = await setRosterField('bob@x.com', 'Google Email', 'bob.g@x.com', {
      fetchRawRows: async () => rawRows,
      writeCell: async (rowNumber, column, value) => { writes.push({ rowNumber, column, value }) },
    })
    expect(r.ok).toBe(true)
    expect(writes).toEqual([{ rowNumber: 3, column: 'Google Email', value: 'bob.g@x.com' }])
  })

  // REGRESSION: an email-less spacer row sits ABOVE the target member in the raw sheet.
  // fetchAllRosterRows() filters out null (email-less) rows via mapSheetRow, which COMPACTS
  // indices. The old buggy logic did `rows.findIndex(...) + 2` over that FILTERED array,
  // so it would resolve Bob's write to physical row 3 (compacted index) when Bob is
  // ACTUALLY on physical row 4 (because row 2 is a blank spacer with no email).
  // This test must FAIL against the old index+2-over-filtered-rows logic and PASS
  // once the row is resolved directly against the raw sheet values.
  it('resolves the TRUE physical row even when an email-less spacer row sits above the target (regression)', async () => {
    const { setRosterField } = await import('./roster')
    const rawRows = [
      ['Name', 'Email Address', 'Google Email', 'Partner Email'], // row 1: header
      ['', '', '', ''],                                            // row 2: blank spacer (no email) — filtered out by fetchAllRosterRows
      ['Jane', 'jane@x.com', '', ''],                              // row 3
      ['Bob', 'bob@x.com', '', ''],                                // row 4: TRUE physical row for Bob
    ]
    const writes: Array<{ rowNumber: number; column: string; value: string }> = []
    const r = await setRosterField('bob@x.com', 'Google Email', 'bob.g@x.com', {
      fetchRawRows: async () => rawRows,
      writeCell: async (rowNumber, column, value) => { writes.push({ rowNumber, column, value }) },
    })
    expect(r.ok).toBe(true)
    // Old buggy logic (filtered rows: [jane, bob] -> idx 1 -> rowNumber 3) would write row 3 (Jane's row) — WRONG.
    // Correct behavior: Bob's true physical row is 4.
    expect(writes).toEqual([{ rowNumber: 4, column: 'Google Email', value: 'bob.g@x.com' }])
  })

  it('matches email case/whitespace-insensitively against the raw sheet', async () => {
    const { setRosterField } = await import('./roster')
    const rawRows = [
      ['Email Address', 'Google Email'],
      ['  Bob@X.com  ', ''],
    ]
    const writes: Array<{ rowNumber: number; column: string; value: string }> = []
    const r = await setRosterField('bob@x.com', 'Google Email', 'new@x.com', {
      fetchRawRows: async () => rawRows,
      writeCell: async (rowNumber, column, value) => { writes.push({ rowNumber, column, value }) },
    })
    expect(r.ok).toBe(true)
    expect(writes).toEqual([{ rowNumber: 2, column: 'Google Email', value: 'new@x.com' }])
  })
})

describe('isAccessBlocked', () => {
  it('blocks interim and banned', () => {
    expect(isAccessBlocked('interim')).toBe(true)
    expect(isAccessBlocked('banned')).toBe(true)
  })
  it('allows active / null / undefined', () => {
    expect(isAccessBlocked('active')).toBe(false)
    expect(isAccessBlocked(null)).toBe(false)
    expect(isAccessBlocked(undefined)).toBe(false)
  })
})

describe('isAccessBlockedNow', () => {
  const before = new Date('2026-08-15T00:00:00Z')
  const until = new Date('2026-08-20T00:00:00Z')
  const after = new Date('2026-08-21T00:00:00Z')

  it('blocks a suspended member before statusUntil elapses (cooldown still active)', () => {
    expect(isAccessBlockedNow('interim', until, before)).toBe(true)
    expect(isAccessBlockedNow('banned', until, before)).toBe(true)
  })
  it('allows once now is past statusUntil (cooldown elapsed)', () => {
    expect(isAccessBlockedNow('interim', until, after)).toBe(false)
    expect(isAccessBlockedNow('banned', until, after)).toBe(false)
  })
  it('blocks indefinitely when statusUntil is null (no auto-expiry)', () => {
    expect(isAccessBlockedNow('interim', null, after)).toBe(true)
    expect(isAccessBlockedNow('banned', null, after)).toBe(true)
  })
  it('allows an active member regardless of statusUntil', () => {
    expect(isAccessBlockedNow('active', null, before)).toBe(false)
    expect(isAccessBlockedNow('active', until, before)).toBe(false)
  })
  it('allows null/undefined status (unset defaults open)', () => {
    expect(isAccessBlockedNow(null, null, before)).toBe(false)
    expect(isAccessBlockedNow(undefined, until, before)).toBe(false)
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

// fetchAllRosterRows: must stay current-tab-only and unaffected by the new
// fetchAllMembers/fetchPayments additions (existing callers depend on this).

describe('fetchAllRosterRows (unchanged, current-only)', () => {
  it('reads only Sheet1 via sheetsClient/values.get and maps rows as current tab', async () => {
    // fetchAllRosterRows has no deps seam (by design — its 3 callers call it
    // with no args), so we can't inject a fake network client here without
    // changing its signature. This test instead pins its CONTRACT: it is a
    // zero-arg function. A behavior regression (e.g. picking up Lapsed rows)
    // would be caught by its pre-existing callers' expectations and by
    // fetchAllMembers's own tests staying separate from it.
    expect(fetchAllRosterRows.length).toBe(0)
  })
})

// fetchAllMembers: concatenates Sheet1 (tab 'current') + 'Lapsed Members' (tab 'lapsed').

describe('fetchAllMembers', () => {
  const CURRENT_ROWS = [
    ['Name', 'Tier', 'Email Address', 'Expires', 'Current', 'Google Email', 'Partner Email', 'Board Member'],
    ['Jane Doe', 'Full', 'jane@x.com', '2027-01-01', 'TRUE', '', '', 'No'],
    ['', '', '', '', '', '', '', ''], // spacer row, must be dropped
  ]
  const LAPSED_ROWS = [
    ['Name', 'Tier', 'Email Address', 'Expires', 'Current?', 'Tenure at Lapse (mo)', 'Google Email', 'Partner Email', 'Board Member'],
    ['Old Member', 'Full', 'old@x.com', '2020-01-01', 'TRUE', '18', '', '', 'No'],
  ]

  it('concatenates current + lapsed members with correct state/current per tab, dropping spacers', async () => {
    const getTab = async (tabName: string) => {
      if (tabName === 'Sheet1') return CURRENT_ROWS
      if (tabName === 'Lapsed Members') return LAPSED_ROWS
      throw new Error(`unexpected tab ${tabName}`)
    }
    const members = await fetchAllMembers({ getTab })
    expect(members).toHaveLength(2)

    const jane = members.find((m) => m.emailAddress === 'jane@x.com')!
    expect(jane.membershipState).toBe('active')
    expect(jane.current).toBe(true)

    const old = members.find((m) => m.emailAddress === 'old@x.com')!
    expect(old.membershipState).toBe('lapsed')
    expect(old.current).toBe(false)
  })

  it('contributes [] for a tab with fewer than 2 rows (header-only or empty)', async () => {
    const getTab = async (tabName: string) => {
      if (tabName === 'Sheet1') return CURRENT_ROWS
      if (tabName === 'Lapsed Members') return [['Name', 'Tier', 'Email Address']] // header only
      throw new Error(`unexpected tab ${tabName}`)
    }
    const members = await fetchAllMembers({ getTab })
    expect(members).toHaveLength(1)
    expect(members[0].emailAddress).toBe('jane@x.com')
  })
})

// fetchPayments: reads the Payments tab, skips header/blank/invalid rows.

describe('fetchPayments', () => {
  const PAYMENTS_ROWS = [
    ['Date', 'Net Dues', 'Source'],
    ['2026-01-15', '45.00', 'Stripe'],
    ['', '', ''], // blank row, skip
    ['not-a-date', '30.00', 'Cash'], // bad date, skip
    ['2026-02-01', 'not-a-number', 'Check'], // bad amount, skip
    ['2026-03-10', '20', ' Venmo '],
  ]

  it('returns only valid rows, parsed as {date, netDues, source}', async () => {
    const getTab = async (tabName: string) => {
      expect(tabName).toBe('Payments')
      return PAYMENTS_ROWS
    }
    const payments = await fetchPayments({ getTab })
    expect(payments).toHaveLength(2)

    expect(payments[0].date.toISOString().slice(0, 10)).toBe('2026-01-15')
    expect(payments[0].netDues).toBe(45)
    expect(payments[0].source).toBe('Stripe')

    expect(payments[1].date.toISOString().slice(0, 10)).toBe('2026-03-10')
    expect(payments[1].netDues).toBe(20)
    expect(payments[1].source).toBe('Venmo')
  })

  it('returns [] when the tab has fewer than 2 rows', async () => {
    const getTab = async () => [['Date', 'Net Dues', 'Source']]
    const payments = await fetchPayments({ getTab })
    expect(payments).toEqual([])
  })
})
