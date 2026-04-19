import type { OptimisticLocalStore } from 'convex/browser'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'

import { useNuxtApp, useRuntimeConfig } from '#imports'

import { createRuntimeObserver } from '../../observability/runtime-observer.js'
import { createOptimisticContext } from '../composables/optimistic-updates.js'
import { getRequiredConvexClient } from '../composables/useConvex.js'
import type {
  UseConvexActionOptions,
  UseConvexActionReturn,
  UseConvexMutationOptions,
  UseConvexMutationReturn,
} from './command-types.js'
import { getFunctionName } from './convex-cache.js'
import { createConvexCallState } from './convex-call-state.js'

export function useConvexMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
  options?: UseConvexMutationOptions<FunctionArgs<Mutation>, FunctionReturnType<Mutation>>,
): UseConvexMutationReturn<FunctionArgs<Mutation>, FunctionReturnType<Mutation>> {
  type Args = FunctionArgs<Mutation>
  type Result = FunctionReturnType<Mutation>

  const config = useRuntimeConfig()
  const logger = createRuntimeObserver(config.public.convex ?? {}, { transport: 'browser' })
  const fnName = getFunctionName(mutation)
  const nuxtApp = useNuxtApp()

  return createConvexCallState<Args, Result, 'mutation'>({
    fnName,
    callType: 'mutation',
    logger,
    nuxtApp,
    hasOptimisticUpdate: !!options?.optimisticUpdate,
    callFn: (args) =>
      getRequiredConvexClient(nuxtApp).mutation(mutation, args, {
        optimisticUpdate: options?.optimisticUpdate
          ? (store: OptimisticLocalStore, mutArgs: Args) =>
              options.optimisticUpdate!(createOptimisticContext(store), mutArgs)
          : undefined,
      }),
    onSuccess: options?.onSuccess,
    onError: options?.onError,
    validate: options?.validate,
  })
}

export function useConvexAction<Action extends FunctionReference<'action'>>(
  action: Action,
  options?: UseConvexActionOptions<FunctionArgs<Action>, FunctionReturnType<Action>>,
): UseConvexActionReturn<FunctionArgs<Action>, FunctionReturnType<Action>> {
  type Args = FunctionArgs<Action>
  type Result = FunctionReturnType<Action>

  const config = useRuntimeConfig()
  const logger = createRuntimeObserver(config.public.convex ?? {}, { transport: 'browser' })
  const fnName = getFunctionName(action)
  const nuxtApp = useNuxtApp()

  return createConvexCallState<Args, Result, 'action'>({
    fnName,
    callType: 'action',
    logger,
    nuxtApp,
    hasOptimisticUpdate: false,
    callFn: (args) => getRequiredConvexClient(nuxtApp).action(action, args),
    onSuccess: options?.onSuccess,
    onError: options?.onError,
    validate: options?.validate,
  })
}
