import { literals } from 'convex-helpers/validators'
/**
 * Why this file exists:
 * This schema stays pure Convex. The framework infers scoped tables from `workspaceId`
 * plus the `by_workspace` index instead of wrapping `defineTable()`.
 */
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { taskPriorityValidator, taskStatusValidator } from '../shared/schemas/task'

export const roleValidator = literals('owner', 'admin', 'member', 'viewer')

export const planValidator = literals('free', 'pro', 'enterprise')

export const projectStatusValidator = literals('active', 'archived')

export default defineSchema({
  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.string(),
    plan: planValidator,
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

  projects: defineTable({
    workspaceId: v.id('workspaces'),
    name: v.string(),
    summary: v.optional(v.string()),
    status: projectStatusValidator,
    ownerId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_owner', ['ownerId']),

  tasks: defineTable({
    workspaceId: v.id('workspaces'),
    projectId: v.id('projects'),
    title: v.string(),
    status: taskStatusValidator,
    priority: taskPriorityValidator,
    assigneeId: v.optional(v.string()),
    ownerId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_project', ['projectId'])
    .index('by_owner', ['ownerId'])
    .index('by_assignee', ['assigneeId']),

  comments: defineTable({
    workspaceId: v.id('workspaces'),
    taskId: v.id('tasks'),
    ownerId: v.string(),
    body: v.string(),
    attachmentStorageId: v.optional(v.id('_storage')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_task', ['taskId'])
    .index('by_owner', ['ownerId']),

  auditEvents: defineTable({
    workspaceId: v.id('workspaces'),
    actorId: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    action: v.string(),
    description: v.string(),
    createdAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_actor', ['actorId']),

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
