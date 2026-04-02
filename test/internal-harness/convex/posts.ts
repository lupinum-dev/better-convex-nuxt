import { defineArgs } from 'better-convex-nuxt/args'
import { can, enforce } from 'better-convex-nuxt/auth'
import { v } from 'convex/values'

import { createPost, deletePost, updatePost } from '../shared/schemas/post'
import type { Id } from './_generated/dataModel'
import type { Actor } from './auth/actor'
import {
  canCreatePost,
  canDeletePost,
  canPublishPost,
  canReadPost,
  canUpdatePost,
} from './auth/checks'
import { withCan } from './auth/resource'
import { appMutation, appQuery } from './functions'

const listPostsArgs = defineArgs({
  args: {},
})

const getPostArgs = defineArgs({
  args: {
    id: v.id('posts'),
  },
})

function attachPostPermissions(
  actor: Exclude<Actor, null>,
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

export const list = appQuery({
  args: listPostsArgs.args,
  handler: async (ctx, _args) => {
    const actor = await ctx.actor()
    if (!actor?.tenantId) return []

    enforce(actor, 'Read posts', canReadPost)

    const posts = await ctx.db
      .query('posts')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', actor.tenantId as Id<'organizations'>),
      )
      .order('desc')
      .collect()

    return posts.map((post) => attachPostPermissions(actor, post))
  },
})

export const get = appQuery({
  args: getPostArgs.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    if (!actor) return null

    enforce(actor, 'Read post', canReadPost)

    const post = await ctx.db.get(args.id)
    if (!post) return null
    if (!actor.tenantId || actor.tenantId !== post.organizationId) return null

    return attachPostPermissions(actor, post)
  },
})

export const create = appMutation({
  args: createPost.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    if (!actor) {
      throw new Error('Authentication required.')
    }
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

export const update = appMutation({
  args: updatePost.args,
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

export const remove = appMutation({
  args: deletePost.args,
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

export const publish = appMutation({
  args: { id: v.id('posts') },
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
