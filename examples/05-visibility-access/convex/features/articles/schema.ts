import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import {
  articleAccessLevelValidator,
  articleStatusValidator,
  articleVisibilityValidator,
} from '../../../shared/features/articles/contract'

export const articleTables = {
  articles: defineTable({
    workspaceId: v.id('workspaces'),
    knowledgeBaseId: v.id('knowledgeBases'),
    title: v.string(),
    body: v.string(),
    status: articleStatusValidator,
    visibility: articleVisibilityValidator,
    parentArticleId: v.optional(v.id('articles')),
    ownerId: v.id('users'),
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

  articleProgress: defineTable({
    workspaceId: v.id('workspaces'),
    userId: v.id('users'),
    articleId: v.id('articles'),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_user_article', ['userId', 'articleId']),

  articleShares: defineTable({
    workspaceId: v.id('workspaces'),
    articleId: v.id('articles'),
    userId: v.id('users'),
    level: articleAccessLevelValidator,
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
    level: articleAccessLevelValidator,
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_hash', ['hash']),
}
