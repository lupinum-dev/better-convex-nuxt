/**
 * Why this file exists:
 * CRMs look simple until visibility becomes partial inside the same tenant.
 * This schema keeps the domain small so the visibility and redaction behavior stays obvious.
 */
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const roleValidator = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('manager'),
  v.literal('rep'),
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
    managerId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_auth_id', ['authId'])
    .index('by_email', ['email'])
    .index('by_workspace', ['workspaceId'])
    .index('by_manager', ['managerId']),

  contacts: defineTable({
    workspaceId: v.id('workspaces'),
    ownerId: v.string(),
    name: v.string(),
    company: v.string(),
    phone: v.optional(v.string()),
    personalEmail: v.optional(v.string()),
    estimatedRevenue: v.optional(v.number()),
    internalNotes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_owner', ['ownerId']),
})
