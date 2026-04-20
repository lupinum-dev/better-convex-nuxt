import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  users: defineTable({
    authId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_auth_id', ['authId']),

  todos: defineTable({
    ownerId: v.string(),
    title: v.string(),
    completed: v.boolean(),
    createdAt: v.number(),
  }).index('by_owner', ['ownerId']),
})
