import { test, expect, vi, beforeEach } from 'vitest'

// Mock the auth + db + returnLoan seams the action composes, so we test the
// ACTION's gate + wiring (not returnLoan internals, which have their own tests).
const authMock = vi.fn()
const returnLoanMock = vi.fn()
const listMemberHistoryMock = vi.fn()

vi.mock('@/lib/auth', () => ({ auth: () => authMock(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: {} }))
vi.mock('@/lib/notify', () => ({ notifyOfficersCheckout: vi.fn() }))
vi.mock('@vercel/blob', () => ({ del: vi.fn() }))
vi.mock('@/lib/lending', async (orig) => {
  const actual = await (orig as any)()
  return { ...actual, returnLoan: (...a: any[]) => returnLoanMock(...a), listMemberHistory: (...a: any[]) => listMemberHistoryMock(...a) }
})

beforeEach(() => { authMock.mockReset(); returnLoanMock.mockReset(); listMemberHistoryMock.mockReset() })

test('boardReturnLoanAction: non-board caller is rejected before returnLoan runs', async () => {
  authMock.mockResolvedValue({ user: { memberId: 'm1', isBoard: false } })
  const { boardReturnLoanAction } = await import('./lending-actions')
  await expect(boardReturnLoanAction('loan1', { conditionIn: 'Good' })).rejects.toThrow('forbidden')
  expect(returnLoanMock).not.toHaveBeenCalled()
})

test('boardReturnLoanAction: board caller calls returnLoan with isBoard=true (can return any loan)', async () => {
  authMock.mockResolvedValue({ user: { memberId: 'boardId', isBoard: true } })
  returnLoanMock.mockResolvedValue({ ok: true })
  const { boardReturnLoanAction } = await import('./lending-actions')
  const r = await boardReturnLoanAction('someoneElsesLoan', { conditionIn: 'Fair' })
  expect(r).toEqual({ ok: true })
  // (loanId, actingMemberId, isBoard, cond)
  expect(returnLoanMock).toHaveBeenCalledWith('someoneElsesLoan', 'boardId', true, { conditionIn: 'Fair' })
})

test('listMemberHistoryAction: non-board rejected; board gets history', async () => {
  const { listMemberHistoryAction } = await import('./lending-actions')
  authMock.mockResolvedValue({ user: { memberId: 'm1', isBoard: false } })
  await expect(listMemberHistoryAction('m9')).rejects.toThrow('forbidden')
  authMock.mockResolvedValue({ user: { memberId: 'b', isBoard: true } })
  listMemberHistoryMock.mockResolvedValue([{ loanId: 'h1' }])
  const res = await listMemberHistoryAction('m9')
  expect(res).toEqual([{ loanId: 'h1' }])
  expect(listMemberHistoryMock).toHaveBeenCalledWith('m9')
})
