import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'

import {
  normalizeConvexError,
  type CallResult,
} from '../utils/call-result'
import { useConvex } from './useConvex'

export interface UseConvexOnceOptions {
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
        reject(new Error(`[useConvexOnce] ${operation} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    }),
  ])
}

export function useConvexOnce(options: UseConvexOnceOptions = {}) {
  const client = useConvex()
  const timeoutMs = options.timeoutMs ?? 10_000

  const requireClient = () => {
    if (!import.meta.client) {
      throw new Error('[useConvexOnce] One-shot calls are client-only in this composable')
    }
    if (!client) {
      throw new Error('[useConvexOnce] Convex client not available')
    }
    return client
  }

  const query = async <Query extends FunctionReference<'query'>>(
    queryRef: Query,
    args?: FunctionArgs<Query>,
  ): Promise<FunctionReturnType<Query>> => {
    const convex = requireClient()
    return await withTimeout(
      convex.query(queryRef, (args ?? {}) as FunctionArgs<Query>),
      timeoutMs,
      'query',
    ) as FunctionReturnType<Query>
  }

  const mutation = async <Mutation extends FunctionReference<'mutation'>>(
    mutationRef: Mutation,
    args?: FunctionArgs<Mutation>,
  ): Promise<FunctionReturnType<Mutation>> => {
    const convex = requireClient()
    return await withTimeout(
      convex.mutation(mutationRef, (args ?? {}) as FunctionArgs<Mutation>),
      timeoutMs,
      'mutation',
    ) as FunctionReturnType<Mutation>
  }

  const action = async <Action extends FunctionReference<'action'>>(
    actionRef: Action,
    args?: FunctionArgs<Action>,
  ): Promise<FunctionReturnType<Action>> => {
    const convex = requireClient()
    return await withTimeout(
      convex.action(actionRef, (args ?? {}) as FunctionArgs<Action>),
      timeoutMs,
      'action',
    ) as FunctionReturnType<Action>
  }

  const querySafe = async <Query extends FunctionReference<'query'>>(
    queryRef: Query,
    args?: FunctionArgs<Query>,
  ): Promise<CallResult<FunctionReturnType<Query>>> => {
    try {
      const data = await query(queryRef, args)
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: normalizeConvexError(error) }
    }
  }

  const mutationSafe = async <Mutation extends FunctionReference<'mutation'>>(
    mutationRef: Mutation,
    args?: FunctionArgs<Mutation>,
  ): Promise<CallResult<FunctionReturnType<Mutation>>> => {
    try {
      const data = await mutation(mutationRef, args)
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: normalizeConvexError(error) }
    }
  }

  const actionSafe = async <Action extends FunctionReference<'action'>>(
    actionRef: Action,
    args?: FunctionArgs<Action>,
  ): Promise<CallResult<FunctionReturnType<Action>>> => {
    try {
      const data = await action(actionRef, args)
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: normalizeConvexError(error) }
    }
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
