import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  users: defineTable({
    authUserId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_auth_user_id', ['authUserId']),

  projects: defineTable({
    organizationId: v.string(),
    teamId: v.optional(v.string()),
    name: v.string(),
    createdByAuthUserId: v.string(),
    createdAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_team', ['organizationId', 'teamId']),

  auditEvents: defineTable({
    organizationId: v.string(),
    actorAuthUserId: v.string(),
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.optional(v.string()),
    createdAt: v.number(),
  }).index('by_org_created', ['organizationId', 'createdAt']),
})
