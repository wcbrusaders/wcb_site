import { describe, it, expect, vi } from 'vitest'
import { columnLetter, readMembersForMatching, writeRosterCells, moveRowToTab } from './roster'

describe('columnLetter', () => {
  it('single letters A..Z (0-based)', () => {
    expect(columnLetter(0)).toBe('A')
    expect(columnLetter(19)).toBe('T')  // roster's last column
    expect(columnLetter(25)).toBe('Z')
  })
  it('two letters past Z', () => {
    expect(columnLetter(26)).toBe('AA')
    expect(columnLetter(27)).toBe('AB')
  })
})

const CURRENT_HEADERS = ['Name', 'Tier', 'Email Address', 'Expires', 'Current', 'Google Email', 'Partner Email', 'Payment Emails']
const LAPSED_HEADERS = ['Name', 'Tier', 'Email Address', 'Expires', 'Google Email', 'Partner Email']

describe('readMembersForMatching', () => {
  it('reads Sheet1 + Lapsed, tags tab, collects+normalizes all email columns, drops blanks', async () => {
    const getTab = vi.fn(async (tabName: string) => {
      if (tabName === 'Sheet1') {
        return [
          CURRENT_HEADERS,
          ['Jane Doe', 'Full', 'Jane@Example.com', '2027-01-01', 'TRUE', 'jane.g@Gmail.com', 'partner@X.com', 'extra1@x.com, Extra2@X.com'],
          ['NoEmail', 'Full', '', '', 'TRUE', '', '', ''],
        ]
      }
      if (tabName === 'Lapsed Members') {
        return [
          LAPSED_HEADERS,
          ['Bob Smith', 'Full', 'bob@x.com', '2020-01-01', '', ''],
        ]
      }
      throw new Error(`unexpected tab ${tabName}`)
    })

    const members = await readMembersForMatching({ getTab })

    expect(members).toHaveLength(3)

    const jane = members.find((m) => m.name === 'Jane Doe')!
    expect(jane.rowNumber).toBe(2)
    expect(jane.tab).toBe('current')
    expect(jane.emails.sort()).toEqual(
      ['jane@example.com', 'jane.g@gmail.com', 'partner@x.com', 'extra1@x.com', 'extra2@x.com'].sort(),
    )

    const noEmail = members.find((m) => m.name === 'NoEmail')!
    expect(noEmail.rowNumber).toBe(3)
    expect(noEmail.tab).toBe('current')
    expect(noEmail.emails).toEqual([])

    const bob = members.find((m) => m.name === 'Bob Smith')!
    expect(bob.rowNumber).toBe(2)
    expect(bob.tab).toBe('lapsed')
    expect(bob.emails).toEqual(['bob@x.com'])
  })

  it('returns empty array for a tab with only headers (or no rows)', async () => {
    const getTab = vi.fn(async () => [CURRENT_HEADERS])
    const members = await readMembersForMatching({ getTab })
    expect(members).toEqual([])
  })
})

describe('writeRosterCells', () => {
  it('batch-writes named columns to the physical row on the given tab', async () => {
    const getTab = vi.fn(async (tabName: string) => {
      expect(tabName).toBe('Sheet1')
      return [CURRENT_HEADERS]
    })
    const batchWrite = vi.fn(async (_writes: Array<{ tabName: string; rowNumber: number; column: string; value: string }>) => {})

    await writeRosterCells('current', 5, { Expires: '2028-01-01', Tier: 'Full' }, { getTab, batchWrite })

    expect(batchWrite).toHaveBeenCalledTimes(1)
    const call = batchWrite.mock.calls[0][0]
    expect(call).toEqual(
      expect.arrayContaining([
        { tabName: 'Sheet1', rowNumber: 5, column: 'Expires', value: '2028-01-01' },
        { tabName: 'Sheet1', rowNumber: 5, column: 'Tier', value: 'Full' },
      ]),
    )
    expect(call).toHaveLength(2)
  })

  it('throws when a requested column is not present in the tab headers', async () => {
    const getTab = vi.fn(async () => [CURRENT_HEADERS])
    const batchWrite = vi.fn(async () => {})

    await expect(
      writeRosterCells('current', 5, { NotAColumn: 'x' }, { getTab, batchWrite }),
    ).rejects.toThrow(/NotAColumn/)
    expect(batchWrite).not.toHaveBeenCalled()
  })

  it('resolves the Lapsed Members tab name for tab "lapsed"', async () => {
    const getTab = vi.fn(async (tabName: string) => {
      expect(tabName).toBe('Lapsed Members')
      return [LAPSED_HEADERS]
    })
    const batchWrite = vi.fn(async () => {})

    await writeRosterCells('lapsed', 3, { Name: 'New Name' }, { getTab, batchWrite })

    expect(batchWrite).toHaveBeenCalledWith([{ tabName: 'Lapsed Members', rowNumber: 3, column: 'Name', value: 'New Name' }])
  })
})

describe('moveRowToTab', () => {
  it('appends the row values to toTab and deletes the row from fromTab, returning the new row number', async () => {
    const getTab = vi.fn(async (tabName: string) => {
      if (tabName === 'Sheet1') {
        return [
          CURRENT_HEADERS,
          ['Jane Doe', 'Full', 'jane@x.com', '2020-01-01', 'FALSE', '', '', ''],
        ]
      }
      if (tabName === 'Lapsed Members') {
        return [LAPSED_HEADERS, ['Existing', 'Full', 'existing@x.com', '2019-01-01', '', '']]
      }
      throw new Error(`unexpected tab ${tabName}`)
    })
    const appendRow = vi.fn(async (_tabName: string, _values: string[]) => 3)
    const deleteRow = vi.fn(async () => {})

    const newRow = await moveRowToTab('current', 2, 'lapsed', { getTab, appendRow, deleteRow })

    expect(appendRow).toHaveBeenCalledWith('Lapsed Members', ['Jane Doe', 'Full', 'jane@x.com', '2020-01-01', 'FALSE', '', '', ''])
    expect(deleteRow).toHaveBeenCalledWith('Sheet1', 2)
    expect(newRow).toBe(3)
  })

  it('moves from lapsed back to current (rejoin)', async () => {
    const getTab = vi.fn(async (tabName: string) => {
      if (tabName === 'Lapsed Members') {
        return [LAPSED_HEADERS, ['Bob', 'Full', 'bob@x.com', '2020-01-01', '', '']]
      }
      if (tabName === 'Sheet1') {
        return [CURRENT_HEADERS]
      }
      throw new Error(`unexpected tab ${tabName}`)
    })
    const appendRow = vi.fn(async () => 2)
    const deleteRow = vi.fn(async () => {})

    const newRow = await moveRowToTab('lapsed', 2, 'current', { getTab, appendRow, deleteRow })

    expect(appendRow).toHaveBeenCalledWith('Sheet1', ['Bob', 'Full', 'bob@x.com', '2020-01-01', '', ''])
    expect(deleteRow).toHaveBeenCalledWith('Lapsed Members', 2)
    expect(newRow).toBe(2)
  })
})
