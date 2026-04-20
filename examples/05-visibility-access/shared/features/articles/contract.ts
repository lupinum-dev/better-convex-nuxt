import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const articleStatusValidator = v.union(v.literal('draft'), v.literal('published'))

export const articleVisibilityValidator = v.union(
  v.literal('private'),
  v.literal('team'),
  v.literal('workspace'),
)

export const articleAccessLevelValidator = v.union(
  v.literal('view'),
  v.literal('comment'),
  v.literal('edit'),
)

export const listArticles = defineArgs({
  description: 'List the articles a caller can see inside one knowledge base.',
  args: {
    knowledgeBaseId: v.id('knowledgeBases'),
  },
})

export const viewArticle = defineArgs({
  description: 'View one article, optionally with a public share token.',
  args: {
    id: v.id('articles'),
    shareToken: v.optional(v.string()),
  },
})

export const createArticle = defineArgs({
  description: 'Create a draft article inside a knowledge base.',
  args: {
    knowledgeBaseId: v.id('knowledgeBases'),
    title: v.string(),
    body: v.string(),
    visibility: articleVisibilityValidator,
    parentArticleId: v.optional(v.id('articles')),
    internalNotes: v.optional(v.string()),
    prerequisiteIds: v.optional(v.array(v.id('articles'))),
    availableAfter: v.optional(v.number()),
  },
})

export const publishArticle = defineArgs({
  description: 'Publish a draft article.',
  args: {
    id: v.id('articles'),
  },
})

export const markArticleCompleted = defineArgs({
  description: 'Mark an article as completed for the current user.',
  args: {
    articleId: v.id('articles'),
  },
})

export const createArticleShareToken = defineArgs({
  description: 'Create a public share token for one article.',
  args: {
    articleId: v.id('articles'),
    level: articleAccessLevelValidator,
    expiresInMs: v.optional(v.number()),
  },
})

export const revokeArticleShareToken = defineArgs({
  description: 'Revoke a public share token.',
  args: {
    tokenId: v.id('shareTokens'),
  },
})

export const seedDemoArticles = defineArgs({
  description: 'Seed the demo article graph for a knowledge base.',
  args: {
    knowledgeBaseId: v.id('knowledgeBases'),
  },
})
