import { prisma } from '@/lib/db'

export type GovernanceSlug = 'bylaws' | 'code-of-conduct'

export interface Governance {
  title: string
  bodyHtml: string
}

// Governance rows live in the shared Article table (kind='governance'). Article
// has no `status` column — a row's existence is its publish state (drafts live
// in the separate DraftArticle table) — so this is a plain lookup, no filter.
export async function getGovernance(slug: GovernanceSlug): Promise<Governance | null> {
  const article = await prisma.article.findFirst({ where: { slug, kind: 'governance' } })
  if (!article) return null
  return { title: article.title, bodyHtml: article.bodyHtml }
}
