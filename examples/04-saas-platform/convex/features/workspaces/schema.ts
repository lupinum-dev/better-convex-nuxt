import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const workspaceTables = {
  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),
    plan: v.optional(v.union(v.literal('free'), v.literal('pro'))),
    ownerId: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_slug', ['slug']),

  auditEvents: defineTable({
    workspaceId: v.id('workspaces'),
    actorId: v.id('users'),
    entityType: v.string(),
    entityId: v.string(),
    action: v.string(),
    description: v.string(),
    createdAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_actor', ['actorId']),
}
