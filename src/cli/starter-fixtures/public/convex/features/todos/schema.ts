import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const todosTables = {
  todos: defineTable({
    title: v.string(),
    completed: v.boolean(),
    createdAt: v.number(),
  }),
}
