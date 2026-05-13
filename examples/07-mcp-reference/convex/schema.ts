/**
 * Why this file exists:
 * Example 07 is the full MCP reference app. The schema keeps the business domain deliberately
 * small so the MCP behavior stays readable:
 * - workspaces: tenant boundary
 * - users: browser-auth appIdentity rows
 * - runbooks: public + workspace + draft content used by MCP tools/resources/prompts
 * - mcpKeys: hashed bearer tokens for MCP clients
 */
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { mcpKeyTables } from './features/mcpKeys/schema'
import { runbookTables } from './features/runbooks/schema'
import { userTables } from './features/users/schema'
import { workspaceTables } from './features/workspaces/schema'

export default defineSchema({
  ...workspaceTables,
  ...userTables,
  ...runbookTables,
  ...mcpKeyTables,

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
