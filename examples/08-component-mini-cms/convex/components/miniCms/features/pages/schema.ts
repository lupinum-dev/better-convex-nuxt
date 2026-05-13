import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const pagesTables = {
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

  destructiveConfirmations: defineTable({
    jti: v.string(),
    operationId: v.string(),
    callerKey: v.string(),
    scopeKey: v.string(),
    redeemedAt: v.number(),
  }).index('by_jti', ['jti']),

  destructiveAuditLog: defineTable({
    operationId: v.string(),
    jti: v.string(),
    callerKey: v.string(),
    scopeKey: v.string(),
    argsHash: v.string(),
    previewHash: v.string(),
    executedAt: v.number(),
    executePath: v.string(),
  }),
}
