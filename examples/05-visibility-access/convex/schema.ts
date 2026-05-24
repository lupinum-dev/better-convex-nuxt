/**
 * Why this file exists:
 * Convex still requires the schema entrypoint at `convex/schema.ts`.
 * The feature tables live under `convex/features/*`, but this shell stays flat so the local
 * backend can always evaluate the schema directly.
 */
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { articleTables } from './features/articles/schema'
import { knowledgeBaseTables } from './features/knowledgeBases/schema'
import { userTables } from './features/users/schema'
import { workspaceTables } from './features/workspaces/schema'

export default defineSchema({
  ...workspaceTables,
  ...userTables,
  ...knowledgeBaseTables,
  ...articleTables,

  destructiveConfirmations: defineTable({
    tokenHash: v.string(),
    jti: v.string(),
    operationId: v.string(),
    executePath: v.string(),
    previewPath: v.string(),
    callerKey: v.string(),
    scopeKey: v.string(),
    argsHash: v.string(),
    argsFieldHashes: v.optional(v.record(v.string(), v.string())),
    previewHash: v.string(),
    versionHash: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
    redeemedAt: v.optional(v.number()),
  })
    .index('by_token_hash', ['tokenHash'])
    .index('by_jti', ['jti'])
    .index('by_expires_at', ['expiresAt']),

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
})
