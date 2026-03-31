import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { can, authorize } from 'better-convex-nuxt/auth'

import { mutation, query } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { getActor } from './auth/actor'
import {
  canCreatePost,
  canDeletePost,
  canPublishPost,
  canReadPost,
  canUpdatePost,
} from './auth/checks'
import { withCan } from './auth/resource'
import { loadResource } from './auth/scope'
import {
  createPost,
  updatePost,
} from '../shared/schemas/post'

function attachPostPermissions(
  actor: Awaited<ReturnType<typeof getActor>>,
  post: {
    ownerId: string
    [key: string]: unknown
  },
) {
  return withCan(post, {
    'post.update': can(actor, canUpdatePost(post)),
    'post.delete': can(actor, canDeletePost(post)),
    'post.publish': can(actor, canPublishPost),
  })
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor?.tenantId) return []

    authorize(actor, 'Read posts', canReadPost)

    const posts = await ctx.db
      .query('posts')
      .withIndex('by_organization', q => q.eq('organizationId', actor.tenantId as Id<'organizations'>))
      .order('desc')
      .collect()

    return posts.map(post => attachPostPermissions(actor, post))
  },
})

export const listPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    if (!actor?.tenantId) {
      return { page: [], isDone: true, continueCursor: '' }
    }

    authorize(actor, 'Read posts', canReadPost)

    const result = await ctx.db
      .query('posts')
      .withIndex('by_organization', q => q.eq('organizationId', actor.tenantId as Id<'organizations'>))
      .order('desc')
      .paginate(args.paginationOpts)

    return {
      ...result,
      page: result.page.map(post => attachPostPermissions(actor, post)),
    }
  },
})

export const get = query({
  args: { id: v.id('posts') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    if (!actor) return null

    authorize(actor, 'Read post', canReadPost)

    const post = loadResource(actor, await ctx.db.get(args.id), 'Post')
    return attachPostPermissions(actor, post)
  },
})

export const create = mutation({
  args: createPost.args,
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Create post', canCreatePost)
    if (!actor.tenantId) throw new Error('No organization selected')

    return await ctx.db.insert('posts', {
      ...args,
      status: 'draft',
      ownerId: actor.userId,
      organizationId: actor.tenantId as Id<'organizations'>,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const update = mutation({
  args: updatePost.args,
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    const post = loadResource(actor, await ctx.db.get(args.id), 'Post')
    authorize(actor, 'Update post', canUpdatePost(post))

    await ctx.db.patch(args.id, {
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.content !== undefined ? { content: args.content } : {}),
      updatedAt: Date.now(),
    })
  },
})

export const remove = mutation({
  args: { id: v.id('posts') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    const post = loadResource(actor, await ctx.db.get(args.id), 'Post')
    authorize(actor, 'Delete post', canDeletePost(post))
    await ctx.db.delete(args.id)
  },
})

export const publish = mutation({
  args: { id: v.id('posts') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    const post = loadResource(actor, await ctx.db.get(args.id), 'Post')
    authorize(actor, 'Publish post', canPublishPost)

    await ctx.db.patch(args.id, {
      status: 'published',
      publishedAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})
