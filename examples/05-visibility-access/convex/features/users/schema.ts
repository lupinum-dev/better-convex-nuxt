import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const roleValidator = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('editor'),
  v.literal('contributor'),
  v.literal('viewer'),
)

export const userTables = {
  users: defineTable({
    authKey: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    role: roleValidator,
    workspaceId: v.optional(v.id('workspaces')),
    managerId: v.optional(v.id('users')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_auth_key', ['authKey'])
    .index('by_email', ['email'])
    .index('by_manager', ['managerId']),
}
