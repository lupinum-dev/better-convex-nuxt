import type { ConvexClient } from 'convex/browser'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { computed, getCurrentScope, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

import { useNuxtApp, useRuntimeConfig } from '#imports'

import {
  registerDevtoolsQuery,
  unregisterDevtoolsQuery,
  updateDevtoolsQuery,
  warmQueryDevtools,
} from '../devtools/runtime'
import { assertConvexComposableScope } from '../utils/composable-scope'
import { getQueryKey, getFunctionName, hashArgs } from '../utils/convex-cache'
import type { QueryStatus } from '../utils/types'
import { getSharedLogger, getLogLevel } from '../utils/logger'
import { executeQueryViaSubscriptionOnce } from '../utils/one-shot-subscription'
import { getConvexRuntimeConfig } from '../utils/runtime-config'
import {
  createLiveQueryResource,
  executeLiveQuery,
  executeQueryHttp,
} from './internal/live-query-resource'

export { getQueryKey, executeQueryHttp }

export interface UseConvexQueryOptions<RawT, DataT = RawT> {
  /** @default true — run query server-side during SSR */
  server?: boolean
  /** @default true — keep a live WebSocket subscription after initial load */
  subscribe?: boolean
  /** Fallback value while the query is pending or skipped */
  default?: () => RawT | undefined
  /** Transform raw Convex data before exposing it via `data` */
  transform?: (input: RawT) => DataT
  /** Preserve previous data while a new result is loading */
  keepPreviousData?: boolean
  /** Stable app-level key used to share one query state instance per app/request. */
  shared?: string
  /**
   * Called whenever new data arrives from the server or subscription.
   * Fires for both the initial load and subsequent reactive updates.
   */
  onData?: (data: DataT) => void
  /**
   * Called when the query encounters an error.
   */
  onError?: (error: Error) => void
}

export interface UseConvexQueryData<DataT> {
  data: Ref<DataT | null>
  error: Ref<Error | null>
  refresh: () => Promise<void>
  /** Clear local data and error, resetting to initial state. Matches Nuxt's useAsyncData.clear(). */
  clear: () => void
  pending: Ref<boolean>
  status: Ref<QueryStatus>
}

export interface UseConvexQueryReturn<DataT>
  extends UseConvexQueryData<DataT>,
    PromiseLike<UseConvexQueryData<DataT>> {}

interface BuildConvexQueryResult<DataT> {
  resultData: UseConvexQueryData<DataT>
  resolvePromise: () => Promise<void>
}

interface SharedQueryRegistry {
  entries: Map<string, SharedQueryRegistryEntry<unknown>>
}

interface SharedQueryRegistryEntry<T> {
  value: BuildConvexQueryResult<T>
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
  } catch (e) {
    if (import.meta.dev) {
      console.warn('[better-convex-nuxt] Failed to fingerprint shared query args — duplicate-key detection is degraded:', e)
    }
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

  return app._convexSharedQueryRegistry
}

function getSharedOptionsFingerprint(options: UseConvexQueryOptions<unknown> | undefined): string {
  if (!options) return 'undefined'
  const { shared: _shared, ...rest } = options
  return getFingerprint(rest)
}

export function executeQueryViaSubscription<Query extends FunctionReference<'query'>>(
  convex: ConvexClient,
  query: Query,
  args: FunctionArgs<Query>,
  options?: { timeoutMs?: number },
): Promise<FunctionReturnType<Query>> {
  return executeQueryViaSubscriptionOnce(convex, query, args, options)
}

export function createConvexQueryState<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>,
  resolveImmediately = false,
): BuildConvexQueryResult<DataT> {
  if (options?.shared) {
    const nuxtApp = useNuxtApp()
    const registry = getSharedRegistry(nuxtApp)
    const queryName = getFunctionName(query)
    const argsFingerprint = getFingerprint(args)
    const optionsFingerprint = getSharedOptionsFingerprint(options as UseConvexQueryOptions<unknown>)
    const existing = registry.entries.get(options.shared)

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
          `[useConvexQuery] Duplicate key "${options.shared}" registered with a different config object. ` +
            'Use unique shared keys per query definition.',
        )
      }

      return existing.value as BuildConvexQueryResult<DataT>
    }

    const { shared: _shared, ...restOptions } = options
    const created = createConvexQueryState(query, args, restOptions, resolveImmediately)
    registry.entries.set(options.shared, {
      value: created,
      queryName,
      argsFingerprint,
      optionsFingerprint,
    })
    return created
  }

  type RawT = FunctionReturnType<Query>

  const config = useRuntimeConfig()
  const convexConfig = getConvexRuntimeConfig()
  const defaults = convexConfig.query
  const server = options?.server ?? defaults?.server ?? true
  const subscribe = options?.subscribe ?? defaults?.subscribe ?? true
  const keepPreviousData = options?.keepPreviousData ?? false
  const fnName = getFunctionName(query)
  const logger = getSharedLogger(getLogLevel(config.public.convex ?? {}))

  const normalizedArgs = computed((): Args => {
    const rawArgs = args === undefined ? ({} as Args) : (toValue(args) as Args)
    if (rawArgs == null) return {} as Args
    return rawArgs as Args
  })

  // null/undefined args = skip. Canonical pattern for conditional queries:
  // useConvexQuery(api.notes.get, () => id.value ? { id: id.value } : null)
  const isSkipped = computed(() => {
    const rawArgs = args === undefined ? {} : toValue(args)
    return rawArgs == null
  })

  assertConvexComposableScope(
    'useConvexQuery',
    import.meta.client,
    import.meta.client ? getCurrentScope() : undefined,
  )

  if (import.meta.dev) {
    warmQueryDevtools()
  }

  const cacheKey = computed(() => {
    if (isSkipped.value) {
      return `convex:skipped:${fnName}`
    }
    return getQueryKey(query, normalizedArgs.value ?? {})
  })

  let lastSettledData: Ref<RawT | null> | null = null
  if (keepPreviousData) {
    lastSettledData = ref<RawT | null>(null)
  }

  const resource = createLiveQueryResource<Query, RawT>({
    query,
    args: normalizedArgs as typeof normalizedArgs,
    cacheKey,
    isSkipped,
    server,
    subscribe,
    authMode: 'auto',
    resolveImmediately,
    dedupe: 'defer',
    defaultValue: () => {
      if (keepPreviousData && lastSettledData?.value !== null) {
        return lastSettledData!.value
      }
      const fallback = options?.default?.()
      return fallback == null ? null : (fallback as RawT)
    },
    onShare: (refCount) => {
      logger.query({
        name: fnName,
        event: 'share',
        refCount,
        args: normalizedArgs.value,
      })
    },
    onSubscribe: (currentCacheKey) => {
      logger.query({ name: fnName, event: 'subscribe', args: normalizedArgs.value })
      if (!import.meta.dev) return
      registerDevtoolsQuery({
        id: currentCacheKey,
        name: fnName,
        args: normalizedArgs.value,
        status: 'pending',
        dataSource: 'websocket',
        data: null,
        hasSubscription: subscribe,
        options: {
          immediate: resolveImmediately,
          server,
          subscribe,
          auth: 'auto',
        },
      })
    },
    onUnsubscribe: (currentCacheKey, didRelease) => {
      if (!didRelease) return
      logger.query({ name: fnName, event: 'unsubscribe' })
      if (import.meta.dev) {
        unregisterDevtoolsQuery(currentCacheKey)
      }
    },
    onData: (result, source) => {
      if (source === 'subscription') {
        logger.query({
          name: fnName,
          event: 'update',
          count: Array.isArray(result) ? result.length : 1,
          args: normalizedArgs.value,
          data: result,
        })
      }

      if (import.meta.dev && source === 'subscription') {
        updateDevtoolsQuery(cacheKey.value, {
          status: 'success',
          data: result,
          dataSource: 'websocket',
          hasSubscription: subscribe,
        })
      }

      // Forward to user callback (apply transform to match the exposed data shape)
      options?.onData?.(applyTransform(result))
    },
    onError: (error) => {
      logger.query({ name: fnName, event: 'error', error })
      if (import.meta.dev) {
        updateDevtoolsQuery(cacheKey.value, {
          status: 'error',
          error: error.message,
        })
      }
      options?.onError?.(error)
    },
  })

  if (keepPreviousData && lastSettledData) {
    watch(
      () => resource.asyncData.data.value,
      (value) => {
        if (value != null) {
          lastSettledData!.value = value
        }
      },
      { immediate: true },
    )
  }

  const applyTransform = (raw: RawT): DataT => {
    return options?.transform ? options.transform(raw) : (raw as unknown as DataT)
  }

  const data = computed<DataT | null>(() =>
    resource.asyncData.data.value != null ? applyTransform(resource.asyncData.data.value) : null,
  )

  return {
    resultData: {
      data,
      error: resource.asyncData.error as Ref<Error | null>,
      refresh: resource.asyncData.refresh,
      clear: resource.asyncData.clear,
      pending: resource.pending as Ref<boolean>,
      status: resource.status as Ref<QueryStatus>,
    },
    resolvePromise: () => Promise.resolve(resource.asyncData).then(() => {}),
  }
}
export function useConvexQuery<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>,
): UseConvexQueryReturn<DataT> {
  const created = createConvexQueryState(query, args, options, true)
  const result = created.resultData as UseConvexQueryReturn<DataT>
  const resolvedResult = { ...created.resultData } as UseConvexQueryData<DataT>
  result.then = (onFulfilled, onRejected) =>
    created.resolvePromise()
      .then(
        () =>
          new Promise<UseConvexQueryData<DataT>>((resolve) => {
            if (!result.pending.value) {
              resolve(resolvedResult)
              return
            }

            const stop = watch(
              () => result.pending.value,
              (pending) => {
                if (pending) return
                stop()
                resolve(resolvedResult)
              },
            )
          }),
      )
      .then(onFulfilled, onRejected)
  return result
}

async function executeViaSharedRuntime<Query extends FunctionReference<'query'>>(
  query: Query,
  args: FunctionArgs<Query>,
  options: {
    subscribe?: boolean
  } = {},
): Promise<FunctionReturnType<Query>> {
  const convexConfig = getConvexRuntimeConfig()
  return await executeLiveQuery<Query, FunctionReturnType<Query>>({
    query,
    args,
    subscribe: options.subscribe ?? convexConfig.query.subscribe ?? true,
    authMode: 'auto',
  })
}

export { executeViaSharedRuntime as executeConvexQuery }
