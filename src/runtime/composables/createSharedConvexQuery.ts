import type { AsyncData } from '#app'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import type { MaybeRefOrGetter } from 'vue'

import { useNuxtApp } from '#imports'

import { useConvexQuery, type UseConvexQueryOptions } from './useConvexQuery'

interface SharedQueryRegistry {
  entries: Map<string, unknown>
}

function getSharedRegistry(nuxtApp: ReturnType<typeof useNuxtApp>): SharedQueryRegistry {
  const app = nuxtApp as typeof nuxtApp & {
    _convexSharedQueryRegistry?: SharedQueryRegistry
  }

  if (!app._convexSharedQueryRegistry) {
    app._convexSharedQueryRegistry = {
      entries: new Map<string, unknown>(),
    }
  }

  return app._convexSharedQueryRegistry
}

export interface CreateSharedConvexQueryOptions<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
> {
  /** Stable app-level key used to share a single query state instance. */
  key: string
  /** Convex query reference. */
  query: Query
  /** Query args (supports refs/getters, including nullable disable semantics). */
  args?: MaybeRefOrGetter<Args>
  /** Same options as useConvexQuery. */
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>
}

/**
 * Create a shared query composable that initializes once per Nuxt app/request.
 *
 * Useful for global context data (current user/team/settings) without custom
 * nuxtApp mutation patterns in app code.
 */
export function createSharedConvexQuery<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  config: CreateSharedConvexQueryOptions<Query, Args, DataT>,
): () => AsyncData<DataT | null, Error | null> {
  return () => {
    const nuxtApp = useNuxtApp()
    const registry = getSharedRegistry(nuxtApp)

    const existing = registry.entries.get(config.key)
    if (existing) {
      return existing as AsyncData<DataT | null, Error | null>
    }

    const created = useConvexQuery<Query, Args, DataT>(
      config.query,
      config.args,
      config.options,
    )

    registry.entries.set(config.key, created)
    return created
  }
}
