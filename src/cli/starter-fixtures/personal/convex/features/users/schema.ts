import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const userTables = {
  users: defineTable({
    authKey: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    role: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_auth_key', ['authKey']),
}
