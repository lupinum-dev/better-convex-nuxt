import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

export async function writeAuditEvent(
  ctx: MutationCtx,
  args: {
    organizationId: Id<'organizations'>
    actorUserId: Id<'users'>
    accessPath: 'direct' | 'delegated'
    action: string
    resourceType: string
    resourceId?: string
  }
) {
  await ctx.db.insert('auditEvents', {
    ...args,
    createdAt: Date.now()
  })
}

