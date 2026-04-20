/**
 * Why this file exists:
 * Convex still requires the schema entrypoint at `convex/schema.ts`.
 * Feature-owned tables stay under `convex/features/*`, but the shell schema imports those table
 * objects directly instead of pulling in the full feature manifest. This keeps schema evaluation
 * simple while the manifest still drives permissions and tenant classification elsewhere.
 */
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { commentTables } from './features/comments'
import { projectTables } from './features/projects'
import { taskTables } from './features/tasks'
import { userTables } from './features/users'
import { workspaceTables } from './features/workspaces'

export default defineSchema({
  ...workspaceTables,
  ...userTables,
  ...projectTables,
  ...taskTables,
  ...commentTables,

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
