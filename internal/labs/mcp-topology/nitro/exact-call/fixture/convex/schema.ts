import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  members: defineTable({
    issuer: v.string(),
    role: v.union(v.literal('editor'), v.literal('owner')),
    status: v.union(v.literal('active'), v.literal('removed')),
    subject: v.string(),
    tenantId: v.string(),
  }).index('by_issuer_subject', ['issuer', 'subject']),

  notes: defineTable({
    externalId: v.string(),
    revision: v.number(),
    title: v.string(),
    workspaceExternalId: v.string(),
  })
    .index('by_external_id', ['externalId'])
    .index('by_workspace', ['workspaceExternalId']),

  renameReceipts: defineTable({
    issuer: v.string(),
    noteId: v.string(),
    requestKey: v.string(),
    revision: v.number(),
    subject: v.string(),
    tenantId: v.string(),
    title: v.string(),
  }).index('by_tenant_request', ['tenantId', 'requestKey']),

  reportReceipts: defineTable({
    issuer: v.string(),
    noteCount: v.number(),
    reportId: v.string(),
    requestKey: v.string(),
    subject: v.string(),
    tenantId: v.string(),
    workspaceId: v.string(),
  }).index('by_tenant_request', ['tenantId', 'requestKey']),

  workspaces: defineTable({
    externalId: v.string(),
    revision: v.number(),
    tenantId: v.string(),
  }).index('by_external_id', ['externalId']),
})
