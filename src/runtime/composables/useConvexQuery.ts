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
import { getQueryKey, getFunctionName } from '../utils/convex-cache'
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
   * When `true`, `useConvexQuery` returns a Promise that resolves once the
   * first data arrives — blocking navigation (async data pattern).
   * When `false` (default), returns synchronously and data arrives reactively.
   * @default false
   */
  blocking?: boolean
  /**
   * @deprecated Use `blocking: true` instead of `lazy: false`, or simply remove `lazy: true` (sync is now the default).
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
  /**
   * Reactive toggle to enable/disable the query.
   * When `false`, the query is skipped (status becomes 'skipped').
   * Defaults to `true`. Also supports the null-args skip pattern.
   */
  enabled?: MaybeRefOrGetter<boolean>
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
  // The `enabled` option provides an explicit alternative:
  // useConvexQuery(api.notes.get, { id }, { enabled: () => !!id.value })
  const isSkipped = computed(() => {
    if (toValue(options?.enabled) === false) return true
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
    resolvePromise: resource.resolvePromise,
  }
}

// Known option keys used to distinguish options from args at runtime
const OPTION_KEYS = new Set([
  'server', 'subscribe', 'default', 'transform', 'blocking', 'lazy',
  'keepPreviousData', 'deepUnrefArgs', 'enabled', 'onData', 'onError',
])

function isOptionsObject(value: unknown): value is UseConvexQueryOptions<unknown> {
  if (!value || typeof value !== 'object' || typeof value === 'function') return false
  if ('__v_isRef' in (value as Record<string, unknown>)) return false
  return Object.keys(value).some(k => OPTION_KEYS.has(k))
}

// Overload: blocking: true → async return (SSR navigation blocking)
export function useConvexQuery<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args: MaybeRefOrGetter<Args> | undefined,
  options: UseConvexQueryOptions<FunctionReturnType<Query>, DataT> & { blocking: true },
): Promise<UseConvexQueryData<DataT>>

// Overload: options as 2nd param (no-arg queries), blocking
export function useConvexQuery<
  Query extends FunctionReference<'query'>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  options: UseConvexQueryOptions<FunctionReturnType<Query>, DataT> & { blocking: true },
): Promise<UseConvexQueryData<DataT>>

// Overload: options as 2nd param (no-arg queries), sync
export function useConvexQuery<
  Query extends FunctionReference<'query'>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>,
): UseConvexQueryData<DataT>

// Overload: default — sync return (data arrives reactively)
export function useConvexQuery<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>,
): UseConvexQueryData<DataT>

// Implementation
export function useConvexQuery<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  argsOrOptions?: MaybeRefOrGetter<Args> | UseConvexQueryOptions<FunctionReturnType<Query>, DataT>,
  maybeOptions?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>,
): UseConvexQueryData<DataT> | Promise<UseConvexQueryData<DataT>> {
  // Smart detection: if 2nd arg looks like options (has known option keys), treat it as options
  let args: MaybeRefOrGetter<Args> | undefined
  let options: UseConvexQueryOptions<FunctionReturnType<Query>, DataT> | undefined

  if (maybeOptions !== undefined) {
    // 3 args: (query, args, options)
    args = argsOrOptions as MaybeRefOrGetter<Args>
    options = maybeOptions
  } else if (argsOrOptions !== undefined && isOptionsObject(argsOrOptions)) {
    // 2 args where 2nd is options: (query, options)
    args = undefined
    options = argsOrOptions as UseConvexQueryOptions<FunctionReturnType<Query>, DataT>
  } else {
    // 2 args where 2nd is args: (query, args) or 1 arg: (query)
    args = argsOrOptions as MaybeRefOrGetter<Args> | undefined
    options = undefined
  }

  // blocking: true → resolve via promise (SSR navigation blocking)
  // lazy: false (deprecated) → same as blocking: true
  // Default: sync return (data arrives reactively)
  const isBlocking = options?.blocking === true || (options?.lazy !== undefined && options.lazy === false)

  if (import.meta.dev && options?.lazy !== undefined) {
    console.warn(
      '[better-convex-nuxt] useConvexQuery: `lazy` option is deprecated. ' +
      'Sync return is now the default — remove `lazy: true`, or use `blocking: true` instead of `lazy: false`.',
    )
  }

  const created = createConvexQueryState(query, args, options, !isBlocking)
  if (isBlocking) {
    return created.resolvePromise.then(() => created.resultData)
  }
  return created.resultData
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
