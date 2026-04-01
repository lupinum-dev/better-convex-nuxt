/**
 * Why this file exists:
 * Articles combine all advanced access patterns: visibility, redaction, enrollment,
 * prerequisites, share tokens, and inherited access levels.
 */
import { authorize, deny } from 'better-convex-nuxt/auth'
import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import {
  type AccessLevel,
  getInheritedAccessLevel,
  requireArticleAccess,
} from './auth/articleAccess'
import { canCreateArticle, canCreateShareToken, canReadArticle, isStaffActor } from './auth/checks'
import { requireEnrollment } from './auth/enrollment'
import { redactArticle } from './auth/redaction'
import { loadResource, requireRecord } from './auth/scope'
import {
  createShareTokenValue,
  hashShareToken,
  resolveShareToken,
  requireTokenLevel,
  shareTokenPrefix,
} from './auth/shareTokens'
import { canAccessArticleOwner, getArticleOwnerScope } from './auth/visibility'
import { accessLevelValidator, visibilityValidator } from './schema'

export const list = query({
  args: { knowledgeBaseId: v.id('knowledgeBases') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Read articles', canReadArticle)

    const kb = loadResource(actor, await ctx.db.get(args.knowledgeBaseId), 'Knowledge base')

    const allArticles = await ctx.db
      .query('articles')
      .withIndex('by_knowledge_base', (q) => q.eq('knowledgeBaseId', kb._id))
      .order('desc')
      .collect()

    const ownerScope = await getArticleOwnerScope(ctx.db, actor)

    return allArticles
      .filter((article) => {
        if (isStaffActor(actor) && canAccessArticleOwner(ownerScope, article.ownerId)) return true
        if (article.status !== 'published') return false
        if (article.visibility === 'workspace') return true
        if (article.visibility === 'team') return canAccessArticleOwner(ownerScope, article.ownerId)
        if (article.visibility === 'private') return article.ownerId === actor.userId
        return false
      })
      .map((article) => redactArticle(actor, article))
  },
})

export const viewArticle = query({
  args: { id: v.id('articles'), shareToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.shareToken) {
      const grant = await resolveShareToken(ctx.db, args.shareToken)
      if (grant.articleId !== args.id) throw deny('Token does not match this article.')
      const article = await ctx.db.get(args.id)
      requireRecord(article, 'Article')
      return { ...article, _access: grant.level }
    }

    const actor = await getActor(ctx)
    authorize(actor, 'Read articles', canReadArticle)

    const article = loadResource(actor, await ctx.db.get(args.id), 'Article')
    await requireArticleAccess(ctx.db, actor, article)

    const accessLevel = await getInheritedAccessLevel(ctx.db, actor, args.id)
    return { ...redactArticle(actor, article), _access: accessLevel }
  },
})

export const create = mutation({
  args: {
    knowledgeBaseId: v.id('knowledgeBases'),
    title: v.string(),
    body: v.string(),
    visibility: visibilityValidator,
    parentArticleId: v.optional(v.id('articles')),
    internalNotes: v.optional(v.string()),
    prerequisiteIds: v.optional(v.array(v.id('articles'))),
    availableAfter: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Create article', canCreateArticle)
    loadResource(actor, await ctx.db.get(args.knowledgeBaseId), 'Knowledge base')

    const now = Date.now()
    return ctx.db.insert('articles', {
      workspaceId: actor.tenantId,
      knowledgeBaseId: args.knowledgeBaseId,
      title: args.title,
      body: args.body,
      status: 'draft',
      visibility: args.visibility,
      parentArticleId: args.parentArticleId,
      ownerId: actor.userId,
      internalNotes: args.internalNotes,
      prerequisiteIds: args.prerequisiteIds,
      availableAfter: args.availableAfter,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const publish = mutation({
  args: { id: v.id('articles') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Create article', canCreateArticle)
    const article = loadResource(actor, await ctx.db.get(args.id), 'Article')
    if (article.status === 'published') throw deny('Already published.')
    await ctx.db.patch(args.id, { status: 'published', updatedAt: Date.now() })
  },
})

export const markCompleted = mutation({
  args: { articleId: v.id('articles') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Read articles', canReadArticle)
    loadResource(actor, await ctx.db.get(args.articleId), 'Article')

    const existing = await ctx.db
      .query('articleProgress')
      .withIndex('by_user_article', (q) =>
        q.eq('userId', actor.userId).eq('articleId', args.articleId),
      )
      .first()

    if (existing) {
      if (!existing.completedAt) {
        await ctx.db.patch(existing._id, { completedAt: Date.now() })
      }
      return existing._id
    }

    return ctx.db.insert('articleProgress', {
      workspaceId: actor.tenantId,
      userId: actor.userId,
      articleId: args.articleId,
      completedAt: Date.now(),
      createdAt: Date.now(),
    })
  },
})

export const createShareToken = mutation({
  args: {
    articleId: v.id('articles'),
    level: accessLevelValidator,
    expiresInMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Create share token', canCreateShareToken)
    loadResource(actor, await ctx.db.get(args.articleId), 'Article')

    const token = createShareTokenValue()
    const hash = await hashShareToken(token)

    await ctx.db.insert('shareTokens', {
      workspaceId: actor.tenantId,
      articleId: args.articleId,
      prefix: shareTokenPrefix(token),
      hash,
      level: args.level,
      expiresAt: args.expiresInMs ? Date.now() + args.expiresInMs : undefined,
      createdAt: Date.now(),
    })

    return token
  },
})

export const revokeShareToken = mutation({
  args: { tokenId: v.id('shareTokens') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Create share token', canCreateShareToken)
    const token = loadResource(actor, await ctx.db.get(args.tokenId), 'Share token')
    if (token.revokedAt) throw deny('Already revoked.')
    await ctx.db.patch(args.tokenId, { revokedAt: Date.now() })
  },
})

export const seedDemoArticles = mutation({
  args: { knowledgeBaseId: v.id('knowledgeBases') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Create article', canCreateArticle)
    loadResource(actor, await ctx.db.get(args.knowledgeBaseId), 'Knowledge base')

    const now = Date.now()
    const introId = await ctx.db.insert('articles', {
      workspaceId: actor.tenantId,
      knowledgeBaseId: args.knowledgeBaseId,
      title: 'Getting Started',
      body: 'Welcome to the knowledge base. This is the intro article.',
      status: 'published',
      visibility: 'workspace',
      ownerId: actor.userId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('articles', {
      workspaceId: actor.tenantId,
      knowledgeBaseId: args.knowledgeBaseId,
      title: 'Advanced Topics',
      body: 'Deep dive into advanced patterns. Requires completing the intro first.',
      status: 'published',
      visibility: 'workspace',
      ownerId: actor.userId,
      prerequisiteIds: [introId],
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('articles', {
      workspaceId: actor.tenantId,
      knowledgeBaseId: args.knowledgeBaseId,
      title: 'Internal Review Notes',
      body: 'Sensitive review content for editors only.',
      status: 'published',
      visibility: 'team',
      ownerId: actor.userId,
      internalNotes: 'Needs legal review before Q3.',
      draftFeedback: 'Consider restructuring section 2.',
      createdAt: now,
      updatedAt: now,
    })

    return introId
  },
})
