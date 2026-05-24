import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const todosTables = {
  todos: defineTable({
    title: v.string(),
    completed: v.boolean(),
    ownerId: v.id('users'),
    workspaceId: v.id('workspaces'),
    source: v.optional(v.string()),
    externalId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_owner', ['ownerId']),

  processedEvents: defineTable({
    eventId: v.string(),
    source: v.string(),
    processedAt: v.number(),
  }).index('by_source_event_id', ['source', 'eventId']),
}
