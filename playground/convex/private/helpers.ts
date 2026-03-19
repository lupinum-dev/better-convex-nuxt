/* eslint-disable @typescript-eslint/no-explicit-any */
import { v } from 'convex/values'

import { action, mutation, query } from '../_generated/server'

function assertApiKey(apiKey: string): void {
  const expectedApiKey = process.env.CONVEX_PRIVATE_BRIDGE_KEY
  if (!expectedApiKey) {
    throw new Error('Missing CONVEX_PRIVATE_BRIDGE_KEY')
  }
  if (apiKey !== expectedApiKey) {
    throw new Error('Invalid API key')
  }
}

type PrivateDefinition = {
  args?: Record<string, any>
  returns?: any
  handler: (ctx: any, args: any) => Promise<any> | any
}

export function privateQuery(definition: PrivateDefinition) {
  return query({
    ...definition,
    args: {
      ...(definition.args ?? {}),
      apiKey: v.string(),
    },
    handler: async (ctx, args) => {
      assertApiKey(args.apiKey)
      const { apiKey: _apiKey, ...rest } = args
      return await definition.handler(ctx, rest)
    },
  })
}

export function privateMutation(definition: PrivateDefinition) {
  return mutation({
    ...definition,
    args: {
      ...(definition.args ?? {}),
      apiKey: v.string(),
    },
    handler: async (ctx, args) => {
      assertApiKey(args.apiKey)
      const { apiKey: _apiKey, ...rest } = args
      return await definition.handler(ctx, rest)
    },
  })
}

export function privateAction(definition: PrivateDefinition) {
  return action({
    ...definition,
    args: {
      ...(definition.args ?? {}),
      apiKey: v.string(),
    },
    handler: async (ctx, args) => {
      assertApiKey(args.apiKey)
      const { apiKey: _apiKey, ...rest } = args
      return await definition.handler(ctx, rest)
    },
  })
}
