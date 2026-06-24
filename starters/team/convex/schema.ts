import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const projectStatus = v.union(v.literal('active'), v.literal('deleted'))

export const auditActor = v.object({
  kind: v.literal('user'),
  authUserId: v.string(),
})

export const auditAction = v.union(
  v.literal('project.create'),
  v.literal('project.update'),
  v.literal('project.delete'),
  v.literal('project.restore'),
)
export const auditResourceType = v.literal('project')

export default defineSchema({
  users: defineTable({
    authUserId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_auth_user_id', ['authUserId']),

  projects: defineTable({
    organizationId: v.string(),
    teamId: v.string(),
    name: v.string(),
    status: projectStatus,
    createdByAuthUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
    deletedByAuthUserId: v.optional(v.string()),
  })
    .index('by_organizationId_teamId_status_updatedAt', [
      'organizationId',
      'teamId',
      'status',
      'updatedAt',
    ])
    .index('by_status_deletedAt', ['status', 'deletedAt']),

  auditEvents: defineTable({
    organizationId: v.string(),
    teamId: v.optional(v.string()),
    actor: auditActor,
    action: auditAction,
    resourceType: auditResourceType,
    resourceId: v.optional(v.string()),
    summary: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_organizationId_createdAt', ['organizationId', 'createdAt'])
    .index('by_organizationId_teamId_createdAt', ['organizationId', 'teamId', 'createdAt']),
})
