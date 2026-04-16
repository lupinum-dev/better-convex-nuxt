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

  destructiveRedemptions: defineTable({
    jti: v.string(),
    operationId: v.string(),
    principalKey: v.string(),
    tenantKey: v.string(),
    redeemedAt: v.number(),
  }).index('by_jti', ['jti']),

  destructiveAuditLog: defineTable({
    operationId: v.string(),
    jti: v.string(),
    principalKey: v.string(),
    tenantKey: v.string(),
    argsHash: v.string(),
    previewHash: v.string(),
    executedAt: v.number(),
    executePath: v.string(),
  }),
})
