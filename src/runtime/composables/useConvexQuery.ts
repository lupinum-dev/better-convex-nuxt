import type { ConvexClient } from 'convex/browser'
import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server'
import type { AsyncData } from '#app'

import { useNuxtApp, useRuntimeConfig, useRequestEvent, useAsyncData, useState } from '#imports'
import { computed, watch, triggerRef, onScopeDispose, getCurrentScope, toValue, isRef, isReactive, type Ref, type WatchStopHandle, type MaybeRef } from 'vue'

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
  type QueryStatus,
} from '../utils/convex-cache'
import { getSharedLogger, getLogLevel } from '../utils/logger'
import { handleUnauthorizedAuthFailure } from '../utils/auth-unauthorized'
import { executeQueryViaSubscriptionOnce } from '../utils/one-shot-subscription'
import { getConvexRuntimeConfig } from '../utils/runtime-config'

// DevTools query registry (client-side only in dev mode)
let devToolsRegistry: typeof import('../devtools/query-registry') | null = null
let devToolsRegistryPromise: Promise<void> | null = null
let devToolsRegistryLoadFailed = false

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

// Re-export for consumers
export type { QueryStatus }
export { parseConvexResponse, computeQueryStatus, getQueryKey }

/**
 * Options for useConvexQuery
 */
export interface UseConvexQueryOptions<RawT, DataT = RawT> {
  /** Don't block when awaited. Query runs in background. @default false (configurable via nuxt.config convex.defaults.lazy) */
  lazy?: boolean
  /** Run query on server during SSR. @default true (configurable via nuxt.config convex.defaults.server) */
  server?: boolean
  /** Subscribe to real-time updates via WebSocket. @default true (configurable via nuxt.config convex.defaults.subscribe) */
  subscribe?: boolean
  /** Factory function for default data value. */
  default?: () => DataT | undefined
  /** Transform data after fetching. */
  transform?: (input: RawT) => DataT
  /** Mark this query as public (no authentication needed). @default false (configurable via nuxt.config convex.defaults.public) */
  public?: boolean
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
 * A Nuxt composable for querying Convex with SSR support and real-time subscriptions.
 *
 * Returns a standard Nuxt `AsyncData` object that is thenable (can be awaited).
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
 * // Skip query conditionally
 * const { data } = await useConvexQuery(api.users.get, userId ? { id: userId } : 'skip')
 *
 * // Lazy - doesn't block navigation
 * const { data, pending } = await useConvexQuery(api.posts.list, {}, { lazy: true })
 *
 * // Transform data after fetching
 * const { data } = await useConvexQuery(api.posts.list, {}, {
 *   transform: (posts) => posts?.map(p => ({ ...p, formattedDate: formatDate(p.publishedAt) }))
 * })
 * </script>
 * ```
 */
export function useConvexQuery<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> | 'skip' = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRef<Args> | Args,
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>,
): AsyncData<DataT | null, Error | null> {
  type RawT = FunctionReturnType<Query>

  const nuxtApp = useNuxtApp()
  const config = useRuntimeConfig()
  const convexConfig = getConvexRuntimeConfig()

  // Resolve options from: per-call options → global defaults → built-in defaults
  const defaults = convexConfig.defaults
  const lazy = options?.lazy ?? defaults?.lazy ?? false
  const server = options?.server ?? defaults?.server ?? true // SSR enabled by default
  const subscribe = options?.subscribe ?? defaults?.subscribe ?? true
  const isPublic = options?.public ?? defaults?.public ?? false

  // Get function name for cache key and logging
  const fnName = getFunctionName(query)

  // Setup logger
  const logLevel = getLogLevel(config.public.convex ?? {})
  const logger = getSharedLogger(logLevel)

  // Get reactive args value
  const getArgs = (): Args => toValue(args) ?? ({} as Args)
  const isSkipped = computed(() => getArgs() === 'skip')

  // Dev-mode warning for reactive() args (won't trigger re-fetches)
  if (import.meta.dev && args !== undefined && !isRef(args) && isReactive(args)) {
    console.warn(
      `[useConvexQuery] Detected reactive() object passed as args for "${fnName}". ` +
        `Changes to reactive objects will NOT trigger query re-fetches. ` +
        `Use ref() or computed() instead.`,
    )
  }

  if (import.meta.dev) {
    ensureDevToolsRegistryLoaded()
  }

  // Generate cache key
  const getCacheKey = (): string => {
    const currentArgs = getArgs()
    if (currentArgs === 'skip') return `convex:skip:${fnName}`
    return getQueryKey(query, currentArgs)
  }

  const cacheKey = getCacheKey()

  // Computed hash of args for deep reactivity detection
  // This ensures useAsyncData re-fetches when args change deeply (not just ref identity)
  const argsHash = computed(() => hashArgs(getArgs()))

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

  // Use Nuxt's useAsyncData for SSR + hydration
  // Note: Return null (not undefined) when skipped to avoid Nuxt warning about
  // undefined returns potentially causing duplicate requests on client
  const asyncData = useAsyncData<DataT | null, Error>(
    cacheKey,
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
            isPublic,
            cookieHeader,
            siteUrl,
            cachedToken,
          })

          const result = await executeQueryHttp<RawT>(convexUrl, fnName, currentArgs, authToken)
          return applyTransform(result)
        }

        // Client HTTP-only mode (no WebSocket dependency)
        if (!subscribe) {
          const authToken = isPublic ? undefined : (cachedToken.value ?? undefined)
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
      lazy,
      // Wrap default to handle undefined → null conversion for type compatibility
      default: options?.default ? () => options.default!() ?? null : undefined,
      // Watch args hash to trigger re-fetch on deep changes (not just ref identity)
      // This ensures server: false mode also re-fetches when args properties change
      watch: isRef(args) ? [argsHash] : undefined,
    },
  )

  // === Create our own pending/status with correct semantics ===
  // Nuxt's useAsyncData has different semantics than what we want:
  // - server: false → pending=false on SSR (but we want pending=true, data will load on client)
  // - lazy: true on client nav → may show pending=false (but we want pending=true until data arrives)

  const pending = computed((): boolean => {
    if (isSkipped.value) return false

    const hasData = asyncData.data.value !== null && asyncData.data.value !== undefined

    // When server: false, report pending until data arrives
    if (!server) {
      // On server: always pending (no SSR fetch, data will load on client)
      if (import.meta.server) return true
      // On client: pending until we have data
      if (!hasData) return true
    }

    // For lazy: true on client, show pending until data arrives
    // This handles the case where navigation is instant but data is still loading
    if (lazy && import.meta.client && !hasData) {
      return true
    }

    // Default to asyncData's pending state
    return asyncData.pending.value
  })

  const status = computed((): QueryStatus => {
    return computeQueryStatus(
      isSkipped.value,
      asyncData.error.value != null, // != catches both null AND undefined (strict !== would fail on undefined)
      pending.value,
      asyncData.data.value != null, // Simplified: != null covers both null and undefined
    )
  })

  // Track whether this component instance has registered with the subscription cache
  let registeredCacheKey: string | null = null
  const cleanupScope = import.meta.client && subscribe ? getCurrentScope() : undefined
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
      if (currentArgs === 'skip') {
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
              lazy,
              server,
              subscribe,
              public: isPublic,
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

    // Watch for reactive args changes to update subscription
    if (isRef(args)) {
      watch(
        () => toValue(args),
        (newArgs, oldArgs) => {
          if (hashArgs(newArgs) !== hashArgs(oldArgs)) {
            // Release old subscription if we had one registered
            if (oldArgs !== 'skip' && registeredCacheKey) {
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
            if (newArgs !== 'skip') {
              setupSubscription()
            }
          }
        },
        { deep: true },
      )
    }

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
  else if (import.meta.client && subscribe && import.meta.dev) {
    console.warn(
      `[useConvexQuery] Real-time subscriptions require a Vue component/effect scope for cleanup. ` +
        `Detected usage outside a component (e.g. route middleware/plugin). ` +
        `Falling back to one-shot query only. Pass { subscribe: false } to silence this warning.`,
    )
  }

  // === Build thenable return (Object.assign pattern from useConvexPaginatedQuery) ===

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
    } else if (lazy) {
      // lazy: true - resolve immediately, data loads in background
      resolvePromise = Promise.resolve()
    } else {
      // Wait for asyncData to complete
      resolvePromise = asyncData.then(() => {})
    }
  }

  // Build result data object with our own pending/status
  const resultData = {
    data: asyncData.data,
    pending,
    status,
    error: asyncData.error,
    refresh: asyncData.refresh,
    execute: asyncData.execute,
    clear: asyncData.clear,
  }

  // Create thenable result by extending the promise with result data
  // This is the clean pattern: promise.then() returns a new promise, Object.assign copies properties
  const resultPromise = resolvePromise.then(() => resultData)
  Object.assign(resultPromise, resultData)

  return resultPromise as unknown as AsyncData<DataT | null, Error | null>
}
