import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'

import { toCallResult, type CallResult } from '../utils/call-result'
import { useConvex } from './useConvex'

export interface UseConvexCallOptions {
  timeoutMs?: number
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  if (timeoutMs <= 0 || !Number.isFinite(timeoutMs)) {
    return await promise
  }

  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`[useConvexCall] ${operation} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    }),
  ])
}

export function useConvexCall(options: UseConvexCallOptions = {}) {
  const client = useConvex()
  const timeoutMs = options.timeoutMs ?? 10_000

  const requireClient = () => {
    if (!import.meta.client) {
      throw new Error('[useConvexCall] One-shot calls are client-only in this composable')
    }
    return client
  }

  const query = async <Query extends FunctionReference<'query'>>(
    queryRef: Query,
    ...args: FunctionArgs<Query> extends Record<string, never> ? [] : [args: FunctionArgs<Query>]
  ): Promise<FunctionReturnType<Query>> => {
    const convex = requireClient()
    return (await withTimeout(
      convex.query(queryRef, (args[0] ?? {}) as FunctionArgs<Query>),
      timeoutMs,
      'query',
    )) as FunctionReturnType<Query>
  }

  const mutation = async <Mutation extends FunctionReference<'mutation'>>(
    mutationRef: Mutation,
    ...args: FunctionArgs<Mutation> extends Record<string, never>
      ? []
      : [args: FunctionArgs<Mutation>]
  ): Promise<FunctionReturnType<Mutation>> => {
    const convex = requireClient()
    return (await withTimeout(
      convex.mutation(mutationRef, (args[0] ?? {}) as FunctionArgs<Mutation>),
      timeoutMs,
      'mutation',
    )) as FunctionReturnType<Mutation>
  }

  const action = async <Action extends FunctionReference<'action'>>(
    actionRef: Action,
    ...args: FunctionArgs<Action> extends Record<string, never> ? [] : [args: FunctionArgs<Action>]
  ): Promise<FunctionReturnType<Action>> => {
    const convex = requireClient()
    return (await withTimeout(
      convex.action(actionRef, (args[0] ?? {}) as FunctionArgs<Action>),
      timeoutMs,
      'action',
    )) as FunctionReturnType<Action>
  }

  const querySafe = async <Query extends FunctionReference<'query'>>(
    queryRef: Query,
    ...args: FunctionArgs<Query> extends Record<string, never> ? [] : [args: FunctionArgs<Query>]
  ): Promise<CallResult<FunctionReturnType<Query>>> => {
    const convex = requireClient()
    return toCallResult(
      () =>
        withTimeout(
          convex.query(queryRef, (args[0] ?? {}) as FunctionArgs<Query>),
          timeoutMs,
          'query',
        ) as Promise<FunctionReturnType<Query>>,
    )
  }

  const mutationSafe = async <Mutation extends FunctionReference<'mutation'>>(
    mutationRef: Mutation,
    ...args: FunctionArgs<Mutation> extends Record<string, never>
      ? []
      : [args: FunctionArgs<Mutation>]
  ): Promise<CallResult<FunctionReturnType<Mutation>>> => {
    const convex = requireClient()
    return toCallResult(
      () =>
        withTimeout(
          convex.mutation(mutationRef, (args[0] ?? {}) as FunctionArgs<Mutation>),
          timeoutMs,
          'mutation',
        ) as Promise<FunctionReturnType<Mutation>>,
    )
  }

  const actionSafe = async <Action extends FunctionReference<'action'>>(
    actionRef: Action,
    ...args: FunctionArgs<Action> extends Record<string, never> ? [] : [args: FunctionArgs<Action>]
  ): Promise<CallResult<FunctionReturnType<Action>>> => {
    const convex = requireClient()
    return toCallResult(
      () =>
        withTimeout(
          convex.action(actionRef, (args[0] ?? {}) as FunctionArgs<Action>),
          timeoutMs,
          'action',
        ) as Promise<FunctionReturnType<Action>>,
    )
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
