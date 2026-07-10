import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  oauthProjects: defineTable({
    title: v.string(),
    createdByOAuthClientId: v.string(),
    createdAt: v.number(),
  }).index('createdByOAuthClientId', ['createdByOAuthClientId']),
})
