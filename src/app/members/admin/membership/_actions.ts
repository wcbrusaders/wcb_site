'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getMembershipReports } from '@/lib/metrics'
import { generateInsights } from '@/lib/metrics/insights'
import { LAPSE_REASONS } from '@/lib/metrics/lapsed'

/**
 * On-demand "Generate insights" action for the board-only membership reports
 * page. Re-checks board status server-side — never trust the client, even
 * though the page itself is already gated. Runs Claude over the already-
 * computed aggregate metrics (see generateInsights's PII wall) and returns
 * plain text. Cost is incurred only on click.
 */
export async function generateInsightsAction(): Promise<
  { ok: true; text: string } | { ok: false; error: string }
> {
  const s = await auth()
  if (!s?.user?.isBoard || !s.user.email) return { ok: false, error: 'Not authorized' }

  const reports = await getMembershipReports()
  // generateInsights is fail-soft and already returns the { ok, text } | { ok, error }
  // shape — pass it straight through so the UI can distinguish a real insight
  // from an AI failure (previously a failure came back as ok:true fake text).
  return generateInsights(reports, {})
}

/**
 * Record (or clear) why a lapsed member left — board-only. Writes ONLY the two
 * site-owned fields (lapseReason/lapseNote); never the sheet-synced columns, so
 * the next roster sync can't clobber this. Re-checks board server-side.
 *
 * reason must be one of LAPSE_REASONS (or '' to clear); note is free text
 * (trimmed, capped, '' clears). memberId is the Member.id cuid.
 */
export async function setLapseReason(
  memberId: string,
  reason: string,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await auth()
  if (!s?.user?.isBoard || !s.user.email) return { ok: false, error: 'Not authorized' }

  if (!memberId) return { ok: false, error: 'Missing member' }
  if (reason !== '' && !(LAPSE_REASONS as readonly string[]).includes(reason)) {
    return { ok: false, error: 'Invalid reason' }
  }

  const cleanNote = note.trim().slice(0, 500)

  try {
    // Only lapsed/former members are eligible — guard so a stray/bad id can't
    // annotate an active member. `updateMany` with the state filter makes it a
    // no-op (count 0) rather than an error if the member isn't lapsed.
    const res = await prisma.member.updateMany({
      where: { id: memberId, membershipState: { in: ['lapsed', 'former'] } },
      data: {
        lapseReason: reason === '' ? null : reason,
        lapseNote: cleanNote === '' ? null : cleanNote,
      },
    })
    if (res.count === 0) return { ok: false, error: 'Member not found or not lapsed' }
  } catch {
    return { ok: false, error: "Couldn't save — try again." }
  }

  revalidatePath('/members/admin/membership')
  return { ok: true }
}
