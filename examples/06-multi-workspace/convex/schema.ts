import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const membershipRoleValidator = v.union(
  v.literal('owner'),
  v.literal('member'),
  v.literal('viewer'),
  v.literal('agency_admin'),
  v.literal('agency_manager'),
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
    workspaceId: v.optional(v.id('workspaces')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_auth_id', ['authId'])
    .index('by_email', ['email'])
    .index('by_workspace', ['workspaceId']),

  memberships: defineTable({
    userId: v.string(),
    workspaceId: v.id('workspaces'),
    role: membershipRoleValidator,
    createdAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_workspace', ['userId', 'workspaceId'])
    .index('by_workspace', ['workspaceId']),

  projects: defineTable({
    workspaceId: v.id('workspaces'),
    name: v.string(),
    status: v.union(v.literal('active'), v.literal('paused')),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_workspace', ['workspaceId']),
})
