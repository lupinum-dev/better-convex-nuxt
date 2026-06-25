import type { Infer } from 'convex/values'

import type { MutationCtx } from '../_generated/server'
import type { auditAction, auditActor, auditResourceType, auditSource } from '../schema'

export type AuditAction = Infer<typeof auditAction>
export type AuditActor = Infer<typeof auditActor>
export type AuditResourceType = Infer<typeof auditResourceType>
export type AuditSource = Infer<typeof auditSource>

export async function writeAuditEvent(
  ctx: MutationCtx,
  event: {
    organizationId: string
    teamId?: string
    actor: AuditActor
    action: AuditAction
    resourceType: AuditResourceType
    source?: AuditSource
    resourceId?: string
    summary?: string
    createdAt: number
  },
) {
  return await ctx.db.insert('auditEvents', {
    ...event,
    source: event.source ?? 'ui',
    summary: event.summary?.trim() || undefined,
  })
}
