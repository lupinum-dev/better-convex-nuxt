import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const roleValidator = literals('owner', 'admin', 'member', 'viewer')

export const userTables = {
  users: defineTable({
    authKey: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    role: roleValidator,
    workspaceId: v.optional(v.id('workspaces')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_auth_key', ['authKey'])
    .index('by_email', ['email']),
}
