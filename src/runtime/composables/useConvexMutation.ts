import {
  useConvexMutation as useVueConvexMutation,
  type UseConvexCallableReturn,
  type UseConvexMutationOptions as VueMutationOptions,
} from 'better-convex-vue'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { getFunctionName } from 'convex/server'

import { useNuxtApp } from '#imports'

import { normalizeConvexError } from '../errors'
import { readConvexRuntimeContext } from '../runtime-context'
import { createCallableDevtoolsEvents } from '../utils/callable-devtools'

export {
  updateQuery,
  setQueryData,
  updateAllQueries,
  deleteFromQuery,
  type UpdateQueryOptions,
  type SetQueryDataOptions,
  type UpdateAllQueriesOptions,
  type DeleteFromQueryOptions,
} from './regular-optimistic-updates'

export type UseConvexMutationReturn<Mutation extends FunctionReference<'mutation'>> =
  UseConvexCallableReturn<Mutation>

export type UseConvexMutationOptions<
  Args extends Record<string, unknown>,
  Result = unknown,
> = VueMutationOptions<Args, Result>

/** Nuxt auto-import facade over the one shared Vue callable lifecycle. */
export function useConvexMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
  options?: UseConvexMutationOptions<FunctionArgs<Mutation>, FunctionReturnType<Mutation>>,
): UseConvexMutationReturn<Mutation> {
  const callable = useVueConvexMutation(mutation, options)
  const runtime = readConvexRuntimeContext(useNuxtApp())
  const events = createCallableDevtoolsEvents<FunctionArgs<Mutation>, FunctionReturnType<Mutation>>(
    {
      operation: 'mutation',
      fnName: getFunctionName(mutation),
      hasOptimisticUpdate: Boolean(options?.optimisticUpdate),
      getSink: () => runtime?.getDevtoolsSink() ?? null,
    },
  )
  const execute = async (...args: Parameters<typeof callable>) => {
    const startedAt = Date.now()
    const event = events.startEvent((args[0] ?? {}) as FunctionArgs<Mutation>, startedAt)
    try {
      const result = await callable(...args)
      events.finishEvent(event, result, startedAt)
      return result
    } catch (error) {
      events.failEvent(event, normalizeConvexError(error), startedAt)
      throw error
    }
  }
  const safe = async (...args: Parameters<typeof callable.safe>) => {
    const startedAt = Date.now()
    const event = events.startEvent((args[0] ?? {}) as FunctionArgs<Mutation>, startedAt)
    const result = await callable.safe(...args)
    if (result.ok) events.finishEvent(event, result.data, startedAt)
    else events.failEvent(event, result.error, startedAt)
    return result
  }
  return Object.assign(execute, callable, { safe }) as UseConvexMutationReturn<Mutation>
}
