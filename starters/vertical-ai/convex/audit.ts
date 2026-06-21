import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

export async function writeAuditEvent(
  ctx: MutationCtx,
  args: {
    organizationId: Id<'organizations'>
    actorUserId: Id<'users'>
    action: string
    sourceDraftId?: Id<'drafts'>
    domainRecordId?: Id<'domainRecords'>
  }
) {
  await ctx.db.insert('auditEvents', {
    ...args,
    createdAt: Date.now()
  })
}

