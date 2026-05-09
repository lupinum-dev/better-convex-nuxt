import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  projects: defineTable({
    workspaceId: v.string(),
    title: v.string(),
  }).index('by_workspace', ['workspaceId']),
})
