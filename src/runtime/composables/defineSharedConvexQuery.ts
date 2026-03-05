import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import type { MaybeRefOrGetter } from 'vue'

import { useNuxtApp } from '#imports'

import { getFunctionName, hashArgs } from '../utils/convex-shared'
import {
  createConvexQueryState,
  type UseConvexQueryData,
  type UseConvexQueryOptions,
} from './useConvexQuery'

interface SharedQueryRegistry {
  entries: Map<string, SharedQueryRegistryEntry<unknown>>
}

interface SharedQueryRegistryEntry<T> {
  value: T
  config: unknown
  queryName: string
  argsFingerprint: string
  optionsFingerprint: string
}

function isDynamicFingerprint(fingerprint: string): boolean {
  return fingerprint.startsWith('dynamic:')
}

function getFingerprint(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'

  if (typeof value === 'function') {
    return 'dynamic:function'
  }

  if (typeof value !== 'object') {
    return `primitive:${String(value)}`
  }

  const objectValue = value as Record<string, unknown>
  if (
    '__v_isRef' in objectValue ||
    '__v_isReadonly' in objectValue ||
    '__v_isReactive' in objectValue ||
    'effect' in objectValue
  ) {
    return 'dynamic:vue-reactive'
  }

  try {
    return `hash:${hashArgs(value)}`
  } catch {
    return 'dynamic:object'
  }
}

function getSharedRegistry(nuxtApp: ReturnType<typeof useNuxtApp>): SharedQueryRegistry {
  const app = nuxtApp as typeof nuxtApp & {
    _convexSharedQueryRegistry?: SharedQueryRegistry
  }

  if (!app._convexSharedQueryRegistry) {
    app._convexSharedQueryRegistry = {
      entries: new Map<string, SharedQueryRegistryEntry<unknown>>(),
    }
  }

  return app._convexSharedQueryRegistry!
}

export interface DefineSharedConvexQueryOptions<
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
export function defineSharedConvexQuery<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(config: DefineSharedConvexQueryOptions<Query, Args, DataT>): () => UseConvexQueryData<DataT> {
  return () => {
    const nuxtApp = useNuxtApp()
    const registry = getSharedRegistry(nuxtApp)
    const queryName = getFunctionName(config.query)
    const argsFingerprint = getFingerprint(config.args)
    const optionsFingerprint = getFingerprint(config.options)

    const existing = registry.entries.get(config.key)
    if (existing) {
      const queryMismatch = existing.queryName !== queryName
      const staticArgsMismatch =
        !isDynamicFingerprint(existing.argsFingerprint) &&
        !isDynamicFingerprint(argsFingerprint) &&
        existing.argsFingerprint !== argsFingerprint
      const staticOptionsMismatch =
        !isDynamicFingerprint(existing.optionsFingerprint) &&
        !isDynamicFingerprint(optionsFingerprint) &&
        existing.optionsFingerprint !== optionsFingerprint

      if (queryMismatch || staticArgsMismatch || staticOptionsMismatch) {
        throw new Error(
          `[defineSharedConvexQuery] Duplicate key "${config.key}" registered with a different config object. ` +
            `Use unique keys per query definition.`,
        )
      }
      return existing.value as UseConvexQueryData<DataT>
    }

    const created = createConvexQueryState<Query, Args, DataT>(
      config.query,
      config.args,
      config.options,
      true,
    ).resultData

    registry.entries.set(config.key, {
      value: created,
      config,
      queryName,
      argsFingerprint,
      optionsFingerprint,
    })
    return created
  }
}
