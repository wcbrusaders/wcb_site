import { prisma } from './db'

export type AuditEntry = {
  actorMemberId?: string | null
  actorEmail: string
  action: string
  targetMemberId?: string | null
  targetLabel?: string | null
  detail?: string | null
}

export async function recordAudit(entry: AuditEntry, db = prisma): Promise<void> {
  await db.auditLog.create({
    data: {
      actorMemberId: entry.actorMemberId ?? null,
      actorEmail: entry.actorEmail,
      action: entry.action,
      targetMemberId: entry.targetMemberId ?? null,
      targetLabel: entry.targetLabel ?? null,
      detail: entry.detail ?? null,
    },
  })
}

export function formatAudit(action: string, targetLabel: string | null, detail: string | null): string {
  let s = action
  if (targetLabel) s += ` → ${targetLabel}`
  if (detail) s += `: ${detail}`
  return s
}
