import { literals } from 'convex-helpers/validators'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const roleValidator = literals('owner', 'admin', 'member', 'viewer')

export default defineSchema({
  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_slug', ['slug']),

  users: defineTable({
    authId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    role: roleValidator,
    workspaceId: v.optional(v.id('workspaces')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_auth_id', ['authId'])
    .index('by_email', ['email']),

  boards: defineTable({
    title: v.string(),
    workspaceId: v.id('workspaces'),
    ownerId: v.string(),
    archived: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_workspace_created', ['workspaceId', 'createdAt'])
    .index('by_workspace_archived', ['workspaceId', 'archived']),

  columns: defineTable({
    workspaceId: v.id('workspaces'),
    boardId: v.id('boards'),
    title: v.string(),
    position: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_workspace_board_position', ['workspaceId', 'boardId', 'position']),

  cards: defineTable({
    workspaceId: v.id('workspaces'),
    boardId: v.id('boards'),
    columnId: v.id('columns'),
    title: v.string(),
    position: v.number(),
    ownerId: v.string(),
    createdAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_workspace_column_position', ['workspaceId', 'columnId', 'position'])
    .index('by_workspace_board_position', ['workspaceId', 'boardId', 'position']),

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
