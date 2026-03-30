/**
 * Why this file exists:
 * The auth example needs one table for application users and one for user-owned todos.
 * There is still no organization table because this example demonstrates auth only, not tenancy.
 */
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
    userId: v.string(),
    title: v.string(),
    completed: v.boolean(),
    createdAt: v.number(),
  }).index('by_user', ['userId']),
})
