import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const keyStatusValidator = literals('active', 'revoked')

export const mcpKeyTables = {
  mcpKeys: defineTable({
    name: v.string(),
    prefix: v.string(),
    hash: v.string(),
    boundUserId: v.id('users'),
    boundWorkspaceId: v.id('workspaces'),
    issuedByUserId: v.id('users'),
    status: keyStatusValidator,
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index('by_bound_workspace', ['boundWorkspaceId'])
    .index('by_hash', ['hash']),
}
