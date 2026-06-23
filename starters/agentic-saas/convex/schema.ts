import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const agentCapability = v.union(
  v.literal('project:read'),
  v.literal('project:draft'),
  v.literal('project:delete'),
)

const productAuditAction = v.union(
  v.literal('projectDrafts.approve'),
  v.literal('projectDrafts.reject'),
  v.literal('projectDeletionRequests.reject'),
  v.literal('productRecords.delete'),
)

const productAuditResourceType = v.union(
  v.literal('productRecord'),
  v.literal('projectDraft'),
  v.literal('projectDeletionRequest'),
)

const agentAuditAction = v.union(
  v.literal('projectDrafts.create'),
  v.literal('projectDeletionRequests.create'),
)

const agentAuditResourceType = v.union(
  v.literal('projectDraft'),
  v.literal('projectDeletionRequest'),
  v.literal('productRecord'),
)

export default defineSchema({
  projectDrafts: defineTable({
    organizationId: v.string(),
    title: v.string(),
    body: v.string(),
    status: v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')),
    sourceAgentRunId: v.id('agentRuns'),
    createdAt: v.number(),
    decidedAt: v.optional(v.number()),
  })
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_agent_run', ['sourceAgentRunId']),

  productRecords: defineTable({
    organizationId: v.string(),
    title: v.string(),
    body: v.string(),
    sourceDraftId: v.id('projectDrafts'),
    approvedByAuthUserId: v.string(),
    createdAt: v.number(),
  }).index('by_org', ['organizationId']),

  projectDeletionRequests: defineTable({
    organizationId: v.string(),
    productRecordId: v.id('productRecords'),
    reason: v.string(),
    status: v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')),
    sourceAgentRunId: v.id('agentRuns'),
    createdAt: v.number(),
    decidedAt: v.optional(v.number()),
  })
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_agent_run', ['sourceAgentRunId'])
    .index('by_record', ['productRecordId']),

  productAuditEvents: defineTable({
    organizationId: v.string(),
    actor: v.object({
      kind: v.literal('user'),
      authUserId: v.string(),
    }),
    action: productAuditAction,
    resourceType: productAuditResourceType,
    resourceId: v.string(),
    sourceDraftId: v.optional(v.id('projectDrafts')),
    sourceDeletionRequestId: v.optional(v.id('projectDeletionRequests')),
    createdAt: v.number(),
  }).index('by_org_created', ['organizationId', 'createdAt']),

  agentRuns: defineTable({
    organizationId: v.string(),
    threadId: v.optional(v.string()),
    agentName: v.string(),
    status: v.union(
      v.literal('active'),
      v.literal('running'),
      v.literal('completed'),
      v.literal('revoked'),
      v.literal('failed'),
    ),
    startedByAuthUserId: v.string(),
    capabilities: v.array(agentCapability),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.optional(v.number()),
    maxTotalTokens: v.optional(v.number()),
    maxOrganizationTotalTokens: v.optional(v.number()),
    maxUserTotalTokens: v.optional(v.number()),
  })
    .index('by_thread', ['threadId'])
    .index('by_organization', ['organizationId'])
    .index('by_started_by', ['startedByAuthUserId']),

  agentAuditEvents: defineTable({
    organizationId: v.string(),
    actor: v.object({
      kind: v.literal('agent'),
      agentRunId: v.id('agentRuns'),
      delegatedByAuthUserId: v.string(),
    }),
    action: agentAuditAction,
    capability: agentCapability,
    resourceType: agentAuditResourceType,
    resourceId: v.string(),
    createdAt: v.number(),
  }).index('by_org_created', ['organizationId', 'createdAt']),

  agentUsageEvents: defineTable({
    organizationId: v.string(),
    agentRunId: v.id('agentRuns'),
    threadId: v.string(),
    startedByAuthUserId: v.string(),
    model: v.string(),
    provider: v.string(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.number(),
    reasoningTokens: v.optional(v.number()),
    cachedInputTokens: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_org_created', ['organizationId', 'createdAt'])
    .index('by_agent_run', ['agentRunId'])
    .index('by_thread', ['threadId']),
})
