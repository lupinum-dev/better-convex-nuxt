import { literals } from 'convex-helpers/validators'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const roleValidator = literals('owner', 'admin', 'member', 'viewer')

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
    activeWorkspaceId: v.optional(v.id('workspaces')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_auth_id', ['authId'])
    .index('by_email', ['email']),

  memberships: defineTable({
    userId: v.string(),
    workspaceId: v.id('workspaces'),
    role: roleValidator,
    invitedBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_workspace', ['workspaceId'])
    .index('by_user_workspace', ['userId', 'workspaceId']),

  boards: defineTable({
    workspaceId: v.id('workspaces'),
    title: v.string(),
    slug: v.string(),
    archived: v.boolean(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_workspace_archived', ['workspaceId', 'archived'])
    .index('by_workspace_slug', ['workspaceId', 'slug']),

  columns: defineTable({
    workspaceId: v.id('workspaces'),
    boardId: v.id('boards'),
    title: v.string(),
    position: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_workspace_board_position', ['workspaceId', 'boardId', 'position']),

  cards: defineTable({
    workspaceId: v.id('workspaces'),
    boardId: v.id('boards'),
    columnId: v.id('columns'),
    title: v.string(),
    description: v.optional(v.string()),
    position: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_workspace_board_position', ['workspaceId', 'boardId', 'position'])
    .index('by_workspace_column_position', ['workspaceId', 'columnId', 'position']),

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

  auditEvents: defineTable({
    workspaceId: v.optional(v.id('workspaces')),
    actorId: v.optional(v.string()),
    origin: literals('user', 'agent', 'system'),
    action: v.string(),
    summary: v.string(),
    boardId: v.optional(v.id('boards')),
    columnId: v.optional(v.id('columns')),
    cardId: v.optional(v.id('cards')),
    metadata: v.optional(v.string()),
    createdAt: v.number(),
  }).index('by_workspace_created', ['workspaceId', 'createdAt']),
})
