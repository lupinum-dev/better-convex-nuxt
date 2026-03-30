import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const roleValidator = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('support'),
  v.literal('viewer'),
)

export const orderStatusValidator = v.union(
  v.literal('pending'),
  v.literal('fulfilled'),
  v.literal('refunded'),
)

export default defineSchema({
  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_slug', ['slug']),

  users: defineTable({
    authId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    role: roleValidator,
    workspaceId: v.optional(v.id('workspaces')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_auth_id', ['authId'])
    .index('by_email', ['email'])
    .index('by_workspace', ['workspaceId']),

  orders: defineTable({
    workspaceId: v.id('workspaces'),
    orderNumber: v.string(),
    status: orderStatusValidator,
    amountCents: v.number(),
    fulfilledAt: v.optional(v.number()),
    refundedAt: v.optional(v.number()),
    refundReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_order_number', ['orderNumber']),

  fraudHolds: defineTable({
    workspaceId: v.id('workspaces'),
    orderId: v.id('orders'),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index('by_order', ['orderId']),

  processedEvents: defineTable({
    eventId: v.string(),
    source: v.string(),
    processedAt: v.number(),
  }).index('by_event_id', ['eventId']),
})
