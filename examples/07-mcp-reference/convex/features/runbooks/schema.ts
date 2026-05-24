import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const visibilityValidator = literals('public', 'workspace', 'draft')

export const runbookTables = {
  runbooks: defineTable({
    title: v.string(),
    summary: v.string(),
    content: v.string(),
    visibility: visibilityValidator,
    tags: v.array(v.string()),
    ownerId: v.id('users'),
    workspaceId: v.id('workspaces'),
    createdAt: v.number(),
    updatedAt: v.number(),
    publishedAt: v.optional(v.number()),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_visibility', ['visibility'])
    .index('by_workspace_visibility', ['workspaceId', 'visibility'])
    .index('by_owner', ['ownerId']),
}
