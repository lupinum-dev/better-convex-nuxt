import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const roleValidator = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('member'),
)

export const planValidator = v.union(
  v.literal('free'),
  v.literal('pro'),
  v.literal('enterprise'),
)

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
    .index('by_email', ['email'])
    .index('by_workspace', ['workspaceId']),

  projects: defineTable({
    workspaceId: v.id('workspaces'),
    name: v.string(),
    status: v.union(v.literal('active'), v.literal('archived')),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_workspace', ['workspaceId']),
})
