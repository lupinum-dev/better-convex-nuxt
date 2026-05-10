import { defineGuard } from '@lupinum/trellis/auth'
import { defineDelegation, definePrincipal, defineTrellis } from '@lupinum/trellis/backend'
import type { FunctionsCtxExtension } from '@lupinum/trellis/backend'
import { getForwardedPrincipal, getTrustedForwarding } from '@lupinum/trellis/trusted-forwarding'
import { Triggers } from 'convex-helpers/server/triggers'
import type { GenericMutationCtx } from 'convex/server'
import { v } from 'convex/values'

import type { DataModel } from './_generated/dataModel'
import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import type { Actor } from './auth/actor'
import { getActorFromPrincipal } from './auth/actor'
import type { HarnessDelegation } from './auth/delegation'
import { delegation } from './auth/delegation'
import type { InternalHarnessPrincipal } from './auth/principal'
import { principal } from './auth/principal'

let actorResolverCalls = 0
let structuredLoadArgs: Record<string, unknown> | null = null
let structuredAuthorizeArgs: Record<string, unknown> | null = null
let structuredHandlerArgs: Record<string, unknown> | null = null
let onSuccessArgs: Record<string, unknown> | null = null

const triggers = new Triggers<
  DataModel,
  GenericMutationCtx<DataModel> &
    FunctionsCtxExtension<InternalHarnessPrincipal, HarnessDelegation, Actor>
>()

triggers.register('notes', async (ctx, change) => {
  if (change.operation !== 'insert' || !change.newDoc || change.newDoc.title) return
  await ctx.db.patch(change.id, { title: 'triggered' })
})

const { mutation, query } = defineTrellis<
  DataModel,
  'public',
  'public',
  'internal',
  'internal',
  InternalHarnessPrincipal,
  HarnessDelegation,
  Actor
>(
  { query: generatedQuery, mutation: generatedMutation },
  {
    principal,
    delegation,
    actor: async (ctx, args, resolvedPrincipal, resolvedDelegation) => {
      actorResolverCalls += 1
      return await getActorFromPrincipal(ctx, args, resolvedPrincipal, resolvedDelegation)
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

const unsafeArgPrincipalRuntime = defineTrellis<
  DataModel,
  'public',
  'public',
  'internal',
  'internal',
  InternalHarnessPrincipal,
  HarnessDelegation,
  Actor
>(
  { query: generatedQuery, mutation: generatedMutation },
  {
    principal: definePrincipal({
      validator: principal.validator,
      resolve: async (_ctx, args): Promise<InternalHarnessPrincipal> =>
        (args.principal as InternalHarnessPrincipal | undefined) ?? {
          kind: 'anonymous',
          subject: 'system:anonymous',
        },
    }),
    delegation: defineDelegation({
      validator: delegation.validator,
      resolve: async (_ctx, args): Promise<HarnessDelegation | null> =>
        (args.delegation as HarnessDelegation | undefined) ?? null,
    }),
    actor: async (ctx, args, resolvedPrincipal, resolvedDelegation) =>
      await getActorFromPrincipal(ctx, args, resolvedPrincipal, resolvedDelegation),
  },
)
const canReadStructuredProbe = defineGuard<Actor>('probe.read', (actor) => !!actor)
const canEditStructuredPost = (ownerId: string) =>
  defineGuard<NonNullable<Actor>>('probe.update', (actor) => actor.userId === ownerId)

export const publicWithoutActor = query.unsafe({
  bypass: 'Harness probe bypass without actor resolution.',
  args: {},
  handler: async () => ({
    actorResolverCalls,
  }),
})

export const structuredPublicActorEcho = query.public({
  args: {},
  handler: async (ctx) => ({
    actor: await ctx.actor(),
  }),
})

export const structuredPostOwner = query.protected({
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

export const structuredEnvelopeProbe = query.protected({
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

export const structuredDelegationProbe = query.public({
  args: {},
  trustedForwardingFunctionRef: 'functionsProbe:structuredDelegationProbe',
  handler: async (ctx) => ({
    delegation: await ctx.delegation(),
  }),
})

export const resetActorResolverCalls = mutation.unsafe({
  bypass: 'Harness probe reset for actor memoization state.',
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

export const actorMemoization = query.unsafe({
  bypass: 'Harness probe for actor memoization.',
  args: {},
  trustedForwardingFunctionRef: 'functionsProbe:actorMemoization',
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

export const trustedForwardingStateProbe = query.unsafe({
  bypass: 'Harness probe for signed forwarding context state.',
  args: {},
  trustedForwardingFunctionRef: 'functionsProbe:trustedForwardingStateProbe',
  handler: async (ctx) => ({
    trustedForwarding: getTrustedForwarding(ctx),
    forwardedPrincipal: getForwardedPrincipal(ctx),
  }),
})

export const echoedArgs = query.unsafe({
  bypass: 'Harness probe for unsafe query arg echo.',
  args: {
    title: v.string(),
  },
  trustedForwardingFunctionRef: 'functionsProbe:echoedArgs',
  handler: async (_ctx, args) => args,
})

export const onSuccessEnvelopeProbe = query.unsafe({
  bypass: 'Harness probe for onSuccess envelope capture.',
  args: {
    marker: v.string(),
  },
  handler: async (_ctx, args) => ({
    ok: true,
    marker: args.marker,
  }),
})

export const getEnvelopeProbeState = query.unsafe({
  bypass: 'Harness probe for structured envelope state.',
  args: {},
  handler: async () => ({
    structuredLoadArgs,
    structuredAuthorizeArgs,
    structuredHandlerArgs,
    onSuccessArgs,
  }),
})

export const unsafeForwardedPrincipalProbe = unsafeArgPrincipalRuntime.query.public({
  args: {},
  handler: async (ctx) => ({
    principal: await ctx.principal(),
    delegation: await ctx.delegation(),
  }),
})

export const unsafeListPosts = query.unsafe({
  bypass: 'Harness probe for unsafe post listing.',
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('posts').order('desc').collect()
  },
})

export const unsafeRenamePost = mutation.unsafe({
  bypass: 'Harness probe for unsafe post rename.',
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

export const unsafeListMcpKeys = query.unsafe({
  bypass: 'Harness probe for unsafe MCP key listing.',
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('mcpKeys').order('desc').collect()
  },
})

export const createTriggeredNote = mutation.unsafe({
  bypass: 'Harness probe for trigger execution under unsafe mutation.',
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

export const getNote = query.unsafe({
  bypass: 'Harness probe for note lookup.',
  args: {
    id: v.id('notes'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})
