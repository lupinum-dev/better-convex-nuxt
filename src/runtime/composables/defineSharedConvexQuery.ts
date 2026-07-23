import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { effectScope } from 'vue'

import { useNuxtApp } from '#imports'

import type { SharedQueryArgsField } from '../utils/args-tuple'
import {
  createConvexQueryState,
  type UseConvexQueryData,
  type UseConvexQueryOptions,
} from './useConvexQuery'

interface SharedState<DataT> {
  value: UseConvexQueryData<DataT>
  scope: ReturnType<typeof effectScope>
}

export type DefineSharedConvexQueryOptions<
  Query extends FunctionReference<'query'>,
  // Public dialect is `'skip'` only (decision 9); `null`/`undefined` are not
  // advertised skip sentinels.
  Args extends FunctionArgs<Query> | 'skip' = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
> = {
  /** Convex query reference. */
  query: Query
  /** Same options as useConvexQuery. */
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>
} & SharedQueryArgsField<Query, Args>

/**
 * Create a shared query composable that initializes once per Nuxt app (internal
 *). The returned closure is the canonical definition identity: it owns one
 * `WeakMap<NuxtApp, SharedState>`; there is no caller-key registry and no
 * mutation of the Nuxt app object. The shared state inherits the same identity isolation as a
 * non-shared query, so it clears on identity change.
 *
 * @example
 * ```ts
 * const useCurrentTeam = defineSharedConvexQuery({
 *   query: api.teams.getCurrent,
 *   args: () => (teamId.value ? { teamId: teamId.value } : 'skip'),
 * })
 * ```
 */
export function defineSharedConvexQuery<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | 'skip' = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(config: DefineSharedConvexQueryOptions<Query, Args, DataT>): () => UseConvexQueryData<DataT> {
  const states = new WeakMap<object, SharedState<DataT>>()

  return () => {
    const nuxtApp = useNuxtApp()

    const existing = states.get(nuxtApp)
    if (existing) return existing.value

    // Shared state must outlive any individual consumer, so it runs in a detached
    // scope owned by this closure. Browser scopes register with the per-app
    // disposer; SSR uses request scope and no detached WebSocket resource.
    const scope = effectScope(true)
    const value = scope.run(() =>
      createConvexQueryState<Query, Args, DataT>(config.query, config.args, config.options, true),
    )!.resultData

    states.set(nuxtApp, { value, scope })

    if (import.meta.client) {
      nuxtApp.vueApp.onUnmount(() => scope.stop())
    }

    return value
  }
}
