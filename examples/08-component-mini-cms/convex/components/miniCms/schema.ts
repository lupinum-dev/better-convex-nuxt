import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  pages: defineTable({
    slug: v.string(),
    title: v.string(),
    draftBody: v.string(),
    publishedBody: v.string(),
    status: v.union(v.literal('draft'), v.literal('published')),
    updatedAt: v.number(),
    publishedAt: v.optional(v.number()),
    authorId: v.string(),
  })
    .index('by_slug', ['slug'])
    .index('by_status', ['status']),
})
