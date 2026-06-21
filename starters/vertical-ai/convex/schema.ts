import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

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
    createdBy: v.id('users'),
    createdAt: v.number()
  }),

  memberships: defineTable({
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    role: v.union(v.literal('owner'), v.literal('admin'), v.literal('reviewer'), v.literal('viewer')),
    status: v.union(v.literal('active'), v.literal('removed')),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index('by_org_user', ['organizationId', 'userId'])
    .index('by_user', ['userId']),

  domainRecords: defineTable({
    organizationId: v.id('organizations'),
    title: v.string(),
    body: v.string(),
    sourceDraftId: v.id('drafts'),
    approvedBy: v.id('users'),
    createdAt: v.number()
  }).index('by_org', ['organizationId']),

  drafts: defineTable({
    organizationId: v.id('organizations'),
    title: v.string(),
    body: v.string(),
    source: v.union(v.literal('agent'), v.literal('human')),
    sourceThreadId: v.optional(v.string()),
    status: v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')),
    createdAt: v.number(),
    decidedAt: v.optional(v.number())
  })
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_org', ['organizationId']),

  auditEvents: defineTable({
    organizationId: v.id('organizations'),
    actorUserId: v.id('users'),
    action: v.string(),
    sourceDraftId: v.optional(v.id('drafts')),
    domainRecordId: v.optional(v.id('domainRecords')),
    createdAt: v.number()
  }).index('by_org_created', ['organizationId', 'createdAt'])
})

