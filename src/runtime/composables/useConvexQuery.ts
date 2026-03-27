import type { ConvexClient } from 'convex/browser'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { computed, getCurrentScope, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

import { useRuntimeConfig } from '#imports'

import {
  registerDevtoolsQuery,
  unregisterDevtoolsQuery,
  updateDevtoolsQuery,
  warmQueryDevtools,
} from '../devtools/runtime'
import { assertConvexComposableScope } from '../utils/composable-scope'
import { getQueryKey, getFunctionName, type ConvexCallStatus } from '../utils/convex-cache'
import type { QueryStatus } from '../utils/types'
import { deepUnref } from '../utils/deep-unref'
import { getSharedLogger, getLogLevel } from '../utils/logger'
import { executeQueryViaSubscriptionOnce } from '../utils/one-shot-subscription'
import { getConvexRuntimeConfig } from '../utils/runtime-config'
import {
  createLiveQueryResource,
  executeLiveQuery,
  executeQueryHttp,
} from './internal/live-query-resource'

export type { ConvexCallStatus }
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
  /**
   * When `false` (default), `useConvexQuery` returns a Promise that resolves
   * once the first data arrives — blocking navigation (async data pattern).
   * When `true`, returns synchronously and data arrives reactively.
   * @default false
   */
  lazy?: boolean
  /** Preserve previous data while a new result is loading */
  keepPreviousData?: boolean
  /**
   * Recursively unref Vue refs inside args before sending to Convex.
   * Usually not needed — prefer passing raw values.
   * @default false
   */
  deepUnrefArgs?: boolean
}

export interface UseConvexQueryData<DataT> {
  data: Ref<DataT | null>
  error: Ref<Error | null>
  refresh: () => Promise<void>
  /** Clear local data and error, resetting to initial state. Matches Nuxt's useAsyncData.clear(). */
  clear: () => void
  /** @deprecated Use clear() */
  reset: () => void
  pending: Ref<boolean>
  status: Ref<QueryStatus>
}

interface BuildConvexQueryResult<DataT> {
  resultData: UseConvexQueryData<DataT>
  resolvePromise: Promise<void>
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
  type RawT = FunctionReturnType<Query>

  const config = useRuntimeConfig()
  const convexConfig = getConvexRuntimeConfig()
  const defaults = convexConfig.query
  const server = options?.server ?? defaults?.server ?? true
  const subscribe = options?.subscribe ?? defaults?.subscribe ?? true
  const keepPreviousData = options?.keepPreviousData ?? false
  const deepUnrefArgs = options?.deepUnrefArgs ?? false
  const fnName = getFunctionName(query)
  const logger = getSharedLogger(getLogLevel(config.public.convex ?? {}))

  const normalizedArgs = computed((): Args => {
    const rawArgs = args === undefined ? ({} as Args) : (toValue(args) as Args)
    if (rawArgs == null) return {} as Args
    return (deepUnrefArgs ? deepUnref(rawArgs) : rawArgs) as Args
  })

  // null/undefined args = skip. This is the canonical pattern for conditional queries:
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
    },
    onError: (error) => {
      logger.query({ name: fnName, event: 'error', error })
      if (import.meta.dev) {
        updateDevtoolsQuery(cacheKey.value, {
          status: 'error',
          error: error.message,
        })
      }
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
      reset: resource.asyncData.clear, // @deprecated alias
      pending: resource.pending as Ref<boolean>,
      status: resource.status as Ref<QueryStatus>,
    },
    resolvePromise: resource.resolvePromise,
  }
}

// Overload: lazy: true → synchronous return
export function useConvexQuery<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args: MaybeRefOrGetter<Args> | undefined,
  options: UseConvexQueryOptions<FunctionReturnType<Query>, DataT> & { lazy: true },
): UseConvexQueryData<DataT>

// Overload: default (lazy: false) → async return
export function useConvexQuery<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>,
): Promise<UseConvexQueryData<DataT>>

// Implementation
export function useConvexQuery<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>,
): UseConvexQueryData<DataT> | Promise<UseConvexQueryData<DataT>> {
  const lazy = options?.lazy ?? false
  const created = createConvexQueryState(query, args, options, lazy)
  if (lazy) {
    return created.resultData
  }
  return created.resolvePromise.then(() => created.resultData)
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

/**
 * @deprecated Use `useConvexQuery(query, args, { lazy: true })` instead.
 */
export function useConvexQueryLazy<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>,
): UseConvexQueryData<DataT> {
  return useConvexQuery(query, args, { ...options, lazy: true })
}

export { executeViaSharedRuntime as executeConvexQuery }
