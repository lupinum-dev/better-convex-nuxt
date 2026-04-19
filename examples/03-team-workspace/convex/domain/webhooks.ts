/**
 * Why this file exists:
 * Webhooks are a separate auth path. They resolve to a bot user and are forced through the same
 * todo permission guards as browser callers. Idempotency prevents duplicate processing.
 */
import { v } from 'convex/values'

import { internalMutation } from '../_generated/server'
import { ensureNotProcessed, markProcessed } from '../auth/idempotency'
import { ensureWebhookBotUser, resolveWebhookActor } from '../auth/webhookBot'

export const processTodoSyncWebhook = internalMutation({
  args: {
    workspaceId: v.id('workspaces'),
    eventId: v.string(),
    title: v.string(),
    completed: v.optional(v.boolean()),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ensureWebhookBotUser(ctx, args.workspaceId)
    const actor = await resolveWebhookActor(ctx, args.workspaceId)
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
