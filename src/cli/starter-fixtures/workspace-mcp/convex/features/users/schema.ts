import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const userTables = {
  users: defineTable({
    authKey: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    role: v.optional(
      v.union(v.literal('owner'), v.literal('admin'), v.literal('member'), v.literal('viewer')),
    ),
    workspaceId: v.optional(v.id('workspaces')),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_auth_key', ['authKey']),
}
