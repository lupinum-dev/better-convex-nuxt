import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'

import {
  openQuery,
  scopedMutation,
} from './functions'
import {
  createPost,
  updatePost,
} from '../shared/schemas/post'

export const list = openQuery({
  args: {},
  handler: async ({ actor, db }) => {
    if (!actor?.tenantId) return []
    const tenantId = actor.tenantId as Id<'organizations'>

    return await db
      .query('posts')
      .withIndex('by_organization', q => q.eq('organizationId', tenantId))
      .order('desc')
      .collect()
  },
})

export const listPaginated = openQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async ({ actor, db }, args) => {
    if (!actor?.tenantId) {
      return {
        page: [],
        isDone: true,
        continueCursor: '',
      }
    }
    const tenantId = actor.tenantId as Id<'organizations'>

    return await db
      .query('posts')
      .withIndex('by_organization', q => q.eq('organizationId', tenantId))
      .order('desc')
      .paginate(args.paginationOpts)
  },
})

export const get = openQuery({
  args: { id: v.id('posts') },
  handler: async ({ actor, db }, args) => {
    if (!actor?.tenantId) return null

    const post = await db.get(args.id)
    if (!post || post.organizationId !== actor.tenantId) return null
    return post
  },
})

export const create = scopedMutation({
  args: createPost.validators,
  require: 'post.create',
  handler: async ({ db, actor }, args) => {
    return await db.insert('posts', {
      ...args,
      status: 'draft',
      ownerId: actor.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const update = scopedMutation({
  args: updatePost.validators,
  require: 'post.update',
  resource: args => args.id,
  handler: async ({ db }, args) => {
    await db.patch(args.id, {
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.content !== undefined ? { content: args.content } : {}),
      updatedAt: Date.now(),
    })
  },
})

export const remove = scopedMutation({
  args: { id: v.id('posts') },
  require: 'post.delete',
  resource: args => args.id,
  handler: async ({ db }, args) => {
    await db.delete(args.id)
  },
})

export const publish = scopedMutation({
  args: { id: v.id('posts') },
  require: 'post.publish',
  resource: args => args.id,
  handler: async ({ db }, args) => {
    await db.patch(args.id, {
      status: 'published',
      publishedAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})
