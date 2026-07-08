import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from 'convex/server'

import {
  handleUnauthorizedAuthFailure,
  type UnauthorizedErrorSource,
} from '../utils/auth-unauthorized'
import { toCallResult, type CallResult } from '../utils/call-result'
import { getFunctionName } from '../utils/convex-shared'
import { useConvex } from './useConvex'

export interface UseConvexCallReturn {
  query: <Query extends FunctionReference<'query'>>(
    queryRef: Query,
    ...args: OptionalRestArgs<Query>
  ) => Promise<FunctionReturnType<Query>>
  querySafe: <Query extends FunctionReference<'query'>>(
    queryRef: Query,
    ...args: OptionalRestArgs<Query>
  ) => Promise<CallResult<FunctionReturnType<Query>>>
  mutation: <Mutation extends FunctionReference<'mutation'>>(
    mutationRef: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ) => Promise<FunctionReturnType<Mutation>>
  mutationSafe: <Mutation extends FunctionReference<'mutation'>>(
    mutationRef: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ) => Promise<CallResult<FunctionReturnType<Mutation>>>
  action: <Action extends FunctionReference<'action'>>(
    actionRef: Action,
    ...args: OptionalRestArgs<Action>
  ) => Promise<FunctionReturnType<Action>>
  actionSafe: <Action extends FunctionReference<'action'>>(
    actionRef: Action,
    ...args: OptionalRestArgs<Action>
  ) => Promise<CallResult<FunctionReturnType<Action>>>
}

/**
 * One-shot Convex calls for client middleware, plugins, and effects.
 *
 * There is intentionally no timeout: a client-side "timeout" cannot cancel an
 * in-flight mutation/action, so a timed-out call that still commits server-side
 * invites duplicate writes. Callers that need a deadline should race the returned
 * promise themselves and treat the result as "may still have committed".
 *
 * Unauthorized failures are routed through the same recovery pipeline as
 * `useConvexMutation` (opt-in `convex.auth.unauthorized`), so a signed-out
 * session recovers consistently regardless of which call surface hit the error.
 */
export function useConvexCall(): UseConvexCallReturn {
  const client = useConvex()

  const requireClient = () => {
    if (!import.meta.client) {
      throw new Error('[useConvexCall] One-shot calls are client-only in this composable')
    }
    return client
  }

  const run = async <T>(
    source: UnauthorizedErrorSource,
    functionName: string,
    call: () => Promise<T>,
  ): Promise<T> => {
    try {
      return await call()
    } catch (error) {
      void handleUnauthorizedAuthFailure({ error, source, functionName })
      throw error
    }
  }

  const query = <Query extends FunctionReference<'query'>>(
    queryRef: Query,
    ...args: OptionalRestArgs<Query>
  ): Promise<FunctionReturnType<Query>> => {
    const convex = requireClient()
    return run(
      'query',
      getFunctionName(queryRef),
      () =>
        convex.query(queryRef, (args[0] ?? {}) as FunctionArgs<Query>) as Promise<
          FunctionReturnType<Query>
        >,
    )
  }

  const mutation = <Mutation extends FunctionReference<'mutation'>>(
    mutationRef: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ): Promise<FunctionReturnType<Mutation>> => {
    const convex = requireClient()
    return run(
      'mutation',
      getFunctionName(mutationRef),
      () =>
        convex.mutation(mutationRef, (args[0] ?? {}) as FunctionArgs<Mutation>) as Promise<
          FunctionReturnType<Mutation>
        >,
    )
  }

  const action = <Action extends FunctionReference<'action'>>(
    actionRef: Action,
    ...args: OptionalRestArgs<Action>
  ): Promise<FunctionReturnType<Action>> => {
    const convex = requireClient()
    return run(
      'action',
      getFunctionName(actionRef),
      () =>
        convex.action(actionRef, (args[0] ?? {}) as FunctionArgs<Action>) as Promise<
          FunctionReturnType<Action>
        >,
    )
  }

  const querySafe = <Query extends FunctionReference<'query'>>(
    queryRef: Query,
    ...args: OptionalRestArgs<Query>
  ): Promise<CallResult<FunctionReturnType<Query>>> => {
    return toCallResult(() => query(queryRef, ...args))
  }

  const mutationSafe = <Mutation extends FunctionReference<'mutation'>>(
    mutationRef: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ): Promise<CallResult<FunctionReturnType<Mutation>>> => {
    return toCallResult(() => mutation(mutationRef, ...args))
  }

  const actionSafe = <Action extends FunctionReference<'action'>>(
    actionRef: Action,
    ...args: OptionalRestArgs<Action>
  ): Promise<CallResult<FunctionReturnType<Action>>> => {
    return toCallResult(() => action(actionRef, ...args))
  }

  return {
    query,
    querySafe,
    mutation,
    mutationSafe,
    action,
    actionSafe,
  }
}
