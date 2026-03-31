/**
 * Webhooks are a separate auth path. They are still forced through the same refund guards.
 */
import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { ensureNotProcessed, markProcessed } from './auth/idempotency'
import { resolveServiceActor } from './auth/serviceAuth'
import { validateRefundEligibility } from './refundRules'

export const processRefundWebhook = mutation({
  args: {
    serviceKey: v.string(),
    workspaceId: v.id('workspaces'),
    orderId: v.id('orders'),
    eventId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = resolveServiceActor(args.serviceKey, 'webhook', args.workspaceId)
    await ensureNotProcessed(ctx.db, args.eventId)

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
