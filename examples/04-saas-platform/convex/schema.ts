/**
 * Why this file exists:
 * Convex still requires the schema entrypoint at `convex/schema.ts`.
 * Feature-owned tables stay under `convex/features/*`, but the shell schema imports those table
 * objects directly instead of pulling in the full feature manifest. This keeps schema evaluation
 * simple while the manifest still drives permissions and tenant classification elsewhere.
 */
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { commentTables } from './features/comments/schema'
import { projectTables } from './features/projects/schema'
import { taskTables } from './features/tasks/schema'
import { userTables } from './features/users/schema'
import { workspaceTables } from './features/workspaces/schema'

export default defineSchema({
  ...workspaceTables,
  ...userTables,
  ...projectTables,
  ...taskTables,
  ...commentTables,

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
