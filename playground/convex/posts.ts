import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { query, mutation } from './_generated/server'
import {
  cleanArgs,
  requireActor,
  serviceAuthArgs,
} from './lib/actor'
import { assertPermission } from './lib/access'
import { scoped } from './lib/scoped'
import { createPostArgs, updatePostArgs } from '../shared/schemas/post'

export const list = query({
  args: { ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const s = await scoped.try(ctx, args)
    if (!s) return []
    return await s.db.query('posts').order('desc').collect()
  },
})

export const listPaginated = query({
  args: { paginationOpts: paginationOptsValidator, ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const s = await scoped.try(ctx, args)
    if (!s) {
      return {
        page: [],
        isDone: true,
        continueCursor: '',
      }
    }

    return await s.db
      .query('posts')
      .order('desc')
      .paginate(args.paginationOpts)
  },
})

export const get = query({
  args: { id: v.id('posts'), ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const s = await scoped.try(ctx, args)
    if (!s) return null
    return await s.db.get(args.id)
  },
})

export const create = mutation({
  args: { ...createPostArgs, ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const { db, actor } = await scoped(ctx, args)
    assertPermission(actor, 'post.create')

    return await db.insert('posts', {
      ...cleanArgs(args),
      status: 'draft',
      ownerId: actor.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const update = mutation({
  args: { ...updatePostArgs, ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args)
    const post = await ctx.db.get(args.id)
    if (!post) throw new Error('Post not found')
    if (post.organizationId !== actor.orgId) throw new Error('Forbidden: post.update')

    assertPermission(actor, 'post.update', post)

    await ctx.db.patch(args.id, {
      ...(args.title !== undefined && { title: args.title }),
      ...(args.content !== undefined && { content: args.content }),
      updatedAt: Date.now(),
    })
  },
})

export const remove = mutation({
  args: { id: v.id('posts'), ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args)
    const post = await ctx.db.get(args.id)
    if (!post) throw new Error('Post not found')
    if (post.organizationId !== actor.orgId) throw new Error('Forbidden: post.delete')

    assertPermission(actor, 'post.delete', post)
    await ctx.db.delete(args.id)
  },
})

export const publish = mutation({
  args: { id: v.id('posts'), ...serviceAuthArgs },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args)
    const post = await ctx.db.get(args.id)
    if (!post) throw new Error('Post not found')
    if (post.organizationId !== actor.orgId) throw new Error('Forbidden: post.publish')

    assertPermission(actor, 'post.publish', post)

    await ctx.db.patch(args.id, {
      status: 'published',
      publishedAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})
