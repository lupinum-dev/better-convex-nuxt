import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { todosTables } from './features/todos'
import { userTables } from './features/users'
import { workspaceTables } from './features/workspaces'

export default defineSchema({
  ...workspaceTables,
  ...userTables,
  ...todosTables,

  mcpKeys: defineTable({
    hash: v.string(),
    name: v.string(),
    boundUserId: v.id('users'),
    boundWorkspaceId: v.id('workspaces'),
    status: v.union(v.literal('active'), v.literal('revoked')),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index('by_hash', ['hash'])
    .index('by_bound_workspace', ['boundWorkspaceId']),
})
