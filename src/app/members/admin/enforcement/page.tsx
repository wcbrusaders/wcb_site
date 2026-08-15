import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { tallyVotes, isExpired, type VoteValue } from '@/lib/enforcement'
import { EnforcementPanel } from '@/components/members/EnforcementPanel'

export const dynamic = 'force-dynamic'

export default async function EnforcementPage() {
  const session = await auth()
  if (!session?.user?.memberId) redirect('/login')
  if (!session.user.isBoard) redirect('/members')

  const now = new Date()
  const cases = await prisma.enforcementCase.findMany({ where: { status: 'open' }, include: { votes: true }, orderBy: { createdAt: 'desc' } })
  const view = cases.map((c) => {
    const tally = tallyVotes(c.votes.map((v) => v.vote as VoteValue))
    return {
      id: c.id, kind: c.kind, subjectLabel: c.subjectLabel, subjectMemberId: c.subjectMemberId,
      eligibleBoardCount: c.eligibleBoardCount, decisionDueAt: c.decisionDueAt.toISOString(),
      expired: isExpired(c.decisionDueAt, now), tally,
      myVote: c.votes.find((v) => v.voterMemberId === session.user!.memberId)?.vote ?? null,
    }
  })
  // candidate members to open a case against (current, not already banned)
  const members = await prisma.member.findMany({ where: { current: true }, select: { id: true, name: true, status: true }, orderBy: { name: 'asc' } })

  // members currently suspended/banned/interim — candidates to reinstate
  const nonActive = await prisma.member.findMany({
    where: { status: { not: 'active' } },
    select: { id: true, name: true, status: true, statusUntil: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <h1 className="text-2xl font-bold">Enforcement</h1>
      <p className="text-foreground/50 text-sm mt-1">Board only. Interim freeze is one-key; removal needs quorum of 3 and two-thirds of votes cast.</p>
      <EnforcementPanel
        cases={view}
        members={members.map((m) => ({ id: m.id, name: m.name ?? '(no name)', status: m.status }))}
        nonActiveMembers={nonActive.map((m) => ({
          id: m.id,
          name: m.name ?? '(no name)',
          status: m.status,
          statusUntil: m.statusUntil ? m.statusUntil.toISOString() : null,
        }))}
      />
    </div>
  )
}
