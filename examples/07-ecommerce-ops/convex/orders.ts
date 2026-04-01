import { authorize } from 'better-convex-nuxt/auth'
import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import { canReadOrders, canRefundOrders } from './auth/checks'
import { validateRefundEligibility } from './refundRules'

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Read orders', canReadOrders)

    return ctx.db
      .query('orders')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .collect()
  },
})

export const seedDemoOrders = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Refund orders', canRefundOrders)

    const now = Date.now()
    const fulfilledOrderId = await ctx.db.insert('orders', {
      workspaceId: actor.tenantId,
      orderNumber: `FUL-${now}`,
      status: 'fulfilled',
      amountCents: 12000,
      fulfilledAt: now,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('orders', {
      workspaceId: actor.tenantId,
      orderNumber: `PEN-${now}`,
      status: 'pending',
      amountCents: 5000,
      createdAt: now,
      updatedAt: now,
    })

    return fulfilledOrderId
  },
})

export const processRefund = mutation({
  args: {
    orderId: v.id('orders'),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Process refund', canRefundOrders)

    const order = await validateRefundEligibility(ctx, actor, args.orderId)
    await ctx.db.patch(order._id, {
      status: 'refunded',
      refundedAt: Date.now(),
      refundReason: args.reason,
      updatedAt: Date.now(),
    })
  },
})
