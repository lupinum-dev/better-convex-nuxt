import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const roleValidator = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('member'),
  v.literal('viewer'),
)

export const serviceActorRoleValidator = v.union(
  v.literal('admin'),
  v.literal('member'),
  v.literal('viewer'),
)

export const approvalOperationValidator = v.literal('projects.delete')
export const approvalStatusValidator = v.union(
  v.literal('pending'),
  v.literal('approved'),
  v.literal('rejected'),
  v.literal('used'),
)
export const auditActionValidator = v.union(
  v.literal('organizations.create'),
  v.literal('projects.create'),
  v.literal('projects.delete'),
  v.literal('serviceActors.create'),
  v.literal('agentCredentials.revoke'),
  v.literal('approvals.request'),
  v.literal('approvals.approve'),
  v.literal('approvals.reject'),
)
export const auditResourceTypeValidator = v.union(
  v.literal('organization'),
  v.literal('project'),
  v.literal('serviceActor'),
  v.literal('agentCredential'),
  v.literal('approval'),
)
export const auditSourceValidator = v.union(
  v.literal('human'),
  v.literal('mcp'),
  v.literal('agent'),
)
export const auditActorValidator = v.union(
  v.object({ kind: v.literal('user'), userId: v.id('users') }),
  v.object({ kind: v.literal('serviceActor'), serviceActorId: v.id('serviceActors') }),
)
export const projectCreatorValidator = v.union(
  v.object({
    kind: v.literal('user'),
    userId: v.id('users'),
  }),
  v.object({
    kind: v.literal('serviceActor'),
    serviceActorId: v.id('serviceActors'),
  }),
)

export default defineSchema({
  users: defineTable({
    subject: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_subject', ['subject']),

  organizations: defineTable({
    name: v.string(),
    createdBy: v.optional(v.id('users')),
    createdAt: v.number(),
  }),

  memberships: defineTable({
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    role: roleValidator,
    status: v.union(v.literal('active'), v.literal('removed')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org_user', ['organizationId', 'userId'])
    .index('by_user_status', ['userId', 'status']),

  serviceActors: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    role: serviceActorRoleValidator,
    status: v.union(v.literal('active'), v.literal('revoked')),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_org', ['organizationId']),

  agentCredentials: defineTable({
    serviceActorId: v.id('serviceActors'),
    organizationId: v.id('organizations'),
    secretHash: v.string(),
    status: v.union(v.literal('active'), v.literal('revoked')),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index('by_secret_hash', ['secretHash'])
    .index('by_actor', ['serviceActorId']),

  projects: defineTable({
    organizationId: v.id('organizations'),
    name: v.string(),
    createdBy: projectCreatorValidator,
    status: v.union(v.literal('active'), v.literal('deleted')),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.id('serviceActors')),
    createdAt: v.number(),
  }).index('by_org_status', ['organizationId', 'status']),

  approvals: defineTable({
    organizationId: v.id('organizations'),
    operation: approvalOperationValidator,
    resourceId: v.string(),
    status: approvalStatusValidator,
    requestedBy: v.id('serviceActors'),
    requestedReason: v.optional(v.string()),
    requestKey: v.optional(v.string()),
    preview: v.optional(
      v.object({
        resourceLabel: v.string(),
        effects: v.array(
          v.object({
            type: v.union(v.literal('update'), v.literal('audit')),
            table: v.union(v.literal('projects'), v.literal('auditEvents')),
            id: v.optional(v.string()),
            label: v.optional(v.string()),
            action: v.optional(v.string()),
          }),
        ),
      }),
    ),
    approvedBy: v.optional(v.id('users')),
    approvedAt: v.optional(v.number()),
    rejectedBy: v.optional(v.id('users')),
    rejectedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index('by_operation_resource', ['operation', 'resourceId'])
    .index('by_org_status_expires', ['organizationId', 'status', 'expiresAt'])
    .index('by_actor_request_key', [
      'organizationId',
      'requestedBy',
      'operation',
      'resourceId',
      'requestKey',
    ]),

  auditEvents: defineTable({
    organizationId: v.id('organizations'),
    actor: auditActorValidator,
    action: auditActionValidator,
    resourceType: auditResourceTypeValidator,
    source: auditSourceValidator,
    resourceId: v.optional(v.string()),
    createdAt: v.number(),
  }).index('by_org_created', ['organizationId', 'createdAt']),
})
