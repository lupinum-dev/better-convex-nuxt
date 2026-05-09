import type { ConvexClient } from 'convex/browser'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import {
  computed,
  getCurrentInstance,
  getCurrentScope,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'

import { useRuntimeConfig } from '#imports'

import {
  appendDevtoolsEvent,
  registerDevtoolsQuery,
  unregisterDevtoolsQuery,
  updateDevtoolsQuery,
} from '../../devtools/runtime.js'
import { createRuntimeObserver } from '../../observability/runtime-observer.js'
import type { QueryStatus } from '../../utils/types.js'
import { assertConvexComposableScope } from '../shared/composable-scope.js'
import { getQueryKey, getFunctionName, hashArgs } from '../shared/convex-cache.js'
import { getConvexRuntimeConfig } from '../shared/runtime-config.js'
import {
  createLiveQueryResource,
  executeLiveQuery,
  executeQueryHttp,
} from './live-query-resource.js'
import { executeQueryViaSubscriptionOnce } from './one-shot-subscription.js'
import {
  createSkippedQueryCacheKey,
  resolveQueryDefaultValue,
  shouldMarkQueryDataAsStale,
  shouldPersistLastSettledQuery,
} from './query-state.js'

export { getQueryKey, executeQueryHttp }

export interface UseConvexQueryOptions<RawT, DataT = RawT> {
  server?: boolean
  subscribe?: boolean
  default?: () => RawT | undefined
  transform?: (input: RawT) => DataT
  keepPreviousData?: boolean
}

export interface UseConvexQueryData<DataT> {
  data: Ref<DataT | null>
  error: Ref<Error | null>
  refresh: () => Promise<void>
  clear: () => void
  pending: Ref<boolean>
  status: Ref<QueryStatus>
  isStale: Ref<boolean>
}

export interface UseConvexQueryReturn<DataT>
  extends UseConvexQueryData<DataT>, PromiseLike<UseConvexQueryData<DataT>> {}

interface BuildConvexQueryResult<DataT> {
  resultData: UseConvexQueryData<DataT>
  resolvePromise: () => Promise<void>
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
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<FunctionArgs<Query> | null | undefined>,
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
  const fnName = getFunctionName(query)
  const logger = createRuntimeObserver(config.public.convex ?? {}, { transport: 'browser' })

  const normalizedArgs = computed((): FunctionArgs<Query> => {
    const rawArgs = args === undefined ? ({} as FunctionArgs<Query>) : toValue(args)
    if (rawArgs == null) return {} as FunctionArgs<Query>
    return rawArgs as FunctionArgs<Query>
  })

  const isSkipped = computed(() => {
    const rawArgs = args === undefined ? {} : toValue(args)
    return rawArgs == null
  })

  assertConvexComposableScope(
    'useConvexQuery',
    import.meta.client,
    import.meta.client ? getCurrentScope() : undefined,
    import.meta.client ? getCurrentInstance() : undefined,
  )

  const cacheKey = computed(() => {
    if (isSkipped.value) {
      return createSkippedQueryCacheKey(fnName)
    }
    return getQueryKey(query, normalizedArgs.value ?? {})
  })

  let lastSettledData: Ref<RawT | null> | null = null
  let lastSettledArgsHash: Ref<string | null> | null = null
  let lastReceivedArgsHash: Ref<string | null> | null = null
  if (keepPreviousData) {
    lastSettledData = ref<RawT | null>(null)
    lastSettledArgsHash = ref<string | null>(null)
    lastReceivedArgsHash = ref<string | null>(null)
  }
  const currentArgsHash = computed(() =>
    isSkipped.value ? null : hashArgs(normalizedArgs.value ?? {}),
  )

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
    defaultValue: () =>
      resolveQueryDefaultValue<RawT>({
        keepPreviousData,
        lastSettledData: lastSettledData?.value ?? null,
        fallback: options?.default,
      }),
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
    onUnsubscribe: (currentCacheKey, didRelease, reason) => {
      if (!didRelease) return
      logger.query({ name: fnName, event: 'unsubscribe', reason, args: normalizedArgs.value })
      unregisterDevtoolsQuery(currentCacheKey)
    },
    onData: (result, source) => {
      if (keepPreviousData && lastReceivedArgsHash && currentArgsHash.value) {
        lastReceivedArgsHash.value = currentArgsHash.value
      }

      if (source === 'subscription') {
        logger.query({
          name: fnName,
          event: 'update',
          count: Array.isArray(result) ? result.length : 1,
          args: normalizedArgs.value,
          data: result,
        })
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
      updateDevtoolsQuery(cacheKey.value, {
        status: 'error',
        error: error.message,
      })
    },
  })

  watch(
    isSkipped,
    (skipped) => {
      if (!skipped) return
      logger.query({
        name: fnName,
        event: 'skip',
        reason: 'nullish-args',
      })
      appendDevtoolsEvent({
        kind: 'query',
        phase: 'skip',
        operationId: `skipped:${fnName}`,
        name: fnName,
        reason: 'nullish-args',
      })
    },
    { immediate: true },
  )

  if (keepPreviousData && lastSettledData) {
    watch(
      [
        () => resource.asyncData.data.value,
        () => resource.pending.value,
        () => currentArgsHash.value,
      ],
      ([value, pending, argsHash]) => {
        if (
          shouldPersistLastSettledQuery<RawT>({
            value,
            pending,
            argsHash,
          })
        ) {
          lastSettledData!.value = value
          lastSettledArgsHash!.value = argsHash
        }
      },
      { immediate: true },
    )
  }

  const applyTransform = (raw: RawT): DataT => {
    return options?.transform ? options.transform(raw) : (raw as DataT)
  }

  const data = computed<DataT | null>(() =>
    resource.asyncData.data.value != null ? applyTransform(resource.asyncData.data.value) : null,
  )
  const isStale = computed(() =>
    shouldMarkQueryDataAsStale({
      keepPreviousData,
      isSkipped: isSkipped.value,
      pending: resource.pending.value,
      hasError: resource.error.value != null,
      currentArgsHash: currentArgsHash.value,
      lastSettledArgsHash: lastSettledArgsHash?.value ?? null,
      lastReceivedArgsHash: lastReceivedArgsHash?.value ?? null,
      hasData: resource.asyncData.data.value != null,
    }),
  )

  return {
    resultData: {
      data,
      error: resource.error,
      refresh: resource.refresh,
      clear: resource.clear,
      pending: resource.pending as Ref<boolean>,
      status: resource.status as Ref<QueryStatus>,
      isStale: isStale as Ref<boolean>,
    },
    resolvePromise: () => resource.resolvePromise,
  }
}

export function useConvexQuery<
  Query extends FunctionReference<'query'>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<FunctionArgs<Query> | null | undefined>,
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>,
): UseConvexQueryReturn<DataT> {
  const created = createConvexQueryState(query, args, options, true)
  const result = created.resultData as UseConvexQueryReturn<DataT>
  const resolvedResult = { ...created.resultData } as UseConvexQueryData<DataT>
  result.then = (onFulfilled, onRejected) =>
    created
      .resolvePromise()
      .then(
        () =>
          new Promise<UseConvexQueryData<DataT>>((resolve) => {
            if (import.meta.server || !result.pending.value) {
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
