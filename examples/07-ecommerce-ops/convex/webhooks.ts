/**
 * Webhooks are a separate auth path. They are still forced through the same refund guards.
 */
import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { ensureNotProcessed, markProcessed } from './auth/idempotency'
import { resolveWebhookActor } from './auth/trustedCaller'
import { validateRefundEligibility } from './refundRules'

export const processRefundWebhook = mutation({
  args: {
    trustedCallerKey: v.string(),
    workspaceId: v.id('workspaces'),
    orderId: v.id('orders'),
    eventId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await resolveWebhookActor(ctx, args.trustedCallerKey, args.workspaceId)
    await ensureNotProcessed(ctx.db, 'webhook', args.eventId)

    const order = await validateRefundEligibility(ctx, actor, args.orderId)
    await ctx.db.patch(order._id, {
      status: 'refunded',
      refundedAt: Date.now(),
      refundReason: args.reason,
      updatedAt: Date.now(),
    })

    await markProcessed(ctx.db, args.eventId, 'webhook')
  },
})
