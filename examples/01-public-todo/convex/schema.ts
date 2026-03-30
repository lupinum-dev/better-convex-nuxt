/**
 * Why this file exists:
 * This is the entire backend data model for the public example.
 * There is just one table because the goal is to show the module API, not business complexity.
 */
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  todos: defineTable({
    title: v.string(),
    completed: v.boolean(),
    createdAt: v.number(),
  }),
})
