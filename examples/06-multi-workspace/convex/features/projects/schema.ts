import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const projectStatusValidator = v.union(v.literal('active'), v.literal('paused'))

export const projectTables = {
  projects: defineTable({
    workspaceId: v.id('workspaces'),
    name: v.string(),
    status: projectStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_workspace', ['workspaceId']),
}
