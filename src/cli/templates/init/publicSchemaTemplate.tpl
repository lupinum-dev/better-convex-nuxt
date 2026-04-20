import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  todos: defineTable({
    title: v.string(),
    completed: v.boolean(),
    createdAt: v.number(),
  }),
})
