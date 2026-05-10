import { deny } from '@lupinum/trellis/auth'

import { processTodoSyncWebhook as processTodoSyncWebhookContract } from '../../../shared/features/todos/contract'
import type { Id } from '../../_generated/dataModel'
import { ensureNotProcessed, markProcessed } from '../../auth/idempotency'
import { mutation } from '../../functions'
import { todoCreate } from './permissions'

export const processTodoSyncWebhookMutation = mutation.protected({
  args: processTodoSyncWebhookContract.args,
  guard: todoCreate,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    if (!actor?.tenantId || actor.tenantId !== (args.workspaceId as Id<'workspaces'>)) {
      throw deny('Not available.')
    }

    await ensureNotProcessed(ctx.db, 'webhook', args.eventId)

    const todoId = await ctx.db.insert('todos', {
      title: args.title,
      completed: args.completed ?? false,
      ownerId: actor.userId,
      workspaceId: args.workspaceId,
      source: 'webhook',
      externalId: args.externalId,
      createdAt: Date.now(),
    })

    await markProcessed(ctx.db, args.eventId, 'webhook')

    return todoId
  },
})
