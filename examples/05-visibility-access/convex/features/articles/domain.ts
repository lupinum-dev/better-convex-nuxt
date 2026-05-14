/**
 * Why this file exists:
 * Articles combine the example's hard parts: visibility, redaction, enrollment,
 * prerequisites, share tokens, and inherited access.
 */
import {
  deny,
  enforce,
  loadTenantResource as loadResource,
  requireRecord,
} from '@lupinum/trellis/auth'

import {
  createArticle,
  createArticleShareToken,
  listArticles,
  markArticleCompleted,
  publishArticle,
  seedDemoArticles,
  viewArticle,
} from '../../../shared/features/articles/contract'
import { getAppIdentity } from '../../auth/appIdentity'
import { hasRole } from '../../auth/guards'
import { mutation, query } from '../../functions'
import { getInheritedAccessLevel, requireArticleAccess } from './access'
import { revokeShareTokenOp } from './operations'
import { articleCreate, articleRead, shareCreate } from './permissions'
import { projectArticle, redactArticle } from './redaction'
import {
  createShareTokenValue,
  hashShareToken,
  resolveShareToken,
  shareTokenPrefix,
} from './shareTokens'
import { canAccessArticleOwner, getArticleOwnerScope } from './visibility'

function isStaffActor(
  appIdentity: NonNullable<Awaited<ReturnType<typeof getAppIdentity>>>,
): boolean {
  return hasRole('owner', 'admin', 'editor')(appIdentity)
}

export const list = query.protected({
  guard: articleRead,
  args: listArticles.args,
  load: async (ctx, args) => ({
    knowledgeBase: loadResource(
      await ctx.appIdentity(),
      await ctx.db.get(args.knowledgeBaseId),
      'Knowledge base',
    ),
  }),
  handler: async (ctx, _args, { knowledgeBase }) => {
    const appIdentity = await ctx.appIdentity()

    const allArticles = await ctx.db
      .query('articles')
      .withIndex('by_knowledge_base', (q) => q.eq('knowledgeBaseId', knowledgeBase._id))
      .order('desc')
      .collect()

    const ownerScope = await getArticleOwnerScope(ctx.db, appIdentity)

    return allArticles
      .filter((article) => {
        if (isStaffActor(appIdentity) && canAccessArticleOwner(ownerScope, article.ownerId))
          return true
        if (article.status !== 'published') return false
        if (article.visibility === 'workspace') return true
        if (article.visibility === 'team') return canAccessArticleOwner(ownerScope, article.ownerId)
        if (article.visibility === 'private') return article.ownerId === appIdentity.userId
        return false
      })
      .map((article) => redactArticle(appIdentity, article))
  },
})

export const view = query.public({
  args: viewArticle.args,
  handler: async (ctx, args) => {
    // Keep the cross-scope seam narrow: this is only for one hashed share token resolving one
    // article before a workspace appIdentity exists.
    const crossTenantDb = ctx.db.escapeIsolation({
      reason: 'Resolve share-token reads across-scope boundaries.',
    })

    if (args.shareToken) {
      const grant = await resolveShareToken(crossTenantDb, args.shareToken)
      if (grant.articleId !== args.id) throw deny('Token does not match this article.')
      const article = await crossTenantDb.get(args.id)
      requireRecord(article, 'Article')
      return projectArticle(null, article, (safeArticle) => ({
        ...safeArticle,
        _access: grant.level,
      }))
    }

    const appIdentity = await getAppIdentity(ctx)
    enforce(appIdentity, 'Read articles', articleRead.check)

    const article = loadResource(appIdentity, await ctx.db.get(args.id), 'Article')
    await requireArticleAccess(ctx.db, appIdentity, article)

    const accessLevel = await getInheritedAccessLevel(ctx.db, appIdentity, article._id)
    return projectArticle(appIdentity, article, (safeArticle) => ({
      ...safeArticle,
      _access: accessLevel,
    }))
  },
})

export const create = mutation.protected({
  guard: articleCreate,
  args: createArticle.args,
  load: async (ctx, args) => ({
    knowledgeBase: loadResource(
      await ctx.appIdentity(),
      await ctx.db.get(args.knowledgeBaseId),
      'Knowledge base',
    ),
  }),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()

    const now = Date.now()
    return ctx.db.insert('articles', {
      workspaceId: appIdentity.workspaceId,
      knowledgeBaseId: args.knowledgeBaseId,
      title: args.title,
      body: args.body,
      status: 'draft',
      visibility: args.visibility,
      parentArticleId: args.parentArticleId,
      ownerId: appIdentity.userId,
      internalNotes: args.internalNotes,
      prerequisiteIds: args.prerequisiteIds,
      availableAfter: args.availableAfter,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const publish = mutation.protected({
  guard: articleCreate,
  args: publishArticle.args,
  load: async (ctx, args) => ({
    article: loadResource(await ctx.appIdentity(), await ctx.db.get(args.id), 'Article'),
  }),
  handler: async (ctx, args, { article }) => {
    if (article.status === 'published') throw deny('Already published.')
    await ctx.db.patch(args.id, { status: 'published', updatedAt: Date.now() })
  },
})

export const markCompleted = mutation.protected({
  guard: articleRead,
  args: markArticleCompleted.args,
  load: async (ctx, args) => ({
    article: loadResource(await ctx.appIdentity(), await ctx.db.get(args.articleId), 'Article'),
  }),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()

    const existing = await ctx.db
      .query('articleProgress')
      .withIndex('by_user_article', (q) =>
        q.eq('userId', appIdentity.userId).eq('articleId', args.articleId),
      )
      .first()

    if (existing) {
      if (!existing.completedAt) {
        await ctx.db.patch(existing._id, { completedAt: Date.now() })
      }
      return existing._id
    }

    return ctx.db.insert('articleProgress', {
      workspaceId: appIdentity.workspaceId,
      userId: appIdentity.userId,
      articleId: args.articleId,
      completedAt: Date.now(),
      createdAt: Date.now(),
    })
  },
})

export const createShareToken = mutation.protected({
  guard: shareCreate,
  args: createArticleShareToken.args,
  load: async (ctx, args) => ({
    article: loadResource(await ctx.appIdentity(), await ctx.db.get(args.articleId), 'Article'),
  }),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()

    const token = createShareTokenValue()
    const hash = await hashShareToken(token)

    await ctx.db.insert('shareTokens', {
      workspaceId: appIdentity.workspaceId,
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

export const revokeShareToken = mutation.protected({
  ...revokeShareTokenOp,
})

export const seed = mutation.protected({
  guard: articleCreate,
  args: seedDemoArticles.args,
  load: async (ctx, args) => ({
    knowledgeBase: loadResource(
      await ctx.appIdentity(),
      await ctx.db.get(args.knowledgeBaseId),
      'Knowledge base',
    ),
  }),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()

    const now = Date.now()
    const introId = await ctx.db.insert('articles', {
      workspaceId: appIdentity.workspaceId,
      knowledgeBaseId: args.knowledgeBaseId,
      title: 'Getting Started',
      body: 'Welcome to the knowledge base. This is the intro article.',
      status: 'published',
      visibility: 'workspace',
      ownerId: appIdentity.userId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('articles', {
      workspaceId: appIdentity.workspaceId,
      knowledgeBaseId: args.knowledgeBaseId,
      title: 'Advanced Topics',
      body: 'Deep dive into advanced patterns. Requires completing the intro first.',
      status: 'published',
      visibility: 'workspace',
      ownerId: appIdentity.userId,
      prerequisiteIds: [introId],
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('articles', {
      workspaceId: appIdentity.workspaceId,
      knowledgeBaseId: args.knowledgeBaseId,
      title: 'Internal Review Notes',
      body: 'Sensitive review content for editors only.',
      status: 'published',
      visibility: 'team',
      ownerId: appIdentity.userId,
      internalNotes: 'Needs legal review before Q3.',
      draftFeedback: 'Consider restructuring section 2.',
      createdAt: now,
      updatedAt: now,
    })

    return introId
  },
})
