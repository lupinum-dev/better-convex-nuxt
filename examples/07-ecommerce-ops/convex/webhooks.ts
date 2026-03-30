/**
 * Why this file exists:
 * Webhooks are a separate auth path. They are still forced through the same refund guards.
 */
import type { GenericMutationCtx } from 'convex/server'
import { v } from 'convex/values'

import { deny } from 'better-convex-nuxt/auth'

import { mutation } from './_generated/server'
import type { DataModel } from './_generated/dataModel'
import { ensureNotProcessed, markProcessed } from './auth/idempotency'
import { type Actor } from './auth/actor'
import { resolveServiceActor } from './auth/service-auth'
import { loadResource } from './auth/scope'

type MutationCtx = GenericMutationCtx<DataModel>

async function validateWebhookRefund(ctx: MutationCtx, actor: Actor, orderId: string) {
  const order = loadResource(actor, await ctx.db.get(orderId), 'Order')

  if (order.status === 'refunded') throw deny('Already refunded.')
  if (order.status === 'pending') throw deny('Cannot refund unfulfilled orders.')

  const thirtyDays = 30 * 24 * 60 * 60 * 1000
  if (order.fulfilledAt && order.fulfilledAt < Date.now() - thirtyDays) {
    throw deny('Refund window has closed (30 days).')
  }

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
