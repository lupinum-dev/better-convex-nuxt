/**
 * Why this file exists:
 * Convex still requires the schema entrypoint at `convex/schema.ts`.
 * The feature tables live under `convex/features/*`, but this shell stays flat so the local
 * backend can always evaluate the schema directly.
 */
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { schema as featureSchema } from './features'

export default defineSchema({
  ...featureSchema,

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
