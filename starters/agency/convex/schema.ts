import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const roleValidator = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('member'),
  v.literal('viewer'),
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
    kind: v.union(v.literal('agency'), v.literal('client')),
    createdBy: v.id('users'),
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
    .index('by_user', ['userId'])
    .index('by_org', ['organizationId']),

  organizationLinks: defineTable({
    agencyOrganizationId: v.id('organizations'),
    clientOrganizationId: v.id('organizations'),
    status: v.union(v.literal('active'), v.literal('revoked')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_agency', ['agencyOrganizationId'])
    .index('by_agency_client', ['agencyOrganizationId', 'clientOrganizationId'])
    .index('by_client', ['clientOrganizationId']),

  clientProjects: defineTable({
    clientOrganizationId: v.id('organizations'),
    name: v.string(),
    createdBy: v.id('users'),
    actingFromOrganizationId: v.optional(v.id('organizations')),
    createdAt: v.number(),
  }).index('by_client', ['clientOrganizationId']),

  auditEvents: defineTable({
    organizationId: v.id('organizations'),
    actorUserId: v.id('users'),
    accessPath: v.union(v.literal('direct'), v.literal('delegated')),
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.optional(v.string()),
    createdAt: v.number(),
  }).index('by_org_created', ['organizationId', 'createdAt']),
})
