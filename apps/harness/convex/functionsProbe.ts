import { defineGuard, open } from '@lupinum/trellis/auth'
import { defineTrellis } from '@lupinum/trellis/functions'
import type { FunctionsCtxExtension } from '@lupinum/trellis/functions'
import { Triggers } from 'convex-helpers/server/triggers'
import type { GenericMutationCtx } from 'convex/server'
import { v } from 'convex/values'

import type { DataModel } from './_generated/dataModel'
import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import type { Actor } from './auth/actor'
import { getActorFromPrincipal } from './auth/actor'
import type { InternalHarnessPrincipal } from './auth/principal'
import { principal } from './auth/principal'

let actorResolverCalls = 0
let structuredLoadArgs: Record<string, unknown> | null = null
let structuredAuthorizeArgs: Record<string, unknown> | null = null
let structuredHandlerArgs: Record<string, unknown> | null = null
let onSuccessArgs: Record<string, unknown> | null = null

const triggers = new Triggers<
  DataModel,
  GenericMutationCtx<DataModel> & FunctionsCtxExtension<InternalHarnessPrincipal, Actor>
>()

triggers.register('notes', async (ctx, change) => {
  if (change.operation !== 'insert' || !change.newDoc || change.newDoc.title) return
  await ctx.db.patch(change.id, { title: 'triggered' })
})

const { mutation, query, raw } = defineTrellis<
  DataModel,
  'public',
  'public',
  'internal',
  'internal',
  InternalHarnessPrincipal,
  Actor
>(
  { query: generatedQuery, mutation: generatedMutation },
  {
    principal,
    actor: async (ctx, args, resolvedPrincipal) => {
      actorResolverCalls += 1
      return await getActorFromPrincipal(ctx, args, resolvedPrincipal)
    },
    tenantIsolation: {
      tables: ['posts', 'comments', 'mcpKeys'],
      field: 'organizationId',
    },
    onSuccess: {
      query: ({ args }) => {
        if (typeof args.marker === 'string') {
          onSuccessArgs = args
        }
      },
    },
    triggers,
  },
)
const canReadStructuredProbe = defineGuard<Actor>('probe.read', (actor) => !!actor)
const canEditStructuredPost = (ownerId: string) =>
  defineGuard<NonNullable<Actor>>('probe.update', (actor) => actor.userId === ownerId)

export const publicWithoutActor = raw.query({
  args: {},
  handler: async () => ({
    actorResolverCalls,
  }),
})

export const structuredPublicActorEcho = query({
  args: {},
  guard: open,
  handler: async (ctx) => ({
    actor: await ctx.actor(),
  }),
})

export const structuredPostOwner = query({
  args: {
    id: v.id('posts'),
  },
  guard: canReadStructuredProbe,
  load: async (ctx, args) => ({
    post: await ctx.db.get(args.id),
  }),
  authorize: {
    label: 'probe.update',
    check: (_actor, loaded) => (loaded?.post ? canEditStructuredPost(loaded.post.ownerId) : false),
  },
  handler: async (_ctx, _args, loaded) => ({
    ownerId: loaded?.post?.ownerId ?? null,
  }),
})

export const structuredEnvelopeProbe = query({
  args: {
    title: v.string(),
  },
  guard: canReadStructuredProbe,
  load: async (_ctx, args) => {
    structuredLoadArgs = args
    return {
      echoedTitle: args.title,
    }
  },
  authorize: {
    label: 'probe.capture',
    check: (_actor, _loaded, args) => {
      structuredAuthorizeArgs = args
      return true
    },
  },
  handler: async (_ctx, args, loaded) => {
    structuredHandlerArgs = args
    return {
      args,
      loaded,
    }
  },
})

export const resetActorResolverCalls = raw.mutation({
  args: {},
  handler: async () => {
    actorResolverCalls = 0
    structuredLoadArgs = null
    structuredAuthorizeArgs = null
    structuredHandlerArgs = null
    onSuccessArgs = null
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

export const onSuccessEnvelopeProbe = raw.query({
  args: {
    marker: v.string(),
  },
  handler: async (_ctx, args) => ({
    ok: true,
    marker: args.marker,
  }),
})

export const getEnvelopeProbeState = raw.query({
  args: {},
  handler: async () => ({
    structuredLoadArgs,
    structuredAuthorizeArgs,
    structuredHandlerArgs,
    onSuccessArgs,
  }),
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

export const unsafeListMcpKeys = raw.query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('mcpKeys').order('desc').collect()
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

export const getNote = raw.query({
  args: {
    id: v.id('notes'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})
