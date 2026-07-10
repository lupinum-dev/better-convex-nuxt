import { v } from 'convex/values'

import { components } from './_generated/api'
import { mutation, query } from './_generated/server'

const paginationOpts = { cursor: null, numItems: 50 }
type BetterAuthUpdateManyArgs = (typeof components.betterAuth.adapter.updateMany)['_args']

export const inspectClientState = query({
  args: {
    clientId: v.string(),
  },
  handler: async (ctx, args) => {
    const [clients, refreshTokens, accessTokens, consents] = await Promise.all([
      ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: 'oauthClient',
        paginationOpts,
        where: [{ field: 'clientId', value: args.clientId }],
      }),
      ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: 'oauthRefreshToken',
        paginationOpts,
        where: [{ field: 'clientId', value: args.clientId }],
      }),
      ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: 'oauthAccessToken',
        paginationOpts,
        where: [{ field: 'clientId', value: args.clientId }],
      }),
      ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: 'oauthConsent',
        paginationOpts,
        where: [{ field: 'clientId', value: args.clientId }],
      }),
    ])

    return {
      clients,
      refreshTokens,
      accessTokens,
      consents,
    }
  },
})

export const setRefreshRevokedNullForProof = mutation({
  args: {
    refreshTokenId: v.string(),
  },
  handler: async (ctx, args) => {
    const updateArgs = {
      input: {
        model: 'oauthRefreshToken',
        update: { revoked: null },
        where: [{ field: '_id', value: args.refreshTokenId }],
      },
      paginationOpts,
    } satisfies BetterAuthUpdateManyArgs

    return await ctx.runMutation(components.betterAuth.adapter.updateMany, updateArgs)
  },
})

export const setClientDisabledForProof = mutation({
  args: {
    clientId: v.string(),
    disabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const updateArgs = {
      input: {
        model: 'oauthClient',
        update: { disabled: args.disabled },
        where: [{ field: 'clientId', value: args.clientId }],
      },
      paginationOpts,
    } satisfies BetterAuthUpdateManyArgs

    return await ctx.runMutation(components.betterAuth.adapter.updateMany, updateArgs)
  },
})
