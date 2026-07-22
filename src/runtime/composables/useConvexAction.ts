import {
  useConvexAction as useVueConvexAction,
  type UseConvexActionOptions as VueActionOptions,
  type UseConvexCallableReturn,
} from 'better-convex-vue'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { getFunctionName } from 'convex/server'

import { useNuxtApp } from '#imports'

import { normalizeConvexError } from '../errors'
import { readConvexRuntimeContext } from '../runtime-context'
import { createCallableDevtoolsEvents } from '../utils/callable-devtools'

export type UseConvexActionReturn<Action extends FunctionReference<'action'>> =
  UseConvexCallableReturn<Action>

export type UseConvexActionOptions<Args, Result> = VueActionOptions<Args, Result>

/** Nuxt auto-import facade over the one shared Vue callable lifecycle. */
export function useConvexAction<Action extends FunctionReference<'action'>>(
  action: Action,
  options?: UseConvexActionOptions<FunctionArgs<Action>, FunctionReturnType<Action>>,
): UseConvexActionReturn<Action> {
  const callable = useVueConvexAction(action, options)
  const runtime = readConvexRuntimeContext(useNuxtApp())
  const events = createCallableDevtoolsEvents<FunctionArgs<Action>, FunctionReturnType<Action>>({
    operation: 'action',
    fnName: getFunctionName(action),
    hasOptimisticUpdate: false,
    getSink: () => runtime?.getDevtoolsSink() ?? null,
  })
  const execute = async (...args: Parameters<typeof callable>) => {
    const startedAt = Date.now()
    const event = events.startEvent((args[0] ?? {}) as FunctionArgs<Action>, startedAt)
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
    const event = events.startEvent((args[0] ?? {}) as FunctionArgs<Action>, startedAt)
    const result = await callable.safe(...args)
    if (result.ok) events.finishEvent(event, result.data, startedAt)
    else events.failEvent(event, result.error, startedAt)
    return result
  }
  return Object.assign(execute, callable, { safe }) as UseConvexActionReturn<Action>
}
