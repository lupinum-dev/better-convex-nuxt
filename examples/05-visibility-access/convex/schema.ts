import { literals } from 'convex-helpers/validators'
/**
 * Why this file exists:
 * The knowledge base domain naturally combines every advanced access pattern:
 * - Row-level visibility (from CRM pipeline)
 * - Field redaction (from CRM pipeline)
 * - Enrollment-based access (from Course LMS)
 * - Prerequisite chains (from Course LMS)
 * - Share tokens with hashed storage (from Doc Sharing)
 * - Per-resource access levels with inheritance (from Doc Sharing)
 */
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const roleValidator = literals('owner', 'admin', 'editor', 'contributor', 'viewer')

export const visibilityValidator = literals('private', 'team', 'workspace')

export const statusValidator = literals('draft', 'published')

export const accessLevelValidator = literals('view', 'comment', 'edit')

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
    .index('by_manager', ['managerId']),

  knowledgeBases: defineTable({
    workspaceId: v.id('workspaces'),
    title: v.string(),
    status: statusValidator,
    ownerId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_workspace', ['workspaceId']),

  articles: defineTable({
    workspaceId: v.id('workspaces'),
    knowledgeBaseId: v.id('knowledgeBases'),
    title: v.string(),
    body: v.string(),
    status: statusValidator,
    visibility: visibilityValidator,
    parentArticleId: v.optional(v.id('articles')),
    ownerId: v.string(),
    internalNotes: v.optional(v.string()),
    draftFeedback: v.optional(v.string()),
    prerequisiteIds: v.optional(v.array(v.id('articles'))),
    availableAfter: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_knowledge_base', ['knowledgeBaseId'])
    .index('by_parent', ['parentArticleId'])
    .index('by_owner', ['ownerId']),

  enrollments: defineTable({
    workspaceId: v.id('workspaces'),
    userId: v.string(),
    knowledgeBaseId: v.id('knowledgeBases'),
    status: literals('active', 'canceled'),
    createdAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_user_kb', ['userId', 'knowledgeBaseId']),

  articleProgress: defineTable({
    workspaceId: v.id('workspaces'),
    userId: v.string(),
    articleId: v.id('articles'),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_user_article', ['userId', 'articleId']),

  articleShares: defineTable({
    workspaceId: v.id('workspaces'),
    articleId: v.id('articles'),
    userId: v.string(),
    level: accessLevelValidator,
    createdAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_article', ['articleId'])
    .index('by_user_article', ['userId', 'articleId']),

  shareTokens: defineTable({
    workspaceId: v.id('workspaces'),
    articleId: v.id('articles'),
    prefix: v.string(),
    hash: v.string(),
    level: accessLevelValidator,
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_hash', ['hash']),

  destructiveRedemptions: defineTable({
    jti: v.string(),
    operationId: v.string(),
    principalKey: v.string(),
    tenantKey: v.string(),
    redeemedAt: v.number(),
  }).index('by_jti', ['jti']),

  destructiveAuditLog: defineTable({
    operationId: v.string(),
    jti: v.string(),
    principalKey: v.string(),
    tenantKey: v.string(),
    argsHash: v.string(),
    previewHash: v.string(),
    executedAt: v.number(),
    executePath: v.string(),
  }),
})
