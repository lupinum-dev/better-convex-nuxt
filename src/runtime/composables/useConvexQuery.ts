import type { ConvexClient } from 'convex/browser'
import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server'

import { useNuxtApp, useState, useRuntimeConfig, useRequestEvent } from '#imports'
import {
  computed,
  watch,
  triggerRef,
  onUnmounted,
  toValue,
  isRef,
  type ComputedRef,
  type Ref,
} from 'vue'

import {
  getFunctionName,
  stableStringify,
  getQueryKey,
  parseConvexResponse,
  computeQueryStatus,
  type QueryStatus,
} from '../utils/convex-cache'
import {
  createQueryLogger,
  fetchAuthToken,
  getCachedAuthToken,
  registerSubscription,
  hasSubscription,
  cleanupSubscription,
  removeFromSubscriptionCache,
  buildThenableResult,
} from '../utils/query-helpers'

// Re-export for consumers
export type { QueryStatus }
export { parseConvexResponse, computeQueryStatus }

/**
 * Options for useConvexQuery
 *
 * @typeParam RawT - The raw return type from the Convex query
 * @typeParam DataT - The transformed data type (defaults to RawT if no transform)
 */
export interface UseConvexQueryOptions<RawT, DataT = RawT> {
  /**
   * Don't block when awaited.
   * Query runs in background, shows loading state.
   * @default false
   */
  lazy?: boolean

  /**
   * Run query on server during SSR.
   * Set to false for client-only data.
   * @default true
   */
  server?: boolean

  /**
   * Subscribe to real-time updates via WebSocket.
   * Set to false to skip WebSocket subscription and only use SSR data.
   * Use refresh() to manually re-fetch when needed.
   * @default true
   */
  subscribe?: boolean

  /**
   * Factory function for default data value.
   * Called to provide initial/placeholder data while fetching.
   * This is NOT transformed - provide already-transformed data.
   */
  default?: () => DataT | undefined

  /**
   * Transform data after fetching.
   * Called on SSR result and every subscription update.
   * Does NOT apply to the `default` value.
   *
   * @example
   * ```ts
   * // Add computed fields
   * transform: (posts) => posts?.map(p => ({
   *   ...p,
   *   formattedDate: formatDate(p.publishedAt)
   * }))
   *
   * // Filter or reshape
   * transform: (posts) => posts?.filter(p => p.published)
   * ```
   */
  transform?: (input: RawT) => DataT

  /**
   * Enable verbose logging for debugging.
   * @default false
   */
  verbose?: boolean

  /**
   * Mark this query as public (no authentication needed).
   * When true, skips all auth token checks during SSR.
   * @default false
   */
  public?: boolean
}

/**
 * Core return value properties from useConvexQuery
 */
export interface UseConvexQueryData<T> {
  /**
   * The query result.
   * - undefined: no data (loading, skipped, or not executed)
   * - T: actual data from server or subscription
   */
  data: Ref<T | undefined>

  /**
   * Query status for explicit state management.
   * - 'idle': query is skipped (args='skip')
   * - 'pending': waiting for data
   * - 'success': have data from server
   * - 'error': query failed
   */
  status: ComputedRef<QueryStatus>

  /**
   * Shorthand for status === 'pending'.
   */
  pending: ComputedRef<boolean>

  /**
   * Error if query failed.
   */
  error: Ref<Error | null>

  /**
   * Re-fetch data via HTTP.
   * Useful for manual refresh when subscribe: false, or force-refresh with subscriptions.
   */
  refresh: () => Promise<void>

  /**
   * Alias for refresh() - Nuxt useAsyncData compatibility.
   */
  execute: () => Promise<void>

  /**
   * Reset state to initial values.
   * Sets data to undefined, error to null, status to 'idle'.
   */
  clear: () => void
}

/**
 * Return value from useConvexQuery.
 * Combines the data properties with Promise interface for await support.
 */
export type UseConvexQueryReturn<T> = UseConvexQueryData<T> & Promise<UseConvexQueryData<T>>

type MaybeRef<T> = T | Ref<T> | ComputedRef<T>

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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  const response = await $fetch(`${convexUrl}/api/query`, {
    method: 'POST',
    headers,
    body: {
      path: functionPath,
      args: args ?? {},
    },
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
 * // Client-only
 * const { data } = await useConvexQuery(api.session.get, {}, { server: false })
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
): UseConvexQueryReturn<DataT> {
  type RawT = FunctionReturnType<Query>

  const nuxtApp = useNuxtApp()
  const config = useRuntimeConfig()

  // Resolve options
  const lazy = options?.lazy ?? false
  const server = options?.server ?? true
  const subscribe = options?.subscribe ?? true
  const verbose = options?.verbose ?? false
  const isPublic = options?.public ?? false

  // Get function name (needed for cache key and logging)
  const fnName = getFunctionName(query)

  // Logger (using shared helper)
  const log = createQueryLogger(verbose, 'useConvexQuery', query)

  log('Initializing', { lazy, server, public: isPublic })

  // Get reactive args value
  const getArgs = (): Args => toValue(args) ?? ({} as Args)

  // Check if query is skipped
  const isSkipped = computed(() => getArgs() === 'skip')

  // Generate cache key
  const getCacheKey = (): string => {
    const currentArgs = getArgs()
    if (currentArgs === 'skip') return `convex:skip:${fnName}`
    return getQueryKey(query, currentArgs)
  }

  const cacheKey = getCacheKey()
  log('Cache key', { key: cacheKey })

  // === Transform helper ===
  const applyTransform = (raw: RawT): DataT => {
    return options?.transform ? options.transform(raw) : (raw as unknown as DataT)
  }

  // === State via useState (SSR hydration + deduplication) ===
  const data = useState<DataT | undefined>(cacheKey, () => options?.default?.())
  const pending = useState<boolean>(`${cacheKey}:pending`, () => !isSkipped.value)
  const error = useState<Error | null>(`${cacheKey}:error`, () => null)

  // Check if data already exists (deduplication - another call already fetched)
  const hasExistingData = data.value !== undefined
  log('State initialized', { hasExistingData, hasPending: pending.value })

  // Computed status
  const status = computed((): QueryStatus => {
    return computeQueryStatus(
      isSkipped.value,
      error.value !== null,
      pending.value,
      data.value !== undefined,
    )
  })

  // Computed pending (match the ref type for return)
  const pendingComputed = computed(() => pending.value)

  // Get request event and cookies on server
  const event = import.meta.server ? useRequestEvent() : null
  const cookieHeader = event?.headers.get('cookie') || ''

  // Track subscription cleanup
  let unsubscribe: (() => void) | null = null

  // === Core fetch function (SSR) ===
  async function fetchOnServer(): Promise<void> {
    if (isSkipped.value) {
      log('Skipped')
      pending.value = false
      return
    }

    const convexUrl = config.public.convex?.url
    if (!convexUrl) {
      throw new Error('[useConvexQuery] Convex URL not configured')
    }

    const functionPath = getFunctionName(query)
    const currentArgs = getArgs() as FunctionArgs<Query>
    const siteUrl = config.public.convex?.siteUrl || config.public.convex?.auth?.url

    log('Fetching via HTTP', { args: currentArgs })

    // Get auth token using shared helper
    const authToken = await fetchAuthToken({
      isPublic,
      cookieHeader,
      siteUrl,
      log,
    })

    try {
      const result = await executeQueryHttp<RawT>(convexUrl, functionPath, currentArgs, authToken)
      data.value = applyTransform(result)
      error.value = null
      log('Fetch succeeded', { hasData: result !== undefined })
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e))
      log('Fetch failed', { error: error.value.message })
    } finally {
      pending.value = false
    }
  }

  // === Refresh function (manual re-fetch via HTTP) ===
  async function refresh(): Promise<void> {
    const currentArgs = getArgs()

    // Skip if args === 'skip'
    if (currentArgs === 'skip') {
      log('refresh: skipped (args=skip)')
      return
    }

    // Skip if already pending
    if (pending.value) {
      log('refresh: skipped (already pending)')
      return
    }

    const convexUrl = config.public.convex?.url
    if (!convexUrl) {
      throw new Error('[useConvexQuery] Convex URL not configured')
    }

    const functionPath = getFunctionName(query)
    const siteUrl = config.public.convex?.siteUrl || config.public.convex?.auth?.url

    log('refresh: fetching', { args: currentArgs })

    pending.value = true
    error.value = null

    // Get auth token using shared helpers
    let authToken: string | undefined
    if (!isPublic) {
      if (import.meta.client) {
        // On client, use cached token
        authToken = getCachedAuthToken()
      } else {
        // On server, fetch token (with caching)
        authToken = await fetchAuthToken({
          isPublic,
          cookieHeader,
          siteUrl,
          log,
        })
      }
    }

    try {
      const result = await executeQueryHttp<RawT>(
        convexUrl,
        functionPath,
        currentArgs as FunctionArgs<Query>,
        authToken,
      )
      data.value = applyTransform(result)
      error.value = null
      log('refresh: succeeded', { hasData: result !== undefined })
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e))
      log('refresh: failed', { error: error.value.message })
    } finally {
      pending.value = false
    }
  }

  // === Execute function (alias for refresh - Nuxt compat) ===
  const execute = refresh

  // === Clear function (reset state) ===
  function clear(): void {
    log('clear: resetting state')
    data.value = undefined
    error.value = null
    pending.value = false
  }

  // === Subscription setup (Client) ===
  function setupSubscription(): void {
    const currentArgs = getArgs()
    if (currentArgs === 'skip') {
      log('Skipping subscription (args=skip)')
      return
    }

    const convex = nuxtApp.$convex as ConvexClient | undefined
    if (!convex) {
      log('No Convex client available')
      return
    }

    // Cleanup existing subscription
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }

    // Check subscription cache to prevent duplicates (using shared helper)
    if (hasSubscription(nuxtApp, cacheKey)) {
      log('Subscription already exists, reusing')
      return
    }

    log('Starting subscription', { args: currentArgs })

    try {
      unsubscribe = convex.onUpdate(query, currentArgs as FunctionArgs<Query>, (result: RawT) => {
        log('Subscription update', { hasData: result !== undefined })
        data.value = applyTransform(result)
        // Force Vue to trigger reactivity for all watchers of this ref.
        // This is needed because useState refs may not properly notify
        // watchers when the value is replaced with a new object.
        triggerRef(data)
        pending.value = false
        error.value = null
      })
      // Register subscription in cache (using shared helper)
      registerSubscription(nuxtApp, cacheKey, unsubscribe)
      log('Subscription started')
    } catch (e) {
      log('Subscription failed', { error: e })
    }
  }

  // === Client: wait for first subscription result ===
  function waitForSubscriptionResult(): Promise<void> {
    return new Promise((resolve) => {
      const currentArgs = getArgs()
      if (currentArgs === 'skip') {
        resolve()
        return
      }

      const convex = nuxtApp.$convex as ConvexClient | undefined
      if (!convex) {
        pending.value = false
        resolve()
        return
      }

      log('Waiting for subscription result')

      executeQueryViaSubscription(convex, query, currentArgs as FunctionArgs<Query>)
        .then((result) => {
          data.value = applyTransform(result)
          pending.value = false
          error.value = null
          log('Got subscription result', { hasData: result !== undefined })
          resolve()
        })
        .catch((e) => {
          error.value = e instanceof Error ? e : new Error(String(e))
          pending.value = false
          log('Subscription query failed', { error: error.value.message })
          resolve()
        })
    })
  }

  // === Build the promise for awaiting ===
  let resolvePromise: Promise<void>

  if (isSkipped.value) {
    // Skipped - resolve immediately
    pending.value = false
    resolvePromise = Promise.resolve()
    log('Skipped, resolving immediately')
  } else if (import.meta.server) {
    // SSR
    log('SSR mode', { server, lazy, hasExistingData })

    if (hasExistingData) {
      // Data already fetched by another call - skip fetch (deduplication)
      pending.value = false
      resolvePromise = Promise.resolve()
      log('Deduplication: data already exists, skipping fetch')
    } else if (!server) {
      // server: false - skip SSR fetch, resolve immediately
      // Keep pending=true so client knows to fetch
      // Note: With lazy: false on client, await will block until data arrives
      // This may cause hydration mismatch on hard refresh (expected limitation)
      pending.value = true
      resolvePromise = Promise.resolve()
      log('server: false, skipping SSR (client will fetch)')
    } else {
      // server: true - fetch data via HTTP
      // NOTE: On SSR, we ignore `lazy` and ALWAYS wait for the fetch.
      // The `lazy` option only affects CLIENT navigation behavior.
      // This gives users the best of both worlds:
      // - Hard refresh (SSR): Page has data immediately (good for SEO, no loading flash)
      // - Client navigation: If lazy:true, instant render with loading state
      resolvePromise = fetchOnServer()
      log('SSR fetch (lazy only affects client)')
    }
  } else {
    // Client
    // Check if this is initial hydration from SSR (nuxtApp.isHydrating is true during hydration)
    const isInitialHydration = nuxtApp.isHydrating

    if (data.value !== undefined) {
      // Already have data (from SSR hydration)
      pending.value = false
      resolvePromise = Promise.resolve()
      log('Hydrated from SSR', { hasData: true })
    } else if (lazy) {
      // lazy: true - resolve immediately, data loads in background
      resolvePromise = Promise.resolve()
      log('lazy: true, loading in background')
    } else if (!server && isInitialHydration) {
      // server: false with lazy: false during initial hydration
      // Don't block - we need to let hydration complete first to avoid mismatch
      // The subscription will update data after hydration
      resolvePromise = Promise.resolve()
      log('server: false during hydration, deferring to subscription')
    } else if (!subscribe) {
      // subscribe: false - no subscription, use refresh() for data
      // If no SSR data, fetch via HTTP
      resolvePromise = refresh()
      log('subscribe: false, fetching via HTTP')
    } else {
      // Wait for first subscription result
      resolvePromise = waitForSubscriptionResult()
    }

    // Setup subscription for real-time updates (only if subscribe: true)
    if (subscribe) {
      setupSubscription()
    } else {
      log('subscribe: false, skipping WebSocket subscription')
    }
  }

  // === Watch for reactive args changes (client only) ===
  // Only auto-refetch on args change if subscribe: true
  // With subscribe: false, data stays stale until manual refresh()
  if (import.meta.client && isRef(args) && subscribe) {
    watch(
      () => toValue(args),
      async (newArgs, oldArgs) => {
        if (stableStringify(newArgs) !== stableStringify(oldArgs)) {
          log('Args changed', { from: oldArgs, to: newArgs })

          // Remove from subscription cache (don't call unsubscribe - we do it ourselves below)
          removeFromSubscriptionCache(nuxtApp, cacheKey)
          if (unsubscribe) {
            unsubscribe()
            unsubscribe = null
          }

          if (newArgs === 'skip') {
            data.value = undefined
            pending.value = false
            error.value = null
          } else {
            pending.value = true
            error.value = null

            // Get new data via subscription
            const convex = nuxtApp.$convex as ConvexClient | undefined
            if (convex) {
              try {
                const result = await executeQueryViaSubscription(
                  convex,
                  query,
                  newArgs as FunctionArgs<Query>,
                )
                data.value = applyTransform(result)
                log('Args change: got result', { hasData: result !== undefined })
              } catch (e) {
                error.value = e instanceof Error ? e : new Error(String(e))
                log('Args change: failed', { error: error.value.message })
              } finally {
                pending.value = false
              }

              // Setup new subscription
              setupSubscription()
            }
          }
        }
      },
      { deep: true },
    )
  }

  // === Cleanup on unmount ===
  if (import.meta.client) {
    onUnmounted(() => {
      if (unsubscribe) {
        log('Unmounting, cleaning up subscription')
        // Remove from cache (using shared helper)
        removeFromSubscriptionCache(nuxtApp, cacheKey)
        unsubscribe()
        unsubscribe = null
      }
    })
  }

  // === Return thenable result (using shared helper) ===
  const resultData: UseConvexQueryData<DataT> = {
    data,
    status,
    pending: pendingComputed,
    error,
    refresh,
    execute,
    clear,
  }

  return buildThenableResult(resolvePromise, resultData) as UseConvexQueryReturn<DataT>
}
