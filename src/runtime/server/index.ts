import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import type { H3Event } from 'h3'

import { serverConvexAction, serverConvexMutation, serverConvexQuery } from './utils/convex.js'

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
  } as TArgs
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
    query: async <Query extends FunctionReference<'query'>>(
      fn: Query,
      args: FunctionArgs<Query>,
    ): Promise<FunctionReturnType<Query>> =>
      await serverConvexQuery(event, fn, withForwardedPrincipal(args, options), { auth: 'none' }),
    mutation: async <Mutation extends FunctionReference<'mutation'>>(
      fn: Mutation,
      args: FunctionArgs<Mutation>,
    ): Promise<FunctionReturnType<Mutation>> =>
      await serverConvexMutation(event, fn, withForwardedPrincipal(args, options), {
        auth: 'none',
      }),
    action: async <Action extends FunctionReference<'action'>>(
      fn: Action,
      args: FunctionArgs<Action>,
    ): Promise<FunctionReturnType<Action>> =>
      await serverConvexAction(event, fn, withForwardedPrincipal(args, options), { auth: 'none' }),
  }
}
