/**
 * Why this file exists:
 * The full example needs four tables:
 * - workspaces: the tenant boundary
 * - users: the source of appIdentity role + tenant membership
 * - todos: the tenant-scoped resource protected by permissions
 * - processedEvents: replay protection for webhook idempotency
 */
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { todosTables } from './features/todos/schema'
import { userTables } from './features/users/schema'
import { workspaceTables } from './features/workspaces/schema'

export default defineSchema({
  ...workspaceTables,
  ...userTables,
  ...todosTables,

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
})
