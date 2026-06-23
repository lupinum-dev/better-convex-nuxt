import type { Infer } from 'convex/values'

import type { MutationCtx } from '../_generated/server'
import { auditAction, auditActor, auditResourceType } from '../schema'

export type AuditAction = Infer<typeof auditAction>
export type AuditActor = Infer<typeof auditActor>
export type AuditResourceType = Infer<typeof auditResourceType>

export async function writeAuditEvent(
  ctx: MutationCtx,
  event: {
    organizationId: string
    teamId?: string
    actor: AuditActor
    action: AuditAction
    resourceType: AuditResourceType
    resourceId?: string
    summary?: string
    createdAt: number
  },
) {
  return await ctx.db.insert('auditEvents', {
    ...event,
    summary: event.summary?.trim() || undefined,
  })
}
