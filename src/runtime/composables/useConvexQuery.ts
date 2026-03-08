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
import { deepUnref } from '../utils/deep-unref'
import { getSharedLogger, getLogLevel } from '../utils/logger'
import { executeQueryViaSubscriptionOnce } from '../utils/one-shot-subscription'
import { getConvexRuntimeConfig } from '../utils/runtime-config'
import type { ConvexClientAuthMode } from '../utils/types'
import {
  createLiveQueryResource,
  executeLiveQuery,
  executeQueryHttp,
} from './internal/live-query-resource'

export type { ConvexCallStatus }
export { getQueryKey, executeQueryHttp }

export interface UseConvexQueryOptions<RawT, DataT = RawT> {
  server?: boolean
  subscribe?: boolean
  default?: () => RawT | undefined
  transform?: (input: RawT) => DataT
  auth?: ConvexClientAuthMode
  enabled?: MaybeRefOrGetter<boolean | undefined>
  keepPreviousData?: boolean
  deepUnrefArgs?: boolean
}

export interface UseConvexQueryData<DataT> {
  data: Ref<DataT | null>
  error: Ref<Error | null>
  refresh: () => Promise<void>
  clear: () => void
  pending: Ref<boolean>
  status: Ref<ConvexCallStatus>
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
  const defaults = convexConfig.defaults
  const server = options?.server ?? defaults?.server ?? true
  const subscribe = options?.subscribe ?? defaults?.subscribe ?? true
  const authMode = options?.auth ?? defaults?.auth ?? 'auto'
  const keepPreviousData = options?.keepPreviousData ?? false
  const deepUnrefArgs = options?.deepUnrefArgs ?? true
  const fnName = getFunctionName(query)
  const logger = getSharedLogger(getLogLevel(config.public.convex ?? {}))

  const normalizedArgs = computed((): Args => {
    const rawArgs = args === undefined ? ({} as Args) : (toValue(args) as Args)
    if (rawArgs == null) {
      return rawArgs
    }
    return (deepUnrefArgs ? deepUnref(rawArgs) : rawArgs) as Args
  })
  const enabled = computed(() => toValue(options?.enabled) ?? true)
  const isSkipped = computed(() => !enabled.value || normalizedArgs.value == null)

  assertConvexComposableScope(
    'useConvexQuery',
    import.meta.client,
    import.meta.client ? getCurrentScope() : undefined,
  )

  if (import.meta.dev) {
    warmQueryDevtools()
  }

  const lastSettledData = ref<RawT | null>(null)
  const cacheKey = computed(() => {
    if (isSkipped.value) {
      return `convex:idle:${fnName}`
    }
    return getQueryKey(query, normalizedArgs.value ?? {})
  })

  const resource = createLiveQueryResource<Query, RawT>({
    query,
    args: normalizedArgs as typeof normalizedArgs,
    cacheKey,
    isSkipped,
    server,
    subscribe,
    authMode,
    resolveImmediately,
    defaultValue: () => {
      if (keepPreviousData && lastSettledData.value !== null) {
        return lastSettledData.value
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
          auth: authMode,
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

  watch(
    () => resource.asyncData.data.value,
    (value) => {
      if (value != null) {
        lastSettledData.value = value
      }
    },
    { immediate: true },
  )

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
      status: resource.status as Ref<ConvexCallStatus>,
    },
    resolvePromise: resource.resolvePromise,
  }
}

export async function useConvexQuery<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>,
): Promise<UseConvexQueryData<DataT>> {
  const created = createConvexQueryState(query, args, options, false)
  await created.resolvePromise
  return created.resultData
}

async function executeViaSharedRuntime<Query extends FunctionReference<'query'>>(
  query: Query,
  args: FunctionArgs<Query>,
  options: {
    subscribe?: boolean
    auth?: ConvexClientAuthMode
  } = {},
): Promise<FunctionReturnType<Query>> {
  const convexConfig = getConvexRuntimeConfig()
  return await executeLiveQuery<Query, FunctionReturnType<Query>>({
    query,
    args,
    subscribe: options.subscribe ?? convexConfig.defaults.subscribe ?? true,
    authMode: options.auth ?? convexConfig.defaults.auth ?? 'auto',
  })
}

export { executeViaSharedRuntime as executeConvexQuery }
