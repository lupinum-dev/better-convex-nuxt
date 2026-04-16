import { defineArgs } from '@lupinum/trellis/args'
import { can, defineGuard, open } from '@lupinum/trellis/auth'
import { defineOperation, previewOf } from '@lupinum/trellis/functions'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'
import { defineCapabilities } from '@lupinum/trellis/visibility'
import { v } from 'convex/values'

import { createPost, deletePost, updatePost } from '../shared/schemas/post'
import type { DataModel, Id } from './_generated/dataModel'
import type { Actor } from './auth/actor'
import { canCreatePost, canDeletePost, canPublishPost, canUpdatePost } from './auth/checks'
import type { InternalHarnessPrincipal } from './auth/principal'
import { mutation, query } from './functions'

const listPostsArgs = defineArgs({
  args: {},
})

const getPostArgs = defineArgs({
  args: {
    id: v.id('posts'),
  },
})

const canCreatePostActor = defineGuard<Actor>('Create post', (actor) => !!actor)
const canManagePosts = defineGuard<Actor>('post.manage', (actor) => !!actor)
type PostOperationCtx = {
  actor: () => Promise<Actor>
  db: Pick<GenericQueryCtx<DataModel>['db'], 'get'> &
    Pick<GenericMutationCtx<DataModel>['db'], 'delete'>
}

const postCapabilities = defineCapabilities<{ ownerId: string; [key: string]: unknown }>()<
  Actor,
  {
    'post.update': (actor: Actor, post: { ownerId: string; [key: string]: unknown }) => boolean
    'post.delete': (actor: Actor, post: { ownerId: string; [key: string]: unknown }) => boolean
    'post.publish': (actor: Actor, post: { ownerId: string; [key: string]: unknown }) => boolean
  }
>({
  'post.update': (actor, post) => can(actor, canUpdatePost(post)),
  'post.delete': (actor, post) => can(actor, canDeletePost(post)),
  'post.publish': (actor) => can(actor, canPublishPost),
})

function formatActor(actor: Actor): string {
  if (!actor) return 'null'
  return JSON.stringify({
    userId: actor.userId,
    role: actor.role,
    tenantId: actor.tenantId ?? null,
    kind: actor.kind,
  })
}

function denyPostPermission(
  action: 'create' | 'update' | 'delete' | 'publish',
  actor: Actor,
  reason: string,
): never {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Forbidden: post.${action}`)
  }

  throw new Error(`Forbidden: post.${action}\nActor: ${formatActor(actor)}\nReason: ${reason}`)
}

function denyTenantMismatch(actor: Actor, post: { organizationId: string }): never {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Document belongs to a different tenant.')
  }

  throw new Error(
    `Document belongs to a different tenant.\nActor: ${formatActor(actor)}\nReason: organizationId ${post.organizationId}`,
  )
}

export const list = query({
  args: listPostsArgs.args,
  guard: open,
  handler: async (ctx, _args) => {
    const actor = await ctx.actor()
    if (!actor?.tenantId) return []

    const posts = await ctx.db
      .query('posts')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', actor.tenantId as Id<'organizations'>),
      )
      .order('desc')
      .collect()

    return postCapabilities.attach(actor, posts)
  },
})

export const get = query({
  args: getPostArgs.args,
  guard: open,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    if (!actor) return null

    const post = await ctx.db.get(args.id)
    if (!post) return null
    if (!actor.tenantId || actor.tenantId !== post.organizationId) return null

    return postCapabilities.attach(actor, post)
  },
})

export const create = mutation({
  args: createPost.args,
  guard: canCreatePostActor,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    if (!can(actor, canCreatePost)) {
      denyPostPermission('create', actor, `Role "${actor.role}" cannot create posts.`)
    }
    if (!actor.tenantId) throw new Error('No organization selected')

    return await ctx.db.insert('posts', {
      title: args.title,
      content: args.content,
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
  guard: canManagePosts,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const post = await ctx.db.get(args.id)
    if (!post) throw new Error('Post not found.')
    if (!actor?.tenantId || actor.tenantId !== post.organizationId) {
      denyTenantMismatch(actor, post)
    }
    if (!can(actor, canUpdatePost(post))) {
      const reason =
        actor?.role === 'member'
          ? 'Role "member" has own-only access.'
          : 'Actor cannot update this post.'
      denyPostPermission('update', actor, reason)
    }

    await ctx.db.patch(args.id, {
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.content !== undefined ? { content: args.content } : {}),
      updatedAt: Date.now(),
    })
  },
})

export const remove = mutation({
  args: deletePost.args,
  guard: canManagePosts,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const post = await ctx.db.get(args.id)
    if (!post) throw new Error('Post not found.')
    if (!actor?.tenantId || actor.tenantId !== post.organizationId) {
      denyTenantMismatch(actor, post)
    }
    if (!can(actor, canDeletePost(post))) {
      const reason =
        actor?.role === 'member'
          ? 'Role "member" has own-only access.'
          : 'Actor cannot delete this post.'
      denyPostPermission('delete', actor, reason)
    }
    await ctx.db.delete(args.id)
  },
})

export const removePostOp = defineOperation<
  PostOperationCtx,
  InternalHarnessPrincipal,
  Actor,
  any,
  typeof deletePost.args,
  { post: { _id: Id<'posts'>; title: string; organizationId: string; ownerId: string } },
  null,
  {
    display: {
      summary: string
      warn: string
      affects: { posts: number }
      blocked?: boolean
    }
    confirm: {
      operation: 'posts.remove'
      targetId: Id<'posts'>
      affectedCounts: { posts: number }
    }
  }
>({
  id: 'posts.remove',
  name: 'removePost',
  kind: 'destructive',
  args: deletePost.args,
  returns: v.null(),
  previewReturns: v.object({
    display: v.object({
      summary: v.string(),
      warn: v.string(),
      affects: v.object({
        posts: v.number(),
      }),
      blocked: v.optional(v.boolean()),
    }),
    confirm: v.object({
      operation: v.literal('posts.remove'),
      targetId: v.id('posts'),
      affectedCounts: v.object({
        posts: v.number(),
      }),
    }),
  }),
  guard: canManagePosts as never,
  load: async (ctx, args) => {
    const actor = await ctx.actor()
    const post = await ctx.db.get(args.id)
    if (!post) throw new Error('Post not found.')
    if (!actor?.tenantId || actor.tenantId !== post.organizationId) {
      denyTenantMismatch(actor, post)
    }
    if (!can(actor, canDeletePost(post))) {
      const reason =
        actor?.role === 'member'
          ? 'Role "member" has own-only access.'
          : 'Actor cannot delete this post.'
      denyPostPermission('delete', actor, reason)
    }

    return { post }
  },
  preview: async (_ctx, _args, { post }) => ({
    display: {
      summary: `Will permanently delete "${post.title}"`,
      warn: 'This cannot be undone',
      affects: { posts: 1 },
    },
    confirm: {
      operation: 'posts.remove',
      targetId: post._id,
      affectedCounts: { posts: 1 },
    },
  }),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
    return null
  },
})

export const removeWithConfirmation = mutation(removePostOp as never)
export const previewRemove = query(previewOf(removePostOp) as never)

export const publish = mutation({
  args: { id: v.id('posts') },
  guard: canManagePosts,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const post = await ctx.db.get(args.id)
    if (!post) throw new Error('Post not found.')
    if (!actor?.tenantId || actor.tenantId !== post.organizationId) {
      denyTenantMismatch(actor, post)
    }
    if (!can(actor, canPublishPost)) {
      denyPostPermission(
        'publish',
        actor,
        `Role "${actor?.role ?? 'anonymous'}" cannot publish posts.`,
      )
    }

    await ctx.db.patch(args.id, {
      status: 'published',
      publishedAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})
