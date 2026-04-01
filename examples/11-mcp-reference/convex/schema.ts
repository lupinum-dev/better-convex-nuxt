/**
 * Why this file exists:
 * The full example needs three tables:
 * - workspaces: the tenant boundary
 * - users: the source of actor role + tenant membership
 * - todos: the tenant-scoped resource protected by permissions
 */
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const roleValidator = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('member'),
  v.literal('viewer'),
)

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
    .index('by_email', ['email'])
    .index('by_workspace', ['workspaceId']),

  todos: defineTable({
    title: v.string(),
    completed: v.boolean(),
    ownerId: v.string(),
    workspaceId: v.id('workspaces'),
    createdAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_owner', ['ownerId']),
})
