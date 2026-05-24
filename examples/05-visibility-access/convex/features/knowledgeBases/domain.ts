import { deny, loadTenantResource as loadResource } from '@lupinum/trellis/auth'

import {
  createKnowledgeBase,
  enrollKnowledgeBaseUser,
  enrollKnowledgeBaseUserByEmail,
  getKnowledgeBase,
  listKnowledgeBases,
  publishKnowledgeBase,
} from '../../../shared/features/knowledgeBases/contract'
import { mutation, query } from '../../functions'
import { enrollmentManage, kbCreate, kbRead } from './permissions'

export const list = query.protected({
  guard: kbRead,
  args: listKnowledgeBases.args,
  handler: async (ctx) => {
    const appIdentity = await ctx.appIdentity()
    if (!appIdentity) throw deny('Not available.')

    return ctx.db
      .query('knowledgeBases')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', appIdentity.workspaceId))
      .order('desc')
      .collect()
  },
})

export const get = query.protected({
  guard: kbRead,
  args: getKnowledgeBase.args,
  load: async (ctx, args) => ({
    knowledgeBase: loadResource(
      await ctx.appIdentity(),
      await ctx.db.get(args.id),
      'Knowledge base',
    ),
  }),
  handler: async (_ctx, _args, { knowledgeBase }) => knowledgeBase,
})

export const create = mutation.protected({
  guard: kbCreate,
  args: createKnowledgeBase.args,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    if (!appIdentity) throw deny('Not available.')

    const now = Date.now()
    return ctx.db.insert('knowledgeBases', {
      workspaceId: appIdentity.workspaceId,
      title: args.title,
      status: 'draft',
      ownerId: appIdentity.userId,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const publish = mutation.protected({
  guard: kbCreate,
  args: publishKnowledgeBase.args,
  load: async (ctx, args) => ({
    knowledgeBase: loadResource(
      await ctx.appIdentity(),
      await ctx.db.get(args.id),
      'Knowledge base',
    ),
  }),
  handler: async (ctx, args, { knowledgeBase }) => {
    if (knowledgeBase.status === 'published') throw deny('Already published.')
    await ctx.db.patch(args.id, { status: 'published', updatedAt: Date.now() })
  },
})

export const enroll = mutation.protected({
  guard: enrollmentManage,
  args: enrollKnowledgeBaseUser.args,
  load: async (ctx, args) => ({
    knowledgeBase: loadResource(
      await ctx.appIdentity(),
      await ctx.db.get(args.knowledgeBaseId),
      'Knowledge base',
    ),
  }),
  handler: async (ctx, args, { knowledgeBase }) => {
    const appIdentity = await ctx.appIdentity()
    if (!appIdentity) throw deny('Not available.')

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
      workspaceId: appIdentity.workspaceId,
      userId: args.userId,
      knowledgeBaseId: knowledgeBase._id,
      status: 'active',
      createdAt: Date.now(),
    })
  },
})

export const enrollByEmail = mutation.protected({
  guard: enrollmentManage,
  args: enrollKnowledgeBaseUserByEmail.args,
  load: async (ctx, args) => ({
    knowledgeBase: loadResource(
      await ctx.appIdentity(),
      await ctx.db.get(args.knowledgeBaseId),
      'Knowledge base',
    ),
  }),
  handler: async (ctx, args, { knowledgeBase }) => {
    const appIdentity = await ctx.appIdentity()
    if (!appIdentity) throw deny('Not available.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .first()
    if (!user) throw new Error(`No user found with email "${args.email}".`)

    const existing = await ctx.db
      .query('enrollments')
      .withIndex('by_user_kb', (q) =>
        q.eq('userId', user._id).eq('knowledgeBaseId', knowledgeBase._id),
      )
      .first()

    if (existing?.status === 'active') return existing._id

    if (existing) {
      await ctx.db.patch(existing._id, { status: 'active' })
      return existing._id
    }

    return ctx.db.insert('enrollments', {
      workspaceId: appIdentity.workspaceId,
      userId: user._id,
      knowledgeBaseId: knowledgeBase._id,
      status: 'active',
      createdAt: Date.now(),
    })
  },
})
