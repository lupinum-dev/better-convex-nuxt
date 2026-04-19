import type { H3Event } from 'h3'

import {
  serverConvexAction,
  serverConvexMutation,
  serverConvexQuery,
} from '../convex/server/convex.js'
import type { ServerConvexOptions } from '../convex/server/convex.js'
import type {
  AnyActionFunction,
  AnyMutationFunction,
  AnyQueryFunction,
  FunctionLikeArgs,
  FunctionLikeReturnType,
} from '../convex/shared/convex-shared.js'
import type { Delegation } from '../functions/define-delegation.js'
import type { Subject } from '../functions/define-principal.js'

export {
  serverConvexQuery,
  serverConvexMutation,
  serverConvexAction,
  type ServerConvexOptions,
} from '../convex/server/convex.js'

type ForwardedPrincipalOptions = {
  principal?: ({ subject: Subject } & Record<string, unknown>) | undefined
  delegation?: Delegation
} & ServerConvexOptions

function withForwardedPrincipal<TArgs extends Record<string, unknown> | undefined>(
  args: TArgs,
  options?: ForwardedPrincipalOptions,
): TArgs {
  if (options?.principal === undefined && options?.delegation === undefined) {
    return args
  }

  return {
    ...(args ?? {}),
    ...(options?.principal !== undefined ? { principal: options.principal } : {}),
    ...(options?.delegation !== undefined ? { delegation: options.delegation } : {}),
  } as unknown as TArgs
}

/**
 * Server-side convenience wrapper over the `serverConvex*` helpers.
 *
 * Use this when one Nitro request needs several Convex calls with the same H3
 * event and you want a small, request-scoped caller object instead of passing
 * `event` every time.
 *
 * The returned helpers reuse the same auth surface as the per-call
 * `serverConvex*` helpers and default to `auth: 'auto'` unless overridden.
 * Forward an explicit principal into protected root refs when business
 * authorization should run against app-owned identity instead of request auth.
 *
 * @example
 * ```ts
 * const convex = createServerConvexCaller(event)
 * const post = await convex.query(internal.posts.getForAutomation, { id, principal })
 * ```
 */
export function createServerConvexCaller(event: H3Event, options?: ForwardedPrincipalOptions) {
  const callOptions: ServerConvexOptions = {
    auth: options?.auth ?? 'auto',
    ...(options?.authToken ? { authToken: options.authToken } : {}),
    ...(options?.principal ? { principal: options.principal } : {}),
    ...(options?.delegation ? { delegation: options.delegation } : {}),
    ...(options?.trustedForwardingKey
      ? { trustedForwardingKey: options.trustedForwardingKey }
      : {}),
  }

  if (
    (options?.principal !== undefined || options?.delegation !== undefined) &&
    callOptions.auth !== 'trusted'
  ) {
    throw new Error(
      "createServerConvexCaller() only allows forwarded identity on `auth: 'trusted'` calls.",
    )
  }

  if (callOptions.auth === 'trusted' && options?.principal === undefined) {
    throw new Error('createServerConvexCaller() requires `principal` on trusted forwarding calls.')
  }

  return {
    query: async <Query extends AnyQueryFunction>(
      fn: Query,
      args?: FunctionLikeArgs<Query>,
    ): Promise<FunctionLikeReturnType<Query>> =>
      await serverConvexQuery(
        event,
        fn,
        withForwardedPrincipal(args ?? ({} as FunctionLikeArgs<Query>), options),
        callOptions,
      ),
    mutation: async <Mutation extends AnyMutationFunction>(
      fn: Mutation,
      args?: FunctionLikeArgs<Mutation>,
    ): Promise<FunctionLikeReturnType<Mutation>> =>
      await serverConvexMutation(
        event,
        fn,
        withForwardedPrincipal(args ?? ({} as FunctionLikeArgs<Mutation>), options),
        callOptions,
      ),
    action: async <Action extends AnyActionFunction>(
      fn: Action,
      args?: FunctionLikeArgs<Action>,
    ): Promise<FunctionLikeReturnType<Action>> =>
      await serverConvexAction(
        event,
        fn,
        withForwardedPrincipal(args ?? ({} as FunctionLikeArgs<Action>), options),
        callOptions,
      ),
  }
}
