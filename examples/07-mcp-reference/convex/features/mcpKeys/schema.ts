import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const keyStatusValidator = literals('active', 'revoked')

export const mcpKeyTables = {
  mcpKeys: defineTable({
    name: v.string(),
    prefix: v.string(),
    hash: v.string(),
    boundAuthId: v.string(),
    boundWorkspaceId: v.id('workspaces'),
    issuedByAuthId: v.string(),
    status: keyStatusValidator,
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index('by_bound_workspace', ['boundWorkspaceId'])
    .index('by_hash', ['hash']),
}
