import type { ConvexClient } from 'convex/browser'
import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server'

import { useNuxtApp, useRuntimeConfig, useRequestEvent, useAsyncData, useState } from '#imports'
import { computed, watch, triggerRef, onScopeDispose, getCurrentScope, toValue, ref, type Ref, type WatchStopHandle, type MaybeRefOrGetter } from 'vue'

import {
  getFunctionName,
  hashArgs,
  getQueryKey,
  parseConvexResponse,
  computeQueryStatus,
  fetchAuthToken,
  createQueryBridge,
  registerSubscription,
  getSubscription,
  releaseSubscription,
  ensureQueryBridge,
  type SubscriptionEntry,
  type ConvexCallStatus,
} from '../utils/convex-cache'
import { getSharedLogger, getLogLevel } from '../utils/logger'
import { handleUnauthorizedAuthFailure } from '../utils/auth-unauthorized'
import { executeQueryViaSubscriptionOnce } from '../utils/one-shot-subscription'
import { getConvexRuntimeConfig } from '../utils/runtime-config'
import { deepUnref } from '../utils/deep-unref'
import { assertConvexComposableScope } from '../utils/composable-scope'
import type { ConvexClientAuthMode } from '../utils/types'

// DevTools query registry (client-side only in dev mode)
let devToolsRegistry: typeof import('../devtools/query-registry') | null = null
let devToolsRegistryPromise: Promise<void> | null = null
let devToolsRegistryLoadFailed = false
const transformedAsyncDataKeyIds = new WeakMap<(input: unknown) => unknown, number>()
let transformedAsyncDataKeySeq = 1

function ensureDevToolsRegistryLoaded(): void {
  if (!import.meta.client || !import.meta.dev || devToolsRegistry || devToolsRegistryPromise || devToolsRegistryLoadFailed) return
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

function getTransformedAsyncDataKeyId(transform: (input: unknown) => unknown): number {
  const existing = transformedAsyncDataKeyIds.get(transform)
  if (existing) return existing

  const id = transformedAsyncDataKeySeq++
  transformedAsyncDataKeyIds.set(transform, id)
  return id
}

// Re-export for consumers
export type { ConvexCallStatus }
export { getQueryKey }

/**
 * Options for useConvexQuery
 */
export interface UseConvexQueryOptions<RawT, DataT = RawT> {
  /** Run query on server during SSR. @default true (configurable via nuxt.config convex.defaults.server) */
  server?: boolean
  /** Subscribe to real-time updates via WebSocket. @default true (configurable via nuxt.config convex.defaults.subscribe) */
  subscribe?: boolean
  /** Factory function for default data value. */
  default?: () => RawT | undefined
  /** Transform data after fetching. */
  transform?: (input: RawT) => DataT
  /** Auth token behavior for this query. @default 'auto' (configurable via nuxt.config convex.defaults.auth) */
  auth?: ConvexClientAuthMode
  /** Enable or disable query execution. When false, status is "idle". @default true */
  enabled?: MaybeRefOrGetter<boolean | undefined>
  /** Keep the last successful data while args are changing and next request is pending. @default false */
  keepPreviousData?: boolean
  /** Deeply unwrap refs inside args object/array values. @default true */
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

/**
 * Execute query via HTTP (works on both server and client without WebSocket)
 * @internal
 */
export async function executeQueryHttp<T>(
  convexUrl: string,
  functionPath: string,
  args: Record<string, unknown>,
  authToken?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  const response = await $fetch(`${convexUrl}/api/query`, {
    method: 'POST',
    headers,
    body: { path: functionPath, args: args ?? {} },
  })

  return parseConvexResponse<T>(response)
}

/**
 * Execute a one-shot query using the WebSocket subscription.
 * Resolves when the first update arrives.
 * @internal
 */
export function executeQueryViaSubscription<Query extends FunctionReference<'query'>>(
  convex: ConvexClient,
  query: Query,
  args: FunctionArgs<Query>,
  options?: { timeoutMs?: number },
): Promise<FunctionReturnType<Query>> {
  return executeQueryViaSubscriptionOnce(convex, query, args, options)
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
 *   () => userId ? { id: userId } : undefined,
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
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
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
  const deepUnrefArgs = options?.deepUnrefArgs ?? true

  // Get function name for cache key and logging
  const fnName = getFunctionName(query)

  // Setup logger
  const logLevel = getLogLevel(config.public.convex ?? {})
  const logger = getSharedLogger(logLevel)

  const normalizedArgs = computed((): Args => {
    const rawArgs = args === undefined ? ({} as Args) : (toValue(args) as Args)
    if (rawArgs === null || rawArgs === undefined) {
      return rawArgs
    }
    return (deepUnrefArgs ? deepUnref(rawArgs) : rawArgs) as Args
  })
  const getArgs = (): Args => normalizedArgs.value
  const enabled = computed(() => toValue(options?.enabled) ?? true)
  const isSkipped = computed(() => !enabled.value || normalizedArgs.value == null)

  if (import.meta.dev) {
    ensureDevToolsRegistryLoaded()
  }

  const lastSettledData = ref<DataT | null>(null)

  // Generate cache key
  const getCacheKey = (): string => {
    if (isSkipped.value) return `convex:idle:${fnName}`
    const currentArgs = getArgs() as FunctionArgs<Query>
    return getQueryKey(query, currentArgs ?? ({} as FunctionArgs<Query>))
  }

  const cacheKey = computed(() => getCacheKey())
  const transformedKeySuffix = options?.transform
    ? `:transformed:${getTransformedAsyncDataKeyId(options.transform as (input: unknown) => unknown)}`
    : ''
  // Transformed results are consumer-specific shapes and cannot safely share the same
  // Nuxt async-data slot with untransformed consumers (or different transforms).
  const asyncDataKey = computed(() =>
    `${cacheKey.value}${transformedKeySuffix}`,
  )

  // Computed hash of args for deep reactivity detection
  // This ensures useAsyncData re-fetches when args change deeply (not just ref identity)
  const argsHash = computed(() => hashArgs(normalizedArgs.value))

  // Transform helper
  const applyTransform = (raw: RawT): DataT => {
    return options?.transform ? options.transform(raw) : (raw as unknown as DataT)
  }

  // Get request event and cookies for SSR auth
  const event = import.meta.server ? useRequestEvent() : null
  const cookieHeader = event?.headers.get('cookie') || ''

  // Get cached token state at setup time (synchronously) to avoid Vue context issues
  // Per Nuxt best practices, useState must be called at setup time, not inside async callbacks
  const cachedToken = useState<string | null>('convex:token')
  const currentScope = import.meta.client ? getCurrentScope() : undefined
  assertConvexComposableScope('useConvexQuery', import.meta.client, currentScope)

  // Use Nuxt's useAsyncData for SSR + hydration
  // Note: Return null (not undefined) when skipped to avoid Nuxt warning about
  // undefined returns potentially causing duplicate requests on client
  const asyncData = useAsyncData<DataT | null, Error>(
    asyncDataKey,
    async () => {
      if (isSkipped.value) {
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

          const result = await executeQueryHttp<RawT>(convexUrl, fnName, currentArgs, authToken)
          return applyTransform(result)
        }

        // Client HTTP-only mode (no WebSocket dependency)
        if (!subscribe) {
          const authToken = authMode === 'none' ? undefined : (cachedToken.value ?? undefined)
          const result = await executeQueryHttp<RawT>(convexUrl, fnName, currentArgs, authToken)
          return applyTransform(result)
        }

        // Client live mode: use WebSocket for first result
        const convex = nuxtApp.$convex as ConvexClient | undefined
        if (!convex) {
          throw new Error('[useConvexQuery] Convex client not available')
        }

        const result = await executeQueryViaSubscription(convex, query, currentArgs)
        return applyTransform(result)
      } catch (error) {
        if (import.meta.client) {
          void handleUnauthorizedAuthFailure({ error, source: 'query', functionName: fnName })
        }
        throw (error instanceof Error ? error : new Error(String(error)))
      }
    },
    {
      server,
      lazy: resolveImmediately,
      // Wrap default to handle undefined → null conversion for type compatibility.
      default: () => {
        if (keepPreviousData && lastSettledData.value !== null) {
          return lastSettledData.value
        }
        if (!options?.default) return null
        const fallbackRaw = options.default()
        if (fallbackRaw == null) return null
        return applyTransform(fallbackRaw as RawT)
      },
      // Convex payloads are replaced immutably; deep Vue traversal is unnecessary overhead.
      deep: false,
    },
  )

  watch(
    () => asyncData.data.value,
    (value) => {
      if (value !== null && value !== undefined) {
        lastSettledData.value = value
      }
    },
    { immediate: true },
  )

  // === Create our own pending/status with correct semantics ===
  // Nuxt's useAsyncData has different semantics than what we want:
  // - server: false → pending=false on SSR (but we want pending=true, data will load on client)
  // - immediate resolve on client nav → may show pending=false (but we want pending=true until data arrives)

  const pending = computed((): boolean => {
    if (isSkipped.value) return false

    const hasData = asyncData.data.value !== null && asyncData.data.value !== undefined
    const hasSettled = asyncData.status.value === 'success' || asyncData.status.value === 'error'

    // When server: false, report pending until data arrives
    if (!server) {
      // On server: always pending (no SSR fetch, data will load on client)
      if (import.meta.server) return true
      // On client: pending until we have data
      if (!hasData && !hasSettled) return true
    }

    // For immediate resolve on client, show pending until data arrives
    // This handles the case where navigation is instant but data is still loading
    if (resolveImmediately && import.meta.client && !hasData && !hasSettled) {
      return true
    }

    // Default to asyncData's pending state
    return asyncData.pending.value
  })

  const status = computed((): ConvexCallStatus => {
    return computeQueryStatus(
      isSkipped.value,
      asyncData.error.value != null, // != catches both null AND undefined (strict !== would fail on undefined)
      pending.value,
      asyncData.data.value != null, // Simplified: != null covers both null and undefined
    )
  })

  // Track whether this component instance has registered with the subscription cache
  let registeredCacheKey: string | null = null
  const cleanupScope = import.meta.client && subscribe ? currentScope : undefined
  let stopSharedDataWatch: WatchStopHandle | null = null
  let stopSharedErrorWatch: WatchStopHandle | null = null

  const cleanupSharedBridgeWatchers = () => {
    if (stopSharedDataWatch) {
      stopSharedDataWatch()
      stopSharedDataWatch = null
    }
    if (stopSharedErrorWatch) {
      stopSharedErrorWatch()
      stopSharedErrorWatch = null
    }
  }

  const attachSharedBridge = (
    entry: SubscriptionEntry,
  ) => {
    cleanupSharedBridgeWatchers()

    const bridge = ensureQueryBridge(entry)

    const syncDataFromBridge = () => {
      if (!bridge.hasRawData) return

      const transformedResult = applyTransform(bridge.rawData as RawT)
      ;(asyncData.data as Ref<DataT | null>).value = transformedResult

      if (asyncData.error.value !== null) {
        ;(asyncData.error as Ref<Error | null>).value = null
      }

      triggerRef(asyncData.data)
    }

    const syncErrorFromBridge = () => {
      const err = bridge.error
      if (!err) return

      const hasData = asyncData.data.value !== null && asyncData.data.value !== undefined
      if (!hasData) {
        ;(asyncData.error as Ref<Error | null>).value = err
      }
    }

    stopSharedDataWatch = watch(
      () => bridge.dataVersion.value,
      () => {
        syncDataFromBridge()
      },
    )

    stopSharedErrorWatch = watch(
      () => bridge.errorVersion.value,
      () => {
        syncErrorFromBridge()
      },
    )

    // Immediate sync for late joiners (e.g. skip -> real args)
    syncDataFromBridge()
    syncErrorFromBridge()
  }

  // Setup WebSocket subscription bridge on client
  if (import.meta.client && subscribe && cleanupScope) {
    const setupSubscription = () => {
      const currentArgs = getArgs()
      if (currentArgs == null || !enabled.value) {
        return
      }

      const convex = nuxtApp.$convex as ConvexClient | undefined
      if (!convex) {
        return
      }

      const currentCacheKey = getCacheKey()

      // Atomic check-and-join: if subscription exists, increment refCount directly
      const existingEntry = getSubscription(nuxtApp, currentCacheKey)
      if (existingEntry) {
        existingEntry.refCount++
        registeredCacheKey = currentCacheKey
        attachSharedBridge(existingEntry)

        // Log shared subscription
        logger.query({ name: fnName, event: 'share', refCount: existingEntry.refCount, args: currentArgs })
        return
      }

      try {
        // Local bridge is created up-front so synchronous callbacks (if any) still have
        // a place to write before the subscription entry is registered.
        const localBridge = createQueryBridge()

        const unsubscribeFn = convex.onUpdate(
          query,
          currentArgs as FunctionArgs<Query>,
          (result: RawT) => {
            // Subscription-level callback writes to shared bridge only.
            localBridge.rawData = result
            localBridge.hasRawData = true
            localBridge.error = null
            localBridge.dataVersion.value += 1

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
            localBridge.error = err
            localBridge.errorVersion.value += 1
            void handleUnauthorizedAuthFailure({ error: err, source: 'query', functionName: fnName })

            logger.query({ name: fnName, event: 'error', error: err })

            // Keep DevTools subscription-level error visibility
            if (import.meta.dev && devToolsRegistry) {
              devToolsRegistry.updateQueryStatus(currentCacheKey, {
                status: 'error',
                error: err.message,
              })
            }
          },
        )
        registerSubscription(nuxtApp, currentCacheKey, unsubscribeFn)
        const registeredEntry = getSubscription(nuxtApp, currentCacheKey)
        if (!registeredEntry) {
          throw new Error('[useConvexQuery] Failed to register subscription entry')
        }
        registeredEntry.queryBridge = localBridge
        registeredCacheKey = currentCacheKey
        attachSharedBridge(registeredEntry)

        logger.query({ name: fnName, event: 'subscribe', args: currentArgs })

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
      () => ({ hash: argsHash.value, enabled: enabled.value }),
      (next, prev) => {
        if (next.hash === prev.hash && next.enabled === prev.enabled) {
          return
        }

        if (registeredCacheKey) {
          cleanupSharedBridgeWatchers()
          const wasUnsubscribed = releaseSubscription(nuxtApp, registeredCacheKey)

          if (wasUnsubscribed) {
            logger.query({ name: fnName, event: 'unsubscribe' })

            // Unregister from DevTools only if we were the last user
            if (import.meta.dev && devToolsRegistry) {
              devToolsRegistry.unregisterQuery(registeredCacheKey)
            }
          }

          registeredCacheKey = null
        }

        // Setup new subscription (data will be updated by useAsyncData's watch)
        if (!isSkipped.value) {
          setupSubscription()

          // When args switch from disabled->active (or active->active), a reactive
          // useAsyncData key can hydrate from a shared cached value after bridge sync.
          // Re-sync once more on next macrotask so transform() stays subscriber-specific.
          setTimeout(() => {
            if (!registeredCacheKey) return
            const entry = getSubscription(nuxtApp, registeredCacheKey)
            if (!entry) return
            attachSharedBridge(entry)
          }, 0)
        }
      },
    )

    // Cleanup on scope dispose (component setup or other Vue effect scopes)
    onScopeDispose(() => {
      if (registeredCacheKey) {
        cleanupSharedBridgeWatchers()
        // Release our reference to the subscription
        // This decrements the ref count - only actually unsubscribes when count reaches 0
        const wasUnsubscribed = releaseSubscription(nuxtApp, registeredCacheKey)

        if (wasUnsubscribed) {
          logger.query({ name: fnName, event: 'unsubscribe' })

          // Unregister from DevTools only if we were the last user
          if (import.meta.dev && devToolsRegistry) {
            devToolsRegistry.unregisterQuery(registeredCacheKey)
          }
        }

        registeredCacheKey = null
      } else {
        cleanupSharedBridgeWatchers()
      }
    })
  }

  // Determine when the promise should resolve based on options
  let resolvePromise: Promise<void>

  if (isSkipped.value) {
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

  const data = computed<DataT | null>({
    get: () => (asyncData.data.value ?? null) as DataT | null,
    set: (value: DataT | null) => {
      ;(asyncData.data as Ref<DataT | null | undefined>).value = value
    },
  })

  // Build result data object with our own pending/status
  const resultData: UseConvexQueryData<DataT> = {
    data,
    pending,
    status,
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
  Args extends FunctionArgs<Query> | null | undefined = FunctionArgs<Query>,
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
