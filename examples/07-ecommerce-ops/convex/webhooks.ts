import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { ensureNotProcessed, markProcessed } from './auth/idempotency'
import { type Actor } from './auth/actor'
import { resolveServiceActor } from './auth/service-auth'
import { loadResource } from './auth/scope'
import { deny } from 'better-convex-nuxt/auth'

async function validateWebhookRefund(ctx: any, actor: Actor, orderId: string) {
  const order = loadResource(actor, await ctx.db.get(orderId), 'Order')

  if (order.status === 'refunded') throw deny('Already refunded.')
  if (order.status === 'pending') throw deny('Cannot refund unfulfilled orders.')

  const hold = await ctx.db
    .query('fraudHolds')
    .withIndex('by_order', q => q.eq('orderId', order._id))
    .first()
  if (hold && !hold.resolvedAt) throw deny('Order is under fraud review.')

  return order
}

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

    const order = await validateWebhookRefund(ctx, actor, args.orderId)
    await ctx.db.patch(order._id, {
      status: 'refunded',
      refundedAt: Date.now(),
      refundReason: args.reason,
      updatedAt: Date.now(),
    })

    await markProcessed(ctx.db, args.eventId, 'webhook')
  },
})
