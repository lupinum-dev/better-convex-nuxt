import { literals } from 'convex-helpers/validators'
/**
 * Why this file exists:
 * The full example needs four tables:
 * - workspaces: the tenant boundary
 * - users: the source of actor role + tenant membership
 * - todos: the tenant-scoped resource protected by permissions
 * - processedEvents: replay protection for webhook idempotency
 */
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

  todos: defineTable({
    title: v.string(),
    completed: v.boolean(),
    ownerId: v.string(),
    workspaceId: v.id('workspaces'),
    source: v.optional(v.string()),
    externalId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_owner', ['ownerId']),

  processedEvents: defineTable({
    eventId: v.string(),
    source: v.string(),
    processedAt: v.number(),
  }).index('by_source_event_id', ['source', 'eventId']),

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
