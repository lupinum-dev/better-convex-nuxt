import { defineArgs } from '@lupinum/trellis/args'
import { can, defineGuard, open } from '@lupinum/trellis/auth'
import {
  implementOperation,
  operationEffect,
  operationIssue,
  operationPreview,
  previewOf,
} from '@lupinum/trellis/backend'
import { defineRecordAccess } from '@lupinum/trellis/workspace'
import { v } from 'convex/values'

import { createPost, deletePost, removePostDescriptor, updatePost } from '../shared/schemas/post'
import type { Doc, Id } from './_generated/dataModel'
import type { AppIdentity } from './auth/appIdentity'
import type { InternalHarnessCaller } from './auth/caller'
import { canCreatePost, canDeletePost, canPublishPost, canUpdatePost } from './auth/checks'
import { mutation, query } from './functions'

const listPostsArgs = defineArgs({
  args: {},
})

const getPostArgs = defineArgs({
  args: {
    id: v.id('posts'),
  },
})

const canCreatePostActor = defineGuard<AppIdentity>('Create post', (appIdentity) => !!appIdentity)
const canManagePosts = defineGuard<AppIdentity>('post.manage', (appIdentity) => !!appIdentity)
type PostOperationCtx = {
  appIdentity: () => Promise<AppIdentity>
  caller: () => Promise<InternalHarnessCaller>
  db: {
    get(id: Id<'posts'>): Promise<Doc<'posts'> | null>
    delete?(id: Id<'posts'>): Promise<void>
  }
}
const postCapabilities = defineRecordAccess<{ ownerId: string; [key: string]: unknown }>()<
  AppIdentity,
  {
    'post.update': (
      appIdentity: AppIdentity,
      post: { ownerId: string; [key: string]: unknown },
    ) => boolean
    'post.delete': (
      appIdentity: AppIdentity,
      post: { ownerId: string; [key: string]: unknown },
    ) => boolean
    'post.publish': (
      appIdentity: AppIdentity,
      post: { ownerId: string; [key: string]: unknown },
    ) => boolean
  }
>({
  'post.update': (appIdentity, post) => can(appIdentity, canUpdatePost(post)),
  'post.delete': (appIdentity, post) => can(appIdentity, canDeletePost(post)),
  'post.publish': (appIdentity) => can(appIdentity, canPublishPost),
})

function formatAppIdentity(appIdentity: AppIdentity): string {
  if (!appIdentity) return 'null'
  return JSON.stringify({
    userId: appIdentity.userId,
    role: appIdentity.role,
    workspaceId: appIdentity.workspaceId ?? null,
    kind: appIdentity.kind,
  })
}

function denyPostPermission(
  action: 'create' | 'update' | 'delete' | 'publish',
  appIdentity: AppIdentity,
  reason: string,
): never {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Forbidden: post.${action}`)
  }

  throw new Error(
    `Forbidden: post.${action}\nAppIdentity: ${formatAppIdentity(appIdentity)}\nReason: ${reason}`,
  )
}

function denyTenantMismatch(appIdentity: AppIdentity, post: { organizationId: string }): never {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Document belongs to a different isolation scope.')
  }

  throw new Error(
    `Document belongs to a different isolation scope.\nAppIdentity: ${formatAppIdentity(appIdentity)}\nReason: organizationId ${post.organizationId}`,
  )
}

export const list = query.public({
  args: listPostsArgs.args,
  handler: async (ctx, _args) => {
    const appIdentity = await ctx.appIdentity()
    if (!appIdentity?.workspaceId) return []

    const posts = await ctx.db
      .query('posts')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', appIdentity.workspaceId as Id<'organizations'>),
      )
      .order('desc')
      .collect()

    return postCapabilities.attach(appIdentity, posts)
  },
})

export const get = query.public({
  args: getPostArgs.args,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    if (!appIdentity) return null

    const post = await ctx.db.get(args.id)
    if (!post) return null
    if (!appIdentity.workspaceId || appIdentity.workspaceId !== post.organizationId) return null

    return postCapabilities.attach(appIdentity, post)
  },
})

export const create = mutation.protected({
  args: createPost.args,
  identityForwardingFunctionRef: 'posts:create',
  guard: canCreatePostActor,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    if (!can(appIdentity, canCreatePost)) {
      denyPostPermission('create', appIdentity, `Role "${appIdentity.role}" cannot create posts.`)
    }
    if (!appIdentity.workspaceId) throw new Error('No organization selected')

    return await ctx.db.insert('posts', {
      title: args.title,
      content: args.content,
      status: 'draft',
      ownerId: appIdentity.userId,
      organizationId: appIdentity.workspaceId as Id<'organizations'>,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const update = mutation.protected({
  args: updatePost.args,
  guard: canManagePosts,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const post = await ctx.db.get(args.id)
    if (!post) throw new Error('Post not found.')
    if (!appIdentity?.workspaceId || appIdentity.workspaceId !== post.organizationId) {
      denyTenantMismatch(appIdentity, post)
    }
    if (!can(appIdentity, canUpdatePost(post))) {
      const reason =
        appIdentity?.role === 'member'
          ? 'Role "member" has own-only access.'
          : 'AppIdentity cannot update this post.'
      denyPostPermission('update', appIdentity, reason)
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
    const appIdentity = await ctx.appIdentity()
    const post = await ctx.db.get(args.id)
    if (!post) throw new Error('Post not found.')
    if (!appIdentity?.workspaceId || appIdentity.workspaceId !== post.organizationId) {
      denyTenantMismatch(appIdentity, post)
    }
    if (!can(appIdentity, canDeletePost(post))) {
      const reason =
        appIdentity?.role === 'member'
          ? 'Role "member" has own-only access.'
          : 'AppIdentity cannot delete this post.'
      denyPostPermission('delete', appIdentity, reason)
    }
    await ctx.db.delete(args.id)
  },
})

export const removePostOp = implementOperation(removePostDescriptor, {
  identityForwardingFunctionRef: 'posts:removeWithConfirmation',
  guard: canManagePosts,
  load: async (ctx: PostOperationCtx, args: { id: Id<'posts'> }) => {
    const appIdentity = await ctx.appIdentity()
    const post = await ctx.db.get(args.id)
    if (!post) throw new Error('Post not found.')
    if (!appIdentity?.workspaceId || appIdentity.workspaceId !== post.organizationId) {
      denyTenantMismatch(appIdentity, post)
    }
    if (!can(appIdentity, canDeletePost(post))) {
      const reason =
        appIdentity?.role === 'member'
          ? 'Role "member" has own-only access.'
          : 'AppIdentity cannot delete this post.'
      denyPostPermission('delete', appIdentity, reason)
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

export const removeWithConfirmation = mutation.protected({
  ...removePostOp,
  identityForwardingFunctionRef: 'posts:removeWithConfirmation',
})
export const previewRemove = mutation.protected({
  ...previewOf(removePostOp),
  identityForwardingFunctionRef: 'posts:previewRemove',
})

export const publish = mutation.protected({
  args: { id: v.id('posts') },
  guard: canManagePosts,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const post = await ctx.db.get(args.id)
    if (!post) throw new Error('Post not found.')
    if (!appIdentity?.workspaceId || appIdentity.workspaceId !== post.organizationId) {
      denyTenantMismatch(appIdentity, post)
    }
    if (!can(appIdentity, canPublishPost)) {
      denyPostPermission(
        'publish',
        appIdentity,
        `Role "${appIdentity?.role ?? 'anonymous'}" cannot publish posts.`,
      )
    }

    await ctx.db.patch(args.id, {
      status: 'published',
      publishedAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})
