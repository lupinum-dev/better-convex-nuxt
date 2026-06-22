import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const roleValidator = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('member'),
  v.literal('viewer'),
)

export const invitationRoleValidator = v.union(
  v.literal('admin'),
  v.literal('member'),
  v.literal('viewer'),
)

export const membershipStatusValidator = v.union(v.literal('active'), v.literal('removed'))

export default defineSchema({
  users: defineTable({
    authUserId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_auth_user_id', ['authUserId']),

  organizations: defineTable({
    name: v.string(),
    createdBy: v.id('users'),
    createdAt: v.number(),
  }),

  memberships: defineTable({
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    role: roleValidator,
    status: membershipStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org_user', ['organizationId', 'userId'])
    .index('by_user', ['userId'])
    .index('by_user_status', ['userId', 'status'])
    .index('by_org', ['organizationId'])
    .index('by_org_role_status', ['organizationId', 'role', 'status']),

  invitations: defineTable({
    organizationId: v.id('organizations'),
    email: v.string(),
    role: invitationRoleValidator,
    token: v.string(),
    status: v.union(v.literal('pending'), v.literal('accepted'), v.literal('revoked')),
    createdBy: v.id('users'),
    createdAt: v.number(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
  })
    .index('by_token', ['token'])
    .index('by_org_status', ['organizationId', 'status']),

  projects: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    createdBy: v.id('users'),
    createdAt: v.number(),
  }).index('by_org', ['organizationId']),

  auditEvents: defineTable({
    organizationId: v.id('organizations'),
    actorUserId: v.id('users'),
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.optional(v.string()),
    createdAt: v.number(),
  }).index('by_org_created', ['organizationId', 'createdAt']),
})
