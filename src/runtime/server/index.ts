import type { H3Event } from 'h3'

import { serverConvexAction, serverConvexMutation, serverConvexQuery } from './utils/convex.js'
import type {
  AnyActionFunction,
  AnyMutationFunction,
  AnyQueryFunction,
  FunctionLikeArgs,
  FunctionLikeReturnType,
} from '../utils/convex-shared.js'

export {
  serverConvexQuery,
  serverConvexMutation,
  serverConvexAction,
  type ServerConvexOptions,
} from './utils/convex.js'

type ForwardedPrincipalOptions = {
  principal?: unknown
}

function withForwardedPrincipal<TArgs extends Record<string, unknown> | undefined>(
  args: TArgs,
  options?: ForwardedPrincipalOptions,
): TArgs {
  if (options?.principal === undefined) {
    return args
  }

  return {
    ...(args ?? {}),
    principal: options.principal,
  } as unknown as TArgs
}

/**
 * Server-side convenience wrapper over the `serverConvex*` helpers.
 *
 * Use this when one Nitro request needs several Convex calls with the same H3
 * event and you want a small, request-scoped caller object instead of passing
 * `event` every time.
 *
 * The returned helpers intentionally use `auth: 'none'`. Forward an explicit
 * principal into protected root refs when business authorization matters.
 *
 * @example
 * ```ts
 * const convex = createServerConvexCaller(event)
 * const post = await convex.query(internal.posts.getForAutomation, { id, principal })
 * ```
 */
export function createServerConvexCaller(event: H3Event, options?: ForwardedPrincipalOptions) {
  return {
    query: async <Query extends AnyQueryFunction>(
      fn: Query,
      args?: FunctionLikeArgs<Query>,
    ): Promise<FunctionLikeReturnType<Query>> =>
      await serverConvexQuery(event, fn, withForwardedPrincipal(args ?? ({} as FunctionLikeArgs<Query>), options), {
        auth: 'none',
      }),
    mutation: async <Mutation extends AnyMutationFunction>(
      fn: Mutation,
      args?: FunctionLikeArgs<Mutation>,
    ): Promise<FunctionLikeReturnType<Mutation>> =>
      await serverConvexMutation(event, fn, withForwardedPrincipal(args ?? ({} as FunctionLikeArgs<Mutation>), options), {
        auth: 'none',
      }),
    action: async <Action extends AnyActionFunction>(
      fn: Action,
      args?: FunctionLikeArgs<Action>,
    ): Promise<FunctionLikeReturnType<Action>> =>
      await serverConvexAction(event, fn, withForwardedPrincipal(args ?? ({} as FunctionLikeArgs<Action>), options), {
        auth: 'none',
      }),
  }
}
