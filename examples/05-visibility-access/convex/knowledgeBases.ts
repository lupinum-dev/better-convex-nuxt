import { deny, loadTenantResource as loadResource } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { canCreateKB, canManageEnrollments, canReadKB } from './auth/checks'
import { app } from './functions'

export const list = app.query({
  guard: canReadKB,
  args: {},
  handler: async (ctx) => {
    const actor = await ctx.actor()

    return ctx.db
      .query('knowledgeBases')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .collect()
  },
})

export const get = app.query({
  guard: canReadKB,
  args: { id: v.id('knowledgeBases') },
  load: async (ctx, args) => ({
    knowledgeBase: loadResource(await ctx.actor(), await ctx.db.get(args.id), 'Knowledge base'),
  }),
  handler: async (_ctx, _args, { knowledgeBase }) => {
    return knowledgeBase
  },
})

export const create = app.mutation({
  guard: canCreateKB,
  args: { title: v.string() },
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

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

export const publish = app.mutation({
  guard: canCreateKB,
  args: { id: v.id('knowledgeBases') },
  load: async (ctx, args) => ({
    knowledgeBase: loadResource(await ctx.actor(), await ctx.db.get(args.id), 'Knowledge base'),
  }),
  handler: async (ctx, args, { knowledgeBase }) => {
    if (knowledgeBase.status === 'published') throw deny('Already published.')
    await ctx.db.patch(args.id, { status: 'published', updatedAt: Date.now() })
  },
})

export const enroll = app.mutation({
  guard: canManageEnrollments,
  args: { knowledgeBaseId: v.id('knowledgeBases'), userId: v.string() },
  load: async (ctx, args) => ({
    knowledgeBase: loadResource(
      await ctx.actor(),
      await ctx.db.get(args.knowledgeBaseId),
      'Knowledge base',
    ),
  }),
  handler: async (ctx, args, { knowledgeBase }) => {
    const actor = await ctx.actor()

    const existing = await ctx.db
      .query('enrollments')
      .withIndex('by_user_kb', (q) =>
        q.eq('userId', args.userId).eq('knowledgeBaseId', knowledgeBase._id),
      )
      .first()

    if (existing?.status === 'active') return existing._id

    if (existing) {
      await ctx.db.patch(existing._id, { status: 'active' })
      return existing._id
    }

    return ctx.db.insert('enrollments', {
      workspaceId: actor.tenantId,
      userId: args.userId,
      knowledgeBaseId: knowledgeBase._id,
      status: 'active',
      createdAt: Date.now(),
    })
  },
})

export const enrollByEmail = app.mutation({
  guard: canManageEnrollments,
  args: { knowledgeBaseId: v.id('knowledgeBases'), email: v.string() },
  load: async (ctx, args) => ({
    knowledgeBase: loadResource(
      await ctx.actor(),
      await ctx.db.get(args.knowledgeBaseId),
      'Knowledge base',
    ),
  }),
  handler: async (ctx, args, { knowledgeBase }) => {
    const actor = await ctx.actor()

    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .first()
    if (!user) throw new Error(`No user found with email "${args.email}".`)

    const existing = await ctx.db
      .query('enrollments')
      .withIndex('by_user_kb', (q) =>
        q.eq('userId', user.authId).eq('knowledgeBaseId', knowledgeBase._id),
      )
      .first()

    if (existing?.status === 'active') return existing._id

    if (existing) {
      await ctx.db.patch(existing._id, { status: 'active' })
      return existing._id
    }

    return ctx.db.insert('enrollments', {
      workspaceId: actor.tenantId,
      userId: user.authId,
      knowledgeBaseId: knowledgeBase._id,
      status: 'active',
      createdAt: Date.now(),
    })
  },
})
