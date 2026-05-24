import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const todosTables = {
  todos: defineTable({
    ownerId: v.id('users'),
    title: v.string(),
    completed: v.boolean(),
    createdAt: v.number(),
  }).index('by_owner', ['ownerId']),
}
