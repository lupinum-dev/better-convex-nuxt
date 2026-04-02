import { enforce, deny } from 'better-convex-nuxt/auth'
import { v } from 'convex/values'

import { canCreateKB, canManageEnrollments, canReadKB } from './auth/checks'
import { loadResource } from './auth/scope'
import { appMutation, appQuery } from './functions'

export const list = appQuery({
  args: {},
  handler: async (ctx) => {
    const actor = await ctx.actor()
    enforce(actor, 'Read knowledge bases', canReadKB)

    return ctx.db
      .query('knowledgeBases')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .collect()
  },
})

export const get = appQuery({
  args: { id: v.id('knowledgeBases') },
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    enforce(actor, 'Read knowledge bases', canReadKB)
    return loadResource(actor, await ctx.db.get(args.id), 'Knowledge base')
  },
})

export const create = appMutation({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    enforce(actor, 'Create knowledge base', canCreateKB)

    const now = Date.now()
    return ctx.db.insert('knowledgeBases', {
      workspaceId: actor.tenantId,
      title: args.title,
      status: 'draft',
      ownerId: actor.userId,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const publish = appMutation({
  args: { id: v.id('knowledgeBases') },
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    enforce(actor, 'Create knowledge base', canCreateKB)
    const kb = loadResource(actor, await ctx.db.get(args.id), 'Knowledge base')
    if (kb.status === 'published') throw deny('Already published.')
    await ctx.db.patch(args.id, { status: 'published', updatedAt: Date.now() })
  },
})

export const enroll = appMutation({
  args: { knowledgeBaseId: v.id('knowledgeBases'), userId: v.string() },
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    enforce(actor, 'Manage enrollments', canManageEnrollments)
    const kb = loadResource(actor, await ctx.db.get(args.knowledgeBaseId), 'Knowledge base')

    const existing = await ctx.db
      .query('enrollments')
      .withIndex('by_user_kb', (q) => q.eq('userId', args.userId).eq('knowledgeBaseId', kb._id))
      .first()

    if (existing?.status === 'active') return existing._id

    if (existing) {
      await ctx.db.patch(existing._id, { status: 'active' })
      return existing._id
    }

    return ctx.db.insert('enrollments', {
      workspaceId: actor.tenantId,
      userId: args.userId,
      knowledgeBaseId: kb._id,
      status: 'active',
      createdAt: Date.now(),
    })
  },
})
