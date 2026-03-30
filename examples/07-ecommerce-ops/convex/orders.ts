/**
 * Why this file exists:
 * Human refund flows and service refund flows should hit the same business-state rules.
 */
import type { GenericMutationCtx } from 'convex/server'
import { v } from 'convex/values'

import { deny, guard } from 'better-convex-nuxt/auth'

import { mutation, query } from './_generated/server'
import type { DataModel } from './_generated/dataModel'
import { getActor, type Actor } from './auth/actor'
import { canReadOrders, canRefundOrders } from './auth/checks'
import { loadResource } from './auth/scope'

type MutationCtx = GenericMutationCtx<DataModel>

async function validateRefund(ctx: MutationCtx, actor: Actor, orderId: string) {
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

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    guard(actor, 'Read orders', canReadOrders)

    return ctx.db
      .query('orders')
      .withIndex('by_workspace', q => q.eq('workspaceId', actor!.tenantId))
      .order('desc')
      .collect()
  },
})

export const seedDemoOrders = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    guard(actor, 'Refund orders', canRefundOrders)

    const now = Date.now()
    const fulfilledOrderId = await ctx.db.insert('orders', {
      workspaceId: actor!.tenantId,
      orderNumber: `FUL-${now}`,
      status: 'fulfilled',
      amountCents: 12000,
      fulfilledAt: now,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('orders', {
      workspaceId: actor!.tenantId,
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
    guard(actor, 'Process refund', canRefundOrders)

    const order = await validateRefund(ctx, actor, args.orderId)
    await ctx.db.patch(order._id, {
      status: 'refunded',
      refundedAt: Date.now(),
      refundReason: args.reason,
      updatedAt: Date.now(),
    })
  },
})
