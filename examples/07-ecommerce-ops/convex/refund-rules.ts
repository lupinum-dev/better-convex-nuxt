/**
 * Shared refund-eligibility rules.
 * Human refund flows and service/webhook flows must hit the same business-state checks.
 */
import type { GenericMutationCtx } from 'convex/server'

import { deny } from 'better-convex-nuxt/auth'

import type { DataModel } from './_generated/dataModel'
import type { Actor } from './auth/actor'
import { loadResource } from './auth/scope'

type MutationCtx = GenericMutationCtx<DataModel>

export async function validateRefundEligibility(ctx: MutationCtx, actor: Actor, orderId: string) {
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
