import { defineGuard } from '@lupinum/trellis/auth'
import {
  defineActingFor,
  defineCaller,
  defineTrellis,
  getForwardedCaller,
  getIdentityForwarding,
  unsafe as unsafePermit,
} from '@lupinum/trellis/backend'
import type { FunctionsCtxExtension } from '@lupinum/trellis/backend'
import { Triggers } from 'convex-helpers/server/triggers'
import type { GenericMutationCtx } from 'convex/server'
import { v } from 'convex/values'

import type { DataModel } from './_generated/dataModel'
import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import type { HarnessDelegation } from './auth/actingFor'
import { actingFor } from './auth/actingFor'
import type { AppIdentity } from './auth/appIdentity'
import { getAppIdentityFromCaller } from './auth/appIdentity'
import type { InternalHarnessCaller } from './auth/caller'
import { caller } from './auth/caller'

let actorResolverCalls = 0
let structuredLoadArgs: Record<string, unknown> | null = null
let structuredAuthorizeArgs: Record<string, unknown> | null = null
let structuredHandlerArgs: Record<string, unknown> | null = null
let onSuccessArgs: Record<string, unknown> | null = null

const triggers = new Triggers<
  DataModel,
  GenericMutationCtx<DataModel> &
    FunctionsCtxExtension<InternalHarnessCaller, HarnessDelegation, AppIdentity>
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
  InternalHarnessCaller,
  HarnessDelegation,
  AppIdentity
>(
  { query: generatedQuery, mutation: generatedMutation },
  {
    caller,
    actingFor,
    appIdentity: async (ctx, args, resolvedCaller, resolvedActingFor) => {
      actorResolverCalls += 1
      return await getAppIdentityFromCaller(ctx, args, resolvedCaller, resolvedActingFor)
    },
    isolation: {
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
  InternalHarnessCaller,
  HarnessDelegation,
  AppIdentity
>(
  { query: generatedQuery, mutation: generatedMutation },
  {
    caller: defineCaller({
      validator: caller.validator,
      resolve: async (_ctx, args): Promise<InternalHarnessCaller> =>
        (args.caller as InternalHarnessCaller | undefined) ?? {
          kind: 'anonymous',
          subject: 'system:anonymous',
        },
    }),
    actingFor: defineActingFor({
      validator: actingFor.validator,
      resolve: async (_ctx, args): Promise<HarnessDelegation | null> =>
        (args.actingFor as HarnessDelegation | undefined) ?? null,
    }),
    appIdentity: async (ctx, args, resolvedCaller, resolvedActingFor) =>
      await getAppIdentityFromCaller(ctx, args, resolvedCaller, resolvedActingFor),
  },
)
const canReadStructuredProbe = defineGuard<AppIdentity>(
  'probe.read',
  (appIdentity) => !!appIdentity,
)
const canEditStructuredPost = (ownerId: string) =>
  defineGuard<NonNullable<AppIdentity>>(
    'probe.update',
    (appIdentity) => appIdentity.userId === ownerId,
  )
const harnessPermit = (reason: string) =>
  unsafePermit.permit({
    kind: 'harnessProbe',
    reason,
    scope: ['harness'],
  })

export const publicWithoutActor = query.unsafe({
  permit: harnessPermit('Harness probe bypass without appIdentity resolution.'),
  args: {},
  handler: async () => ({
    actorResolverCalls,
  }),
})

export const structuredPublicActorEcho = query.public({
  args: {},
  handler: async (ctx) => ({
    appIdentity: await ctx.appIdentity(),
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
  identityForwardingFunctionRef: 'functionsProbe:structuredDelegationProbe',
  handler: async (ctx) => ({
    actingFor: await ctx.actingFor(),
  }),
})

export const resetActorResolverCalls = mutation.unsafe({
  permit: harnessPermit('Harness probe reset for appIdentity memoization state.'),
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

export const actorMemoization = query.public({
  args: {},
  identityForwardingFunctionRef: 'functionsProbe:actorMemoization',
  handler: async (ctx) => {
    const before = actorResolverCalls
    const first = await ctx.appIdentity()
    const second = await ctx.appIdentity()

    return {
      before,
      after: actorResolverCalls,
      sameReference: first === second,
      appIdentity: first,
    }
  },
})

export const identityForwardingStateProbe = query.public({
  args: {},
  identityForwardingFunctionRef: 'functionsProbe:identityForwardingStateProbe',
  handler: async (ctx) => ({
    identityForwarding: getIdentityForwarding(ctx),
    forwardedCaller: getForwardedCaller(ctx),
  }),
})

export const echoedArgs = query.public({
  args: {
    title: v.string(),
  },
  identityForwardingFunctionRef: 'functionsProbe:echoedArgs',
  handler: async (_ctx, args) => args,
})

export const onSuccessEnvelopeProbe = query.unsafe({
  permit: harnessPermit('Harness probe for onSuccess envelope capture.'),
  args: {
    marker: v.string(),
  },
  handler: async (_ctx, args) => ({
    ok: true,
    marker: args.marker,
  }),
})

export const getEnvelopeProbeState = query.unsafe({
  permit: harnessPermit('Harness probe for structured envelope state.'),
  args: {},
  handler: async () => ({
    structuredLoadArgs,
    structuredAuthorizeArgs,
    structuredHandlerArgs,
    onSuccessArgs,
  }),
})

export const unsafeForwardedCallerProbe = unsafeArgPrincipalRuntime.query.public({
  args: {},
  handler: async (ctx) => ({
    caller: await ctx.caller(),
    actingFor: await ctx.actingFor(),
  }),
})

export const unsafeListPosts = query.unsafe({
  permit: harnessPermit('Harness probe for unsafe post listing.'),
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('posts').order('desc').collect()
  },
})

export const unsafeRenamePost = mutation.unsafe({
  permit: harnessPermit('Harness probe for unsafe post rename.'),
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
  permit: harnessPermit('Harness probe for unsafe MCP key listing.'),
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('mcpKeys').order('desc').collect()
  },
})

export const createTriggeredNote = mutation.unsafe({
  permit: harnessPermit('Harness probe for trigger execution under unsafe mutation.'),
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
  permit: harnessPermit('Harness probe for note lookup.'),
  args: {
    id: v.id('notes'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})
