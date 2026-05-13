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
import type { ActingFor } from '../functions/define-acting-for.js'
import type { Subject } from '../functions/define-caller.js'

export {
  serverConvexQuery,
  serverConvexMutation,
  serverConvexAction,
  type ServerConvexOptions,
} from '../convex/server/convex.js'
export { delegateToUser } from './acting-for.js'
export type { DelegateToUserOptions } from './acting-for.js'
export {
  createWebhookHmacSignature,
  isSharedSecretWebhookSignatureValid,
  isWebhookHmacSignatureValid,
  readHmacVerifiedWebhookBody,
  readSharedSecretWebhookBody,
} from './webhooks.js'
export type {
  ReadHmacVerifiedWebhookBodyOptions,
  ReadSharedSecretWebhookBodyOptions,
  WebhookHmacVerificationOptions,
} from './webhooks.js'

type ForwardedCallerOptions = {
  caller?: ({ subject: Subject } & Record<string, unknown>) | undefined
  actingFor?: ActingFor
} & ServerConvexOptions

type ServerConvexCallOptions = Pick<ServerConvexOptions, 'identityForwardingEnvelope'>

/**
 * Server-side convenience wrapper over the `serverConvex*` helpers.
 *
 * Use this when one Nitro request needs several Convex calls with the same H3
 * event and you want a small, request-scoped caller object instead of passing
 * `event` every time.
 *
 * The returned helpers reuse the same auth surface as the per-call
 * `serverConvex*` helpers and default to `auth: 'auto'` unless overridden.
 * Forward an explicit caller into protected root refs when business
 * authorization should run against app-owned identity instead of request auth.
 *
 * @example
 * ```ts
 * const convex = createServerConvexCaller(event)
 * const post = await convex.query(internal.posts.getForAutomation, { id, caller })
 * ```
 */
export function createServerConvexCaller(event: H3Event, options?: ForwardedCallerOptions) {
  const callOptions: ServerConvexOptions = {
    auth: options?.auth ?? 'auto',
    ...(options?.authToken ? { authToken: options.authToken } : {}),
    ...(options?.caller ? { caller: options.caller } : {}),
    ...(options?.actingFor ? { actingFor: options.actingFor } : {}),
    ...(options?.identityForwardingKey
      ? { identityForwardingKey: options.identityForwardingKey }
      : {}),
  }

  if (
    (options?.caller !== undefined || options?.actingFor !== undefined) &&
    callOptions.auth !== 'trusted'
  ) {
    throw new Error(
      "createServerConvexCaller() only allows forwarded identity on `auth: 'trusted'` calls.",
    )
  }

  if (callOptions.auth === 'trusted' && options?.caller === undefined) {
    throw new Error('createServerConvexCaller() requires `caller` on identity forwarding calls.')
  }

  return {
    query: async <Query extends AnyQueryFunction>(
      fn: Query,
      args?: FunctionLikeArgs<Query>,
      perCallOptions?: ServerConvexCallOptions,
    ): Promise<FunctionLikeReturnType<Query>> =>
      await serverConvexQuery(event, fn, args ?? ({} as FunctionLikeArgs<Query>), {
        ...callOptions,
        ...perCallOptions,
      }),
    mutation: async <Mutation extends AnyMutationFunction>(
      fn: Mutation,
      args?: FunctionLikeArgs<Mutation>,
      perCallOptions?: ServerConvexCallOptions,
    ): Promise<FunctionLikeReturnType<Mutation>> =>
      await serverConvexMutation(event, fn, args ?? ({} as FunctionLikeArgs<Mutation>), {
        ...callOptions,
        ...perCallOptions,
      }),
    action: async <Action extends AnyActionFunction>(
      fn: Action,
      args?: FunctionLikeArgs<Action>,
      perCallOptions?: ServerConvexCallOptions,
    ): Promise<FunctionLikeReturnType<Action>> =>
      await serverConvexAction(event, fn, args ?? ({} as FunctionLikeArgs<Action>), {
        ...callOptions,
        ...perCallOptions,
      }),
  }
}
