'use server'

import { auth } from '@/lib/auth'
import { getMembershipReports } from '@/lib/metrics'
import { generateInsights } from '@/lib/metrics/insights'

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
