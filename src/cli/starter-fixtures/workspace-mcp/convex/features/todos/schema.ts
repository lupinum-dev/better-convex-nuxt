import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const todosTables = {
  todos: defineTable({
    workspaceId: v.id('workspaces'),
    title: v.string(),
    completed: v.boolean(),
    createdAt: v.number(),
  }).index('by_workspace', ['workspaceId']),
}
