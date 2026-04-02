import { defineGuard, open } from 'better-convex-nuxt/auth'
import { createApp } from 'better-convex-nuxt/functions'
import { Triggers } from 'convex-helpers/server/triggers'
import { v } from 'convex/values'

import type { DataModel } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import type { Actor } from './auth/actor'
import { getActor } from './auth/actor'

let actorResolverCalls = 0

const triggers = new Triggers<DataModel>()

triggers.register('notes', async (ctx, change) => {
  if (change.operation !== 'insert' || !change.newDoc || change.newDoc.title) return
  await ctx.db.patch(change.id, { title: 'triggered' })
})

const { app: structured, raw } = createApp(query, mutation, {
  actor: async (ctx) => {
    actorResolverCalls += 1
    return await getActor(ctx)
  },
  tenantIsolation: {
    tables: ['posts', 'comments', 'mcpKeys'],
    field: 'organizationId',
  },
  triggers,
})
const canReadStructuredProbe = defineGuard<Actor>('probe.read', (actor) => !!actor)
const canEditStructuredPost = (ownerId: string) =>
  defineGuard<NonNullable<Actor>>('probe.update', (actor) => actor.userId === ownerId)

export const publicWithoutActor = raw.query({
  args: {},
  handler: async () => ({
    actorResolverCalls,
  }),
})

export const structuredPublicActorEcho = structured.query({
  args: {},
  guard: open,
  handler: async (ctx) => ({
    actor: await ctx.actor(),
  }),
})

export const structuredPostOwner = structured.query({
  args: {
    id: v.id('posts'),
  },
  guard: canReadStructuredProbe,
  load: async (ctx, args) => ({
    post: await ctx.db.get(args.id),
  }),
  authorize: {
    label: 'probe.update',
    check: (_actor, loaded) => !!loaded.post && canEditStructuredPost(loaded.post.ownerId),
  },
  handler: async (_ctx, _args, loaded) => ({
    ownerId: loaded.post?.ownerId ?? null,
  }),
})

export const resetActorResolverCalls = mutation({
  args: {},
  handler: async () => {
    actorResolverCalls = 0
    return actorResolverCalls
  },
})

export const actorMemoization = raw.query({
  args: {},
  handler: async (ctx) => {
    const before = actorResolverCalls
    const first = await ctx.actor()
    const second = await ctx.actor()

    return {
      before,
      after: actorResolverCalls,
      sameReference: first === second,
      actor: first,
    }
  },
})

export const echoedArgs = raw.query({
  args: {
    title: v.string(),
  },
  handler: async (_ctx, args) => args,
})

export const unsafeListPosts = raw.query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('posts').order('desc').collect()
  },
})

export const unsafeRenamePost = raw.mutation({
  args: {
    id: v.id('posts'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      title: args.title,
      updatedAt: Date.now(),
    })

    return await ctx.db.get(args.id)
  },
})

export const createTriggeredNote = raw.mutation({
  args: {
    content: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('notes', {
      content: args.content,
      createdAt: Date.now(),
    })
  },
})

export const getNote = query({
  args: {
    id: v.id('notes'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})
