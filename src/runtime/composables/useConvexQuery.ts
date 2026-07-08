import type { ConvexClient } from 'convex/browser'
import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server'
import {
  computed,
  watch,
  triggerRef,
  onScopeDispose,
  getCurrentScope,
  ref,
  type Ref,
  type ComputedRef,
  type MaybeRefOrGetter,
} from 'vue'

import { useNuxtApp, useRuntimeConfig, useRequestEvent, useAsyncData, useState } from '#imports'

import { handleUnauthorizedAuthFailure } from '../utils/auth-unauthorized'
import { assertConvexComposableScope } from '../utils/composable-scope'
import {
  getFunctionName,
  hashArgs,
  getQueryKey,
  computeQueryStatus,
  fetchAuthToken,
  releaseSubscription,
  acquireQuerySubscription,
  commitQueryBridgeData,
  commitQueryBridgeError,
  subscribeQueryBridge,
  waitForQueryBridgeData,
  type QueryBridgeSnapshot,
  type QuerySubscriptionBridge,
  type ConvexCallStatus,
} from '../utils/convex-cache'
import { getSharedLogger, getLogLevel } from '../utils/logger'
import { isConvexArgsSkipped, normalizeConvexArgs } from '../utils/query-args'
import { executeQueryHttp } from '../utils/query-execution'
import { createQueryExecutionGate, type ConvexQueryAuthMode } from '../utils/query-execution-gate'
import { computeConvexQueryPending, computeConvexQueryStale } from '../utils/query-state'
import { getConvexRuntimeConfig } from '../utils/runtime-config'

// DevTools query registry (client-side only in dev mode)
let devToolsRegistry: typeof import('../devtools/query-registry') | null = null
let devToolsRegistryPromise: Promise<void> | null = null
let devToolsRegistryLoadFailed = false

function ensureDevToolsRegistryLoaded(): void {
  if (
    !import.meta.client ||
    !import.meta.dev ||
    devToolsRegistry ||
    devToolsRegistryPromise ||
    devToolsRegistryLoadFailed
  )
    return
  devToolsRegistryPromise = import('../devtools/query-registry')
    .then((module) => {
      devToolsRegistry = module
    })
    .catch((error) => {
      devToolsRegistryLoadFailed = true
      console.warn('[useConvexQuery] Failed to load DevTools query registry:', error)
    })
    .finally(() => {
      devToolsRegistryPromise = null
    })
}

// Re-export for consumers
export type { ConvexCallStatus }
export { getQueryKey }

export type ConvexQuerySkip = 'skip'
export type ConvexQueryArgs<Args> = Args | ConvexQuerySkip

/**
 * Options for useConvexQuery
 */
export interface UseConvexQueryOptions<RawT, DataT = RawT> {
  /** Run query on server during SSR. @default true (configurable via nuxt.config convex.defaults.server) */
  server?: boolean
  /** Subscribe to real-time updates via WebSocket. @default true (configurable via nuxt.config convex.defaults.subscribe) */
  subscribe?: boolean
  /** Initial placeholder data value or factory. */
  initialData?: RawT | (() => RawT | undefined)
  /** Transform data after fetching. */
  transform?: (input: RawT) => DataT
  /** Keep the last successful data while args are changing and next request is pending. @default false */
  keepPreviousData?: boolean
  /** Auth transport mode for this query. Public queries can opt out with "none". @default convex.defaults.auth */
  auth?: ConvexQueryAuthMode
}

export interface UseConvexQueryData<DataT> {
  data: ComputedRef<DataT | null>
  error: Ref<Error | null>
  refresh: () => Promise<void>
  clear: () => void
  pending: ComputedRef<boolean>
  status: ComputedRef<ConvexCallStatus>
  isStale: ComputedRef<boolean>
}

interface BuildConvexQueryResult<DataT> {
  resultData: UseConvexQueryData<DataT>
  resolvePromise: Promise<void>
}

/**
 * Build shared query state for blocking composables and internal immediate-resolve consumers.
 *
 * @example
 * ```vue
 * <script setup>
 * // Basic usage - await blocks navigation until data loads
 * const { data } = await useConvexQuery(api.posts.list)
 *
 * // With args
 * const { data } = await useConvexQuery(api.posts.get, { slug: 'hello' })
 *
 * // Disable query conditionally
 * const { data } = await useConvexQuery(
 *   api.users.get,
 *   () => userId ? { id: userId } : 'skip',
 * )
 *
 * // Transform data after fetching
 * const { data } = await useConvexQuery(api.posts.list, {}, {
 *   transform: (posts) => posts?.map(p => ({ ...p, formattedDate: formatDate(p.publishedAt) }))
 * })
 * </script>
 * ```
 */
export function createConvexQueryState<
  Query extends FunctionReference<'query'>,
  Args extends ConvexQueryArgs<FunctionArgs<Query>> = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>,
  resolveImmediately = false,
): BuildConvexQueryResult<DataT> {
  type RawT = FunctionReturnType<Query>

  const nuxtApp = useNuxtApp()
  const config = useRuntimeConfig()
  const convexConfig = getConvexRuntimeConfig()

  // Resolve options from: per-call options → global defaults → built-in defaults
  const defaults = convexConfig.defaults
  const server = options?.server ?? defaults?.server ?? true // SSR enabled by default
  const subscribe = options?.subscribe ?? defaults?.subscribe ?? true
  const authMode = options?.auth ?? defaults?.auth ?? 'auto'
  const keepPreviousData = options?.keepPreviousData ?? false

  // Get function name for cache key and logging
  const fnName = getFunctionName(query)

  // Setup logger
  const logLevel = getLogLevel(config.public.convex ?? {})
  const logger = getSharedLogger(logLevel)

  const normalizedArgs = computed((): Args => {
    return normalizeConvexArgs(args) as Args
  })
  const getArgs = (): Args => normalizedArgs.value
  const isSkipped = computed(() => isConvexArgsSkipped(normalizedArgs.value))

  if (import.meta.dev) {
    ensureDevToolsRegistryLoaded()
  }

  const lastSettledData = ref<DataT | null>(null)
  const lastSettledRawData = ref<RawT | null>(null)
  const lastSettledArgsHash = ref<string | null>(null)

  // Get request event and cookies for SSR auth
  const event = import.meta.server ? useRequestEvent() : null
  const cookieHeader = event?.headers.get('cookie') || ''

  // Get cached token state at setup time (synchronously) to avoid Vue context issues
  // Per Nuxt best practices, useState must be called at setup time, not inside async callbacks
  const cachedToken = useState<string | null>('convex:token')
  const authPending = useState<boolean>('convex:pending', () => false)
  const executionGate = computed(() =>
    createQueryExecutionGate({
      authEnabled: convexConfig.auth.enabled,
      authMode,
      authPending: authPending.value,
      hasAuthToken: Boolean(cachedToken.value),
      isClient: import.meta.client,
      skipped: isSkipped.value,
      subscribe,
    }),
  )

  // Generate cache key
  const getCacheKey = (): string => {
    if (executionGate.value.resolveAsIdle) return `convex:idle:${fnName}`
    const currentArgs = getArgs() as FunctionArgs<Query>
    return getQueryKey(query, currentArgs ?? ({} as FunctionArgs<Query>))
  }

  const cacheKey = computed(() => getCacheKey())
  const asyncDataKey = cacheKey

  // Computed hash of args for deep reactivity detection
  // This ensures useAsyncData re-fetches when args change deeply (not just ref identity)
  const argsHash = computed(() => hashArgs(normalizedArgs.value))

  // Transform helper
  const applyTransform = (raw: RawT): DataT => {
    return options?.transform ? options.transform(raw) : (raw as unknown as DataT)
  }
  const resolveInitialData = (): RawT | undefined => {
    const initialData = options?.initialData
    return typeof initialData === 'function'
      ? (initialData as () => RawT | undefined)()
      : initialData
  }

  const commitFreshData = (raw: RawT) => {
    lastSettledRawData.value = raw
    lastSettledData.value = applyTransform(raw)
    lastSettledArgsHash.value = argsHash.value
  }

  const currentScope = import.meta.client ? getCurrentScope() : undefined
  assertConvexComposableScope('useConvexQuery', import.meta.client, currentScope)

  // Track whether this component instance has registered with the subscription cache.
  let registeredCacheKey: string | null = null
  let registeredBridge: QuerySubscriptionBridge | null = null
  const cleanupScope = import.meta.client && subscribe ? currentScope : undefined
  let unsubscribeSharedBridge: (() => void) | null = null

  const cleanupSharedBridgeSubscriber = () => {
    if (unsubscribeSharedBridge) {
      unsubscribeSharedBridge()
      unsubscribeSharedBridge = null
    }
  }

  const releaseRegisteredSubscription = () => {
    if (!registeredCacheKey) {
      cleanupSharedBridgeSubscriber()
      registeredBridge = null
      return
    }

    const cacheKeyToRelease = registeredCacheKey
    cleanupSharedBridgeSubscriber()
    const wasUnsubscribed = releaseSubscription(nuxtApp, cacheKeyToRelease)

    if (wasUnsubscribed) {
      logger.query({ name: fnName, event: 'unsubscribe' })

      // Unregister from DevTools only if we were the last user
      if (import.meta.dev && devToolsRegistry) {
        devToolsRegistry.unregisterQuery(cacheKeyToRelease)
      }
    }

    registeredCacheKey = null
    registeredBridge = null
  }

  const acquireSharedSubscriptionBridge = (
    currentArgs: FunctionArgs<Query>,
  ): QuerySubscriptionBridge => {
    const convex = nuxtApp.$convex as ConvexClient | undefined
    if (!convex) {
      throw new Error('[useConvexQuery] Convex client not available')
    }

    if (executionGate.value.resolveAsIdle) {
      throw new Error(
        '[useConvexQuery] Internal invariant violated: attempted to subscribe while query is idle',
      )
    }

    const currentCacheKey = getCacheKey()
    if (registeredCacheKey === currentCacheKey && registeredBridge) {
      return registeredBridge
    }

    if (registeredCacheKey) {
      releaseRegisteredSubscription()
    }

    const subscription = acquireQuerySubscription(
      nuxtApp,
      currentCacheKey,
      (bridge) =>
        convex.onUpdate(
          query,
          currentArgs,
          (result: RawT) => {
            // Subscription-level callback writes to shared bridge only.
            commitQueryBridgeData(bridge, result)

            logger.query({
              name: fnName,
              event: 'update',
              count: Array.isArray(result) ? result.length : 1,
              args: currentArgs,
              data: result,
            })

            // DevTools stores raw shared subscription data (not transformed), because
            // different subscribers may apply different transform() functions.
            if (import.meta.dev && devToolsRegistry) {
              devToolsRegistry.updateQueryStatus(currentCacheKey, {
                status: 'success',
                data: result,
                dataSource: 'websocket',
              })
            }
          },
          (err: Error) => {
            commitQueryBridgeError(bridge, err)
            void handleUnauthorizedAuthFailure({
              error: err,
              source: 'query',
              functionName: fnName,
            })

            logger.query({ name: fnName, event: 'error', error: err })

            // Keep DevTools subscription-level error visibility.
            if (import.meta.dev && devToolsRegistry) {
              devToolsRegistry.updateQueryStatus(currentCacheKey, {
                status: 'error',
                error: err.message,
              })
            }
          },
        ),
      { authMode },
    )

    registeredCacheKey = currentCacheKey
    registeredBridge = subscription.bridge

    logger.query({
      name: fnName,
      event: subscription.refCount === 1 ? 'subscribe' : 'share',
      refCount: subscription.refCount,
      args: currentArgs,
    })

    return subscription.bridge
  }

  // Use Nuxt's useAsyncData for SSR + hydration
  // Note: Return null (not undefined) when skipped to avoid Nuxt warning about
  // undefined returns potentially causing duplicate requests on client
  const asyncData = useAsyncData<RawT | null, Error>(
    asyncDataKey,
    async () => {
      if (executionGate.value.resolveAsIdle) {
        return null
      }

      const convexUrl = convexConfig.url
      if (!convexUrl) {
        throw new Error('[useConvexQuery] Convex URL not configured')
      }

      const currentArgs = getArgs() as FunctionArgs<Query>

      try {
        // SSR: fetch via HTTP
        if (import.meta.server) {
          const siteUrl = convexConfig.siteUrl

          const authToken = await fetchAuthToken({
            auth: authMode,
            cookieHeader,
            siteUrl,
            cachedToken,
          })
          if (authMode !== 'none' && !authToken) {
            return null
          }

          const result = await executeQueryHttp<RawT>(convexUrl, fnName, currentArgs, authToken)
          commitFreshData(result)
          return result
        }

        // Client HTTP-only mode (no WebSocket dependency)
        if (!subscribe) {
          const authToken = authMode === 'none' ? undefined : (cachedToken.value ?? undefined)
          if (authMode !== 'none' && !authToken) {
            return null
          }
          const result = await executeQueryHttp<RawT>(convexUrl, fnName, currentArgs, authToken)
          commitFreshData(result)
          return result
        }

        // Client live mode: use WebSocket for first result
        if (executionGate.value.waitForAuth) {
          return null
        }

        const bridge = acquireSharedSubscriptionBridge(currentArgs)
        const result = await waitForQueryBridgeData<RawT>(bridge)
        commitFreshData(result)
        return result
      } catch (error) {
        if (import.meta.client) {
          void handleUnauthorizedAuthFailure({ error, source: 'query', functionName: fnName })
        }
        throw error instanceof Error ? error : new Error(String(error))
      }
    },
    {
      server,
      lazy: resolveImmediately,
      // Wrap default to handle undefined → null conversion for type compatibility.
      default: () => {
        if (keepPreviousData && lastSettledData.value !== null) {
          return lastSettledRawData.value
        }
        const fallbackRaw = resolveInitialData()
        if (fallbackRaw == null) return null
        return fallbackRaw
      },
      // Convex payloads are replaced immutably; deep Vue traversal is unnecessary overhead.
      deep: false,
    },
  )

  watch(
    () => asyncData.data.value,
    (value) => {
      if (
        value !== null &&
        value !== undefined &&
        asyncData.status.value === 'success' &&
        !executionGate.value.resolveAsIdle
      ) {
        lastSettledRawData.value = value as RawT
        lastSettledData.value = applyTransform(value as RawT)
        lastSettledArgsHash.value = argsHash.value
      }
    },
    { immediate: true },
  )

  // === Create our own pending/status with correct semantics ===
  // Nuxt's useAsyncData has different semantics than what we want:
  // - server: false → pending=false on SSR (but we want pending=true, data will load on client)
  // - immediate resolve on client nav → may show pending=false (but we want pending=true until data arrives)

  const pending = computed((): boolean => {
    const hasData = asyncData.data.value !== null && asyncData.data.value !== undefined
    const hasSettled = asyncData.status.value === 'success' || asyncData.status.value === 'error'
    return computeConvexQueryPending({
      isSkipped: executionGate.value.pendingReason === 'explicit-skip',
      hasData,
      hasSettled,
      server,
      resolveImmediately,
      isServer: import.meta.server,
      isClient: import.meta.client,
      asyncDataPending: asyncData.pending.value,
      isAuthPending: executionGate.value.pendingReason === 'auth-pending',
    })
  })

  const status = computed((): ConvexCallStatus => {
    const isIdle =
      executionGate.value.pendingReason === 'explicit-skip' ||
      executionGate.value.pendingReason === 'auth-signed-out'
    return computeQueryStatus(
      isIdle,
      asyncData.error.value != null, // != catches both null AND undefined (strict !== would fail on undefined)
      pending.value,
      asyncData.data.value != null, // Simplified: != null covers both null and undefined
    )
  })

  const isStale = computed((): boolean => {
    return computeConvexQueryStale({
      keepPreviousData,
      isSkipped: executionGate.value.resolveAsIdle,
      hasLastSettledData: lastSettledData.value !== null,
      hasLastSettledArgsHash: lastSettledArgsHash.value !== null,
      pending: pending.value,
      argsHash: argsHash.value,
      lastSettledArgsHash: lastSettledArgsHash.value,
    })
  })

  const attachSharedBridge = (bridge: QuerySubscriptionBridge) => {
    cleanupSharedBridgeSubscriber()

    const syncSnapshotFromBridge = (snapshot: QueryBridgeSnapshot) => {
      if (snapshot.data.hasData) {
        const rawResult = snapshot.data.rawData as RawT
        ;(asyncData.data as Ref<RawT | null>).value = rawResult
        commitFreshData(rawResult)

        if (asyncData.error.value !== null) {
          ;(asyncData.error as Ref<Error | null>).value = null
        }

        triggerRef(asyncData.data)
      }

      const err = snapshot.error
      if (!err) {
        return
      }

      const hasData = asyncData.data.value !== null && asyncData.data.value !== undefined
      if (!hasData) {
        ;(asyncData.error as Ref<Error | null>).value = err
      }
    }

    unsubscribeSharedBridge = subscribeQueryBridge(bridge, syncSnapshotFromBridge)
  }

  // Setup WebSocket subscription bridge on client
  if (import.meta.client && subscribe && cleanupScope) {
    const setupSubscription = () => {
      // The execution gate is the single decision point. It is false when skipped,
      // auth-pending, signed-out-private, or subscribe:false — never acquire in those states.
      if (!executionGate.value.setupLiveSubscription) {
        return
      }

      const currentArgs = getArgs()
      if (currentArgs == null || currentArgs === 'skip') {
        return
      }

      const currentCacheKey = getCacheKey()

      try {
        const bridge = acquireSharedSubscriptionBridge(currentArgs as FunctionArgs<Query>)
        attachSharedBridge(bridge)

        // Register with DevTools in dev mode
        if (import.meta.dev && devToolsRegistry) {
          devToolsRegistry.registerQuery({
            id: currentCacheKey,
            name: fnName,
            args: currentArgs,
            status: 'pending',
            dataSource: 'websocket',
            data: asyncData.data.value,
            hasSubscription: true,
            options: {
              immediate: resolveImmediately,
              server,
              subscribe,
              auth: authMode,
            },
          })
        }
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        logger.query({ name: fnName, event: 'error', error: err })
      }
    }

    // Setup initial subscription
    setupSubscription()

    watch(
      () => ({
        hash: argsHash.value,
        skipped: isSkipped.value,
        pendingReason: executionGate.value.pendingReason,
      }),
      async (next, prev) => {
        if (
          next.hash === prev.hash &&
          next.skipped === prev.skipped &&
          next.pendingReason === prev.pendingReason
        ) {
          return
        }

        if (registeredCacheKey) {
          releaseRegisteredSubscription()
        }

        // Entering signed-out: drop this component's now-unauthorized data.
        if (next.pendingReason === 'auth-signed-out' && prev.pendingReason === 'none') {
          lastSettledData.value = null
          lastSettledRawData.value = null
          lastSettledArgsHash.value = null
          asyncData.clear()
        }

        // Setup new subscription (data will be updated by useAsyncData's watch)
        if (executionGate.value.setupLiveSubscription) {
          setupSubscription()

          // When args switch from disabled->active (or active->active), a reactive
          // useAsyncData key can hydrate from a shared cached value after bridge sync.
          // Re-sync once more on next macrotask so transform() stays subscriber-specific.
          setTimeout(() => {
            if (!registeredCacheKey || !registeredBridge) return
            attachSharedBridge(registeredBridge)
          }, 0)
        }
      },
    )

    watch(
      () => executionGate.value.waitForAuth,
      async (waitForAuth, previousWaitForAuth) => {
        if (waitForAuth) {
          if (registeredCacheKey) {
            releaseRegisteredSubscription()
          }
          return
        }

        if (!previousWaitForAuth || isSkipped.value) {
          return
        }

        // Auth settled. Signed-in → resubscribe + refetch. Signed-out → stay idle
        // (setupSubscription self-guards, and refreshing would just write null).
        if (executionGate.value.setupLiveSubscription) {
          setupSubscription()
          await asyncData.refresh()
        }
      },
    )

    // Cleanup on scope dispose (component setup or other Vue effect scopes)
    onScopeDispose(() => {
      if (registeredCacheKey) {
        releaseRegisteredSubscription()
      } else {
        cleanupSharedBridgeSubscriber()
        registeredBridge = null
      }
    })
  }

  // Determine when the promise should resolve based on options
  let resolvePromise: Promise<void>

  if (executionGate.value.resolveAsIdle) {
    // Skipped - resolve immediately
    resolvePromise = Promise.resolve()
  } else if (import.meta.server) {
    // SSR
    if (!server) {
      // server: false - skip SSR fetch, resolve immediately (client will fetch)
      resolvePromise = Promise.resolve()
    } else {
      // server: true - wait for asyncData
      resolvePromise = asyncData.then(() => {})
    }
  } else {
    // Client
    const hasExistingData = asyncData.data.value !== null && asyncData.data.value !== undefined

    if (hasExistingData) {
      // Already have data (from SSR hydration or cache)
      resolvePromise = Promise.resolve()
    } else if (resolveImmediately) {
      // Internal immediate resolve mode: resolve immediately while data loads in background.
      resolvePromise = Promise.resolve()
    } else {
      // Wait for asyncData to complete
      resolvePromise = asyncData.then(() => {})
    }
  }

  const data = computed<DataT | null>(() => {
    const raw = asyncData.data.value
    return raw == null ? null : applyTransform(raw as RawT)
  })

  // Build result data object with our own pending/status
  const resultData: UseConvexQueryData<DataT> = {
    data,
    pending,
    status,
    isStale,
    error: asyncData.error as Ref<Error | null>,
    refresh: asyncData.refresh,
    clear: asyncData.clear,
  }

  return {
    resultData,
    resolvePromise,
  }
}

export async function useConvexQuery<
  Query extends FunctionReference<'query'>,
  Args extends ConvexQueryArgs<FunctionArgs<Query>> = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>,
): Promise<UseConvexQueryData<DataT>> {
  const { resultData, resolvePromise } = createConvexQueryState(query, args, options, false)
  await resolvePromise
  return resultData
}
