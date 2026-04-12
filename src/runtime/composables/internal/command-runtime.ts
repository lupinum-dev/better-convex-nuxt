import type { OptimisticLocalStore } from 'convex/browser'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'

import { useNuxtApp, useRuntimeConfig } from '#imports'

import { getFunctionName } from '../../utils/convex-cache.js'
import { getSharedLogger, getLogLevel } from '../../utils/logger.js'
import type { ValidateOption } from '../../utils/resolve-validator.js'
import { createOptimisticContext } from '../optimistic-updates.js'
import { createConvexCallState } from './convex-call-state.js'
import { getRequiredConvexClient } from '../useConvex.js'
import type { UseConvexMutationReturn } from '../useConvexMutation.js'

export interface UseConvexMutationOptions<Args, Result> {
  optimisticUpdate?: (ctx: ReturnType<typeof createOptimisticContext>, args: Args) => void
  onSuccess?: (result: Result, args: Args) => void
  onError?: (error: Error, args: Args) => void
  validate?: ValidateOption
}

export interface UseConvexActionOptions<Args, Result> {
  validate?: ValidateOption
  onSuccess?: (result: Result, args: Args) => void
  onError?: (error: Error, args: Args) => void
}

export type UseConvexActionReturn<Args, Result> = UseConvexMutationReturn<Args, Result>

export function useConvexMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
  options?: UseConvexMutationOptions<FunctionArgs<Mutation>, FunctionReturnType<Mutation>>,
): UseConvexMutationReturn<FunctionArgs<Mutation>, FunctionReturnType<Mutation>> {
  type Args = FunctionArgs<Mutation>
  type Result = FunctionReturnType<Mutation>

  const config = useRuntimeConfig()
  const logger = getSharedLogger(getLogLevel(config.public.convex ?? {}))
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
  const logger = getSharedLogger(getLogLevel(config.public.convex ?? {}))
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
