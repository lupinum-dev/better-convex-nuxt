import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import type { H3Event } from 'h3'

import { serverConvexAction, serverConvexMutation, serverConvexQuery } from './utils/convex.js'

export {
  serverConvexQuery,
  serverConvexMutation,
  serverConvexAction,
  type ServerConvexOptions,
} from './utils/convex.js'

export function createServerConvexCaller(event: H3Event) {
  return {
    query: async <Query extends FunctionReference<'query'>>(
      fn: Query,
      args: FunctionArgs<Query>,
    ): Promise<FunctionReturnType<Query>> =>
      await serverConvexQuery(event, fn, args, { auth: 'none' }),
    mutation: async <Mutation extends FunctionReference<'mutation'>>(
      fn: Mutation,
      args: FunctionArgs<Mutation>,
    ): Promise<FunctionReturnType<Mutation>> =>
      await serverConvexMutation(event, fn, args, { auth: 'none' }),
    action: async <Action extends FunctionReference<'action'>>(
      fn: Action,
      args: FunctionArgs<Action>,
    ): Promise<FunctionReturnType<Action>> =>
      await serverConvexAction(event, fn, args, { auth: 'none' }),
  }
}
