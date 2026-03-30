/**
 * Why this file exists:
 * Collaboration apps usually have two auth paths at once: signed-in workspace access and token access.
 */
import { v } from 'convex/values'

import { deny, guard } from 'better-convex-nuxt/auth'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import { canCreatePage, isAuthenticated } from './auth/checks'
import { type AccessLevel, requirePageAccess } from './auth/page-access'
import { ensureFound, loadResource } from './auth/scope'
import { requireTokenLevel, resolveShareToken } from './auth/share-tokens'

function createShareTokenValue(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    guard(actor, 'Read page', isAuthenticated)

    return ctx.db
      .query('pages')
      .withIndex('by_workspace', q => q.eq('workspaceId', actor!.tenantId))
      .order('desc')
      .collect()
  },
})

export const seedDemoPages = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    guard(actor, 'Create page', canCreatePage)

    const now = Date.now()
    const rootPageId = await ctx.db.insert('pages', {
      workspaceId: actor!.tenantId,
      title: 'Workspace handbook',
      body: 'This page is the root share example.',
      visibility: 'workspace',
      ownerId: actor!.userId,
      createdAt: now,
      updatedAt: now,
    })

    const childPageId = await ctx.db.insert('pages', {
      workspaceId: actor!.tenantId,
      title: 'Pricing notes',
      body: 'This child page inherits from the parent.',
      visibility: 'private',
      parentPageId: rootPageId,
      ownerId: actor!.userId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('pageShares', {
      workspaceId: actor!.tenantId,
      pageId: rootPageId,
      userId: actor!.userId,
      level: 'edit',
      createdAt: now,
    })

    return { rootPageId, childPageId }
  },
})

export const createShareToken = mutation({
  args: {
    pageId: v.id('pages'),
    level: v.union(v.literal('view'), v.literal('comment'), v.literal('edit')),
  },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    const page = loadResource(actor, await ctx.db.get(args.pageId), 'Page')
    await requirePageAccess(ctx.db, actor, page._id, 'edit')

    const token = createShareTokenValue()
    await ctx.db.insert('shareTokens', {
      workspaceId: actor!.tenantId,
      pageId: page._id,
      token,
      level: args.level,
      createdAt: Date.now(),
    })

    return token
  },
})

export const viewPage = query({
  args: {
    id: v.id('pages'),
    shareToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.shareToken) {
      const grant = await resolveShareToken(ctx.db, args.shareToken)
      if (grant.pageId !== args.id) throw deny('Token does not match this page.')
      const page = await ctx.db.get(args.id)
      ensureFound(page, 'Page')
      if (page.workspaceId !== grant.workspaceId) throw deny('Token does not match this page.')
      return {
        ...page,
        _access: grant.level,
        _via: 'share_link',
      }
    }

    const actor = await getActor(ctx)
    guard(actor, 'View page', isAuthenticated)
    const page = loadResource(actor, await ctx.db.get(args.id), 'Page')
    const access = await requirePageAccess(ctx.db, actor, page._id, 'view')
    return {
      ...page,
      _access: access,
      _via: 'workspace',
    }
  },
})

export const commentWithToken = mutation({
  args: {
    pageId: v.id('pages'),
    shareToken: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const grant = await resolveShareToken(ctx.db, args.shareToken)
    if (grant.pageId !== args.pageId) throw deny('Token does not match this page.')
    requireTokenLevel(grant, 'comment')
    const page = await ctx.db.get(args.pageId)
    ensureFound(page, 'Page')
    if (page.workspaceId !== grant.workspaceId) throw deny('Token does not match this page.')
    return { body: args.body, via: 'share_link' }
  },
})
