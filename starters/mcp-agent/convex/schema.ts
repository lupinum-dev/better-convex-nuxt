import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const roleValidator = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('member'),
  v.literal('viewer')
)

export const serviceActorRoleValidator = v.union(
  v.literal('admin'),
  v.literal('member'),
  v.literal('viewer')
)

export const approvalOperationValidator = v.literal('projects.delete')
export const serviceAuditActionValidator = v.union(
  v.literal('projects.create'),
  v.literal('projects.delete')
)
export const serviceAuditResourceTypeValidator = v.literal('project')
export const projectCreatorValidator = v.union(
  v.object({
    kind: v.literal('user'),
    userId: v.id('users')
  }),
  v.object({
    kind: v.literal('serviceActor'),
    serviceActorId: v.id('serviceActors')
  })
)

export default defineSchema({
  users: defineTable({
    subject: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index('by_subject', ['subject']),

  organizations: defineTable({
    name: v.string(),
    createdBy: v.optional(v.id('users')),
    createdAt: v.number()
  }),

  memberships: defineTable({
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    role: roleValidator,
    status: v.union(v.literal('active'), v.literal('removed')),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index('by_org_user', ['organizationId', 'userId'])
    .index('by_user', ['userId']),

  serviceActors: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    role: serviceActorRoleValidator,
    status: v.union(v.literal('active'), v.literal('revoked')),
    createdAt: v.number(),
    updatedAt: v.number()
  }).index('by_org', ['organizationId']),

  agentCredentials: defineTable({
    serviceActorId: v.id('serviceActors'),
    organizationId: v.id('organizations'),
    secretHash: v.string(),
    status: v.union(v.literal('active'), v.literal('revoked')),
    createdAt: v.number(),
    revokedAt: v.optional(v.number())
  })
    .index('by_secret_hash', ['secretHash'])
    .index('by_actor', ['serviceActorId']),

  projects: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    createdBy: projectCreatorValidator,
    createdAt: v.number()
  }).index('by_org', ['organizationId']),

  approvals: defineTable({
    organizationId: v.id('organizations'),
    operation: approvalOperationValidator,
    resourceId: v.string(),
    status: v.union(v.literal('approved'), v.literal('used')),
    approvedBy: v.id('users'),
    expiresAt: v.number(),
    createdAt: v.number(),
    usedAt: v.optional(v.number())
  }).index('by_operation_resource', ['operation', 'resourceId']),

  auditEvents: defineTable({
    organizationId: v.id('organizations'),
    serviceActorId: v.id('serviceActors'),
    action: serviceAuditActionValidator,
    resourceType: serviceAuditResourceTypeValidator,
    resourceId: v.optional(v.string()),
    createdAt: v.number()
  }).index('by_org_created', ['organizationId', 'createdAt'])
})
