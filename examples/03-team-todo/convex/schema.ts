/**
 * Why this file exists:
 * The full example needs three tables:
 * - organizations: the tenant boundary
 * - users: the source of actor role + organization membership
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
  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    createdAt: v.number(),
  }).index('by_slug', ['slug']),

  users: defineTable({
    authId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    role: roleValidator,
    organizationId: v.optional(v.id('organizations')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_auth_id', ['authId'])
    .index('by_email', ['email'])
    .index('by_organization', ['organizationId']),

  todos: defineTable({
    title: v.string(),
    completed: v.boolean(),
    ownerId: v.string(),
    organizationId: v.id('organizations'),
    createdAt: v.number(),
  })
    .index('by_organization', ['organizationId'])
    .index('by_owner', ['ownerId']),
})
