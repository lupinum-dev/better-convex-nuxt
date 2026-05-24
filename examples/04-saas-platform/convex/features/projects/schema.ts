import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const projectStatusValidator = v.union(v.literal('active'), v.literal('archived'))

export const projectTables = {
  projects: defineTable({
    workspaceId: v.id('workspaces'),
    name: v.string(),
    summary: v.optional(v.string()),
    status: projectStatusValidator,
    ownerId: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_owner', ['ownerId']),
}
