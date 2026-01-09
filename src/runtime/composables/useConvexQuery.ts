import type { ConvexClient } from 'convex/browser'
import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server'
import type { AsyncData } from '#app'

import { useNuxtApp, useRuntimeConfig, useRequestEvent, useAsyncData } from '#imports'
import { computed, watch, triggerRef, onUnmounted, toValue, isRef, type Ref } from 'vue'

import {
  getFunctionName,
  hashArgs,
  getQueryKey,
  parseConvexResponse,
  computeQueryStatus,
  fetchAuthToken,
  registerSubscription,
  hasSubscription,
  removeFromSubscriptionCache,
  cleanupSubscription,
  type QueryStatus,
} from '../utils/convex-cache'
import { createModuleLogger, getLoggingOptions } from '../utils/logger'
import type { SubscriptionChangeEvent } from '../utils/logger'

// Re-export for consumers
export type { QueryStatus }
export { parseConvexResponse, computeQueryStatus, getQueryKey }

/**
 * Options for useConvexQuery
 */
export interface UseConvexQueryOptions<RawT, DataT = RawT> {
  /** Don't block when awaited. Query runs in background. @default false */
  lazy?: boolean
  /** Run query on server during SSR. @default true */
  server?: boolean
  /** Subscribe to real-time updates via WebSocket. @default true */
  subscribe?: boolean
  /** Factory function for default data value. */
  default?: () => DataT | undefined
  /** Transform data after fetching. */
  transform?: (input: RawT) => DataT
  /** Mark this query as public (no authentication needed). @default false */
  public?: boolean
}

type MaybeRef<T> = T | Ref<T>

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
): Promise<FunctionReturnType<Query>> {
  return new Promise((resolve) => {
    let resolved = false
    const unsubscribe = convex.onUpdate(query, args, (result: FunctionReturnType<Query>) => {
      if (!resolved) {
        resolved = true
        unsubscribe()
        resolve(result)
      }
    })
  })
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
): AsyncData<DataT | undefined, Error | null> {
  type RawT = FunctionReturnType<Query>

  const nuxtApp = useNuxtApp()
  const config = useRuntimeConfig()

  // Resolve options
  const lazy = options?.lazy ?? false
  const server = options?.server ?? true
  const subscribe = options?.subscribe ?? true
  const isPublic = options?.public ?? false

  // Get function name for cache key and logging
  const fnName = getFunctionName(query)

  // Setup logger
  const loggingOptions = getLoggingOptions(config.public.convex ?? {})
  const logger = createModuleLogger(loggingOptions)

  // Track subscription state for logging
  let updateCount = 0

  // Get reactive args value
  const getArgs = (): Args => toValue(args) ?? ({} as Args)
  const isSkipped = computed(() => getArgs() === 'skip')

  // Generate cache key
  const getCacheKey = (): string => {
    const currentArgs = getArgs()
    if (currentArgs === 'skip') return `convex:skip:${fnName}`
    return getQueryKey(query, currentArgs)
  }

  const cacheKey = getCacheKey()

  // Transform helper
  const applyTransform = (raw: RawT): DataT => {
    return options?.transform ? options.transform(raw) : (raw as unknown as DataT)
  }

  // Get request event and cookies for SSR auth
  const event = import.meta.server ? useRequestEvent() : null
  const cookieHeader = event?.headers.get('cookie') || ''

  // Use Nuxt's useAsyncData for SSR + hydration
  const asyncData = useAsyncData<DataT | undefined, Error>(
    cacheKey,
    async () => {
      if (isSkipped.value) {
        return undefined
      }

      const convexUrl = config.public.convex?.url
      if (!convexUrl) {
        throw new Error('[useConvexQuery] Convex URL not configured')
      }

      const currentArgs = getArgs() as FunctionArgs<Query>

      // SSR: fetch via HTTP
      if (import.meta.server) {
        const siteUrl = config.public.convex?.siteUrl

        const authToken = await fetchAuthToken({
          isPublic,
          cookieHeader,
          siteUrl,
        })

        const result = await executeQueryHttp<RawT>(convexUrl, fnName, currentArgs, authToken)
        return applyTransform(result)
      }

      // Client: use WebSocket for first result
      const convex = nuxtApp.$convex as ConvexClient | undefined
      if (!convex) {
        throw new Error('[useConvexQuery] Convex client not available')
      }

      const result = await executeQueryViaSubscription(convex, query, currentArgs)
      return applyTransform(result)
    },
    {
      server,
      lazy,
      default: options?.default,
      // Watch reactive args to trigger re-fetch
      watch: isRef(args) ? [args as Ref<unknown>] : undefined,
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
      asyncData.error.value !== null,
      pending.value,
      asyncData.data.value !== null && asyncData.data.value !== undefined
    )
  })

  // Track subscription for cleanup
  let unsubscribeFn: (() => void) | null = null

  // Setup WebSocket subscription bridge on client
  if (import.meta.client && subscribe) {
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

      // Check subscription cache to prevent duplicates
      if (hasSubscription(nuxtApp, currentCacheKey)) {
        return
      }

      try {
        updateCount = 0
        unsubscribeFn = convex.onUpdate(
          query,
          currentArgs as FunctionArgs<Query>,
          (result: RawT) => {
            updateCount++
            // Cast needed because useAsyncData has complex PickFrom type
            ;(asyncData.data as Ref<DataT | undefined>).value = applyTransform(result)
            // Force Vue reactivity for all watchers
            triggerRef(asyncData.data)
          },
          (err: Error) => {
            // Log subscription errors
            logger.event({
              event: 'subscription:change',
              env: 'client',
              name: fnName,
              state: 'error',
              error: { type: err.name, message: err.message },
            } satisfies SubscriptionChangeEvent)
            // Update asyncData error state
            ;(asyncData.error as Ref<Error | null>).value = err
          },
        )
        registerSubscription(nuxtApp, currentCacheKey, unsubscribeFn)

        logger.event({
          event: 'subscription:change',
          env: 'client',
          name: fnName,
          state: 'subscribed',
          cache_hit: false,
        } satisfies SubscriptionChangeEvent)
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        logger.event({
          event: 'subscription:change',
          env: 'client',
          name: fnName,
          state: 'error',
          error: { type: err.name, message: err.message },
        } satisfies SubscriptionChangeEvent)
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
            // Cleanup old subscription
            const oldCacheKey = getQueryKey(query, oldArgs)
            cleanupSubscription(nuxtApp, oldCacheKey)
            unsubscribeFn = null

            // Setup new subscription (data will be updated by useAsyncData's watch)
            if (newArgs !== 'skip') {
              setupSubscription()
            }
          }
        },
        { deep: true },
      )
    }

    // Cleanup on unmount
    onUnmounted(() => {
      if (unsubscribeFn) {
        logger.event({
          event: 'subscription:change',
          env: 'client',
          name: fnName,
          state: 'unsubscribed',
          updates_received: updateCount,
        } satisfies SubscriptionChangeEvent)

        removeFromSubscriptionCache(nuxtApp, getCacheKey())
        unsubscribeFn()
        unsubscribeFn = null
      }
    })
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

  return resultPromise as unknown as AsyncData<DataT | undefined, Error | null>
}
