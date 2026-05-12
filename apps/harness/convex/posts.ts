import { defineArgs } from '@lupinum/trellis/args'
import { can, defineGuard, open } from '@lupinum/trellis/auth'
import {
  implementOperation,
  operationEffect,
  operationIssue,
  operationPreview,
  previewOf,
} from '@lupinum/trellis/backend'
import { defineCapabilities } from '@lupinum/trellis/visibility'
import { v } from 'convex/values'

import { createPost, deletePost, removePostDescriptor, updatePost } from '../shared/schemas/post'
import type { Doc, Id } from './_generated/dataModel'
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
  principal: () => Promise<InternalHarnessPrincipal>
  db: {
    get(id: Id<'posts'>): Promise<Doc<'posts'> | null>
    delete?(id: Id<'posts'>): Promise<void>
  }
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

export const list = query.public({
  args: listPostsArgs.args,
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

export const get = query.public({
  args: getPostArgs.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    if (!actor) return null

    const post = await ctx.db.get(args.id)
    if (!post) return null
    if (!actor.tenantId || actor.tenantId !== post.organizationId) return null

    return postCapabilities.attach(actor, post)
  },
})

export const create = mutation.protected({
  args: createPost.args,
  trustedForwardingFunctionRef: 'posts:create',
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

export const update = mutation.protected({
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

export const remove = mutation.protected({
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

export const removePostOp = implementOperation(removePostDescriptor, {
  guard: canManagePosts,
  load: async (ctx: PostOperationCtx, args: { id: Id<'posts'> }) => {
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
  preview: async (
    _ctx: PostOperationCtx,
    _args: { id: Id<'posts'> },
    { post }: { post: Doc<'posts'> },
  ) =>
    operationPreview({
      summary: `Will permanently delete "${post.title}"`,
      warnings: [operationIssue({ code: 'irreversible', message: 'This cannot be undone' })],
      effects: [operationEffect({ kind: 'delete', summary: 'Delete one post', count: 1 })],
      confirm: {
        operation: 'posts.remove',
        targetId: post._id,
        affectedCounts: { posts: 1 },
      },
    }),
  handler: async (ctx: PostOperationCtx, args: { id: Id<'posts'> }) => {
    if (!ctx.db.delete) {
      throw new Error('Post removal requires a mutation context.')
    }
    await ctx.db.delete(args.id)
    return null
  },
})

export const removeWithConfirmation = mutation.protected(removePostOp)
export const previewRemove = query.protected(previewOf(removePostOp))

export const publish = mutation.protected({
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
