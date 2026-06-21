import type { ConvexClient } from 'convex/browser'
import type { FunctionArgs, PaginationResult } from 'convex/server'
import {
  ref,
  computed,
  watch,
  getCurrentScope,
  onScopeDispose,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
  type WatchStopHandle,
  shallowRef,
} from 'vue'

import { useNuxtApp, useRequestEvent, useAsyncData, useState } from '#imports'

import { handleUnauthorizedAuthFailure } from '../utils/auth-unauthorized'
import { assertConvexComposableScope } from '../utils/composable-scope'
import {
  getFunctionName,
  hashArgs,
  getQueryKey,
  fetchAuthToken,
  releaseSubscription,
  acquireQuerySubscription,
  commitQueryBridgeData,
  commitQueryBridgeError,
  type QuerySubscriptionBridge,
} from '../utils/convex-cache'
import { isConvexArgsSkipped, normalizeConvexArgs } from '../utils/query-args'
import { executeQueryHttp, executeQueryViaSubscription } from '../utils/query-execution'
import {
  computePaginatedQueryStale,
  computePaginatedQueryStatus,
  type PaginatedQueryStatus,
} from '../utils/query-state'
import { getConvexRuntimeConfig } from '../utils/runtime-config'
import { generatePaginationId } from '../utils/shared-helpers'
import type {
  PaginatedQueryReference,
  PaginatedQueryArgs,
  PaginatedQueryItem,
} from './optimistic-updates'

export type ConvexPaginatedQuerySkip = 'skip'
export type ConvexPaginatedQueryArgs<Args> = Args | ConvexPaginatedQuerySkip

// Re-export optimistic update helpers and types
export {
  insertAtTop,
  insertAtPosition,
  insertAtBottomIfLoaded,
  updateInPaginatedQuery,
  deleteFromPaginatedQuery,
  type PaginatedQueryReference,
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
  type InsertAtTopOptions,
  type InsertAtPositionOptions,
  type InsertAtBottomIfLoadedOptions,
  type UpdateInPaginatedQueryOptions,
  type DeleteFromPaginatedQueryOptions,
} from './optimistic-updates'

export type { PaginatedQueryStatus }

/**
 * Options for useConvexPaginatedQuery
 *
 * @typeParam Item - The raw item type from the paginated query
 * @typeParam TransformedItem - The transformed item type (defaults to Item if no transform)
 */
export interface UseConvexPaginatedQueryOptions<Item = unknown, TransformedItem = Item> {
  /**
   * Number of items to load in the initial page.
   */
  initialNumItems: number

  /**
   * Run query on server during SSR.
   * @default true (configurable via nuxt.config convex.defaults.server)
   */
  server?: boolean

  /**
   * Subscribe to real-time updates via WebSocket.
   * Set to false to skip WebSocket subscriptions and only use SSR data.
   * Use refresh() to manually re-fetch when needed.
   * @default true (configurable via nuxt.config convex.defaults.subscribe)
   */
  subscribe?: boolean

  /**
   * Initial placeholder raw results value or factory.
   * Called to provide initial/placeholder data while loading first page.
   * If transform() is provided, the initial value is transformed as well.
   */
  initialData?: Item[] | (() => Item[])

  /**
   * Transform results after fetching.
   * Called on the concatenated results array from all loaded pages.
   * Applied on SSR result, every subscription update, and the `initialData` value.
   *
   * @example
   * ```ts
   * // Add computed fields to each item
   * transform: (items) => items.map(item => ({
   *   ...item,
   *   formattedDate: formatDate(item.createdAt)
   * }))
   *
   * // Filter items
   * transform: (items) => items.filter(item => item.isPublished)
   * ```
   */
  transform?: (results: Item[]) => TransformedItem[]
  /**
   * Keep previous successful results while first page for new args is loading.
   * @default false
   */
  keepPreviousData?: boolean
}

/**
 * Core return value properties from useConvexPaginatedQuery
 */
export interface UseConvexPaginatedQueryData<Item> {
  /**
   * All currently loaded results concatenated into a single array.
   */
  results: ComputedRef<Item[]>

  /**
   * The current pagination status.
   * - 'idle': Query disabled
   * - 'loading-first-page': Loading initial page
   * - 'ready': More items available
   * - 'loading-more': Loading additional page
   * - 'exhausted': All items loaded
   * - 'error': Last request failed
   */
  status: ComputedRef<PaginatedQueryStatus>

  /**
   * Whether the hook is currently loading results.
   */
  isLoading: ComputedRef<boolean>
  /**
   * True when keepPreviousData is showing rows for older args while the first page reloads.
   */
  isStale: ComputedRef<boolean>
  /**
   * Whether another page can be loaded.
   */
  hasNextPage: ComputedRef<boolean>

  /**
   * Function to load more items.
   * @param numItems - Number of items to load in the next page
   */
  loadMore: (numItems: number) => void

  /**
   * Error if any page failed to load.
   */
  error: Readonly<Ref<Error | null>>

  /**
   * Re-fetch all currently loaded pages via HTTP.
   * Useful for manual refresh when subscribe: false, or force-refresh with subscriptions.
   */
  refresh: () => Promise<void>

  /**
   * Clear all pages and restart from the first page.
   * Equivalent to args change - resets pagination state completely.
   */
  reset: () => Promise<void>
}

interface BuildConvexPaginatedQueryResult<Item> {
  resultData: UseConvexPaginatedQueryData<Item>
  resolvePromise: Promise<void>
}

// Internal page state
interface PageState<T> {
  paginationOpts: { numItems: number; cursor: string | null; id: number }
  result: PaginationResult<T> | undefined
  error: Error | null
  pending: boolean
  unsubscribe: (() => void) | null
}

interface StablePaginationOpts {
  numItems: number
  cursor: string | null
}

/**
 * A Nuxt composable for paginated queries with Convex.
 * Provides "Load More" or infinite scroll functionality with real-time updates.
 *
 * @example
 * ```vue
 * <script setup>
 * import { api } from '#convex/api'
 *
 * // Basic usage
 * const { results, status, loadMore, isLoading } = await useConvexPaginatedQuery(
 *   api.messages.list,
 *   {},
 *   { initialNumItems: 10 }
 * )
 *
 * // With await (blocks navigation until first page loads)
 * const { results } = await useConvexPaginatedQuery(
 *   api.messages.list,
 *   {},
 *   { initialNumItems: 10 }
 * )
 *
 * // With transform
 * const { results } = await useConvexPaginatedQuery(
 *   api.messages.list,
 *   {},
 *   {
 *     initialNumItems: 10,
 *     transform: (items) => items.map(m => ({ ...m, formatted: formatDate(m.createdAt) }))
 *   }
 * )
 * </script>
 *
 * <template>
 *   <div>
 *     <div v-for="message in results" :key="message._id">
 *       {{ message.body }}
 *     </div>
 *     <button
 *       @click="loadMore(10)"
 *       :disabled="status !== 'ready'"
 *     >
 *       Load More
 *     </button>
 *   </div>
 * </template>
 * ```
 */
export function createConvexPaginatedQueryState<
  Query extends PaginatedQueryReference,
  Args extends ConvexPaginatedQueryArgs<PaginatedQueryArgs<Query>> = PaginatedQueryArgs<Query>,
  TransformedItem = PaginatedQueryItem<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexPaginatedQueryOptions<PaginatedQueryItem<Query>, TransformedItem>,
  resolveImmediately = false,
): BuildConvexPaginatedQueryResult<TransformedItem> {
  type Item = PaginatedQueryItem<Query>

  const nuxtApp = useNuxtApp()
  const convexConfig = getConvexRuntimeConfig()

  // Resolve options from: per-call options → global defaults → built-in defaults
  const defaults = convexConfig.defaults
  const initialNumItems = options?.initialNumItems ?? 10
  const server = options?.server ?? defaults?.server ?? true // SSR enabled by default
  const subscribe = options?.subscribe ?? defaults?.subscribe ?? true
  const authMode = defaults?.auth ?? 'auto'
  const keepPreviousData = options?.keepPreviousData ?? false
  const cleanupScope = import.meta.client ? getCurrentScope() : undefined
  assertConvexComposableScope('useConvexPaginatedQuery', import.meta.client, cleanupScope)
  const subscribeRealtime = subscribe

  // Get function name (needed for cache key)
  const fnName = getFunctionName(query)

  const normalizedArgs = computed((): Args => {
    return normalizeConvexArgs(args) as Args
  })
  const getArgs = (): Args => normalizedArgs.value

  const isSkipped = computed(() => isConvexArgsSkipped(normalizedArgs.value))
  const argsHash = computed(() => hashArgs(normalizedArgs.value))

  // Get request event and cookies on server
  const event = import.meta.server ? useRequestEvent() : null
  const cookieHeader = event?.headers.get('cookie') || ''

  // Get cached token state at setup time (synchronously) to avoid Vue context issues
  // Per Nuxt best practices, useState must be called at setup time, not inside async callbacks
  const cachedToken = useState<string | null>('convex:token')
  const authPending = useState<boolean>('convex:pending', () => false)
  const shouldWaitForAuthBeforeLiveQuery = computed(
    () =>
      import.meta.client &&
      subscribeRealtime &&
      authMode !== 'none' &&
      convexConfig.auth.enabled &&
      authPending.value,
  )

  // State management
  const currentPaginationId = ref(generatePaginationId())
  // pages ref holds ADDITIONAL pages (loaded via loadMore), NOT the first page
  // First page comes from asyncData (for SSR) + firstPageRealtimeData (for real-time updates)
  const pages = shallowRef<PageState<Item>[]>([])
  const globalError = ref<Error | null>(null)
  const pageBridgeWatchStops = new Map<
    number,
    { data: WatchStopHandle | null; error: WatchStopHandle | null }
  >()
  const isManualRefreshPending = ref(false)

  // Real-time updates for the first page (overrides asyncData when available)
  const firstPageRealtimeData = shallowRef<PaginationResult<Item> | null>(null)
  let firstPageUnsubscribe: (() => void) | null = null
  let stopFirstPageBridgeDataWatch: WatchStopHandle | null = null
  let stopFirstPageBridgeErrorWatch: WatchStopHandle | null = null

  // Initial pagination options for the first page
  // Computed to stay in sync with currentPaginationId (e.g., after reset())
  const initialPaginationOpts = computed(() => ({
    numItems: initialNumItems,
    cursor: null as string | null,
    id: currentPaginationId.value,
  }))

  // Generate cache key for SSR data
  // IMPORTANT: Do NOT include pagination ID in cache key - it changes between server/client
  // causing hydration mismatches. Only include args and initial numItems.
  // Made computed to stay in sync with reactive args changes
  const cacheKey = computed((): string => {
    if (isSkipped.value) {
      return `convex-paginated:idle:${fnName}`
    }
    const currentArgs = getArgs()
    if (currentArgs == null || currentArgs === 'skip') return `convex-paginated:idle:${fnName}`
    // Use stable pagination options (without the changing id)
    const stablePaginationOpts = { numItems: initialNumItems, cursor: null }
    return `convex-paginated:${getQueryKey(query, { ...currentArgs, paginationOpts: stablePaginationOpts })}`
  })

  const getStablePaginatedSubscriptionKey = (paginationOpts: StablePaginationOpts): string => {
    if (isSkipped.value) {
      return `paginated:${cacheKey.value}:idle`
    }
    const currentArgs = getArgs()
    if (currentArgs == null || currentArgs === 'skip') {
      return `paginated:${cacheKey.value}:idle`
    }
    return `paginated:${getQueryKey(query, {
      ...currentArgs,
      paginationOpts: {
        numItems: paginationOpts.numItems,
        cursor: paginationOpts.cursor,
      },
    })}`
  }

  const cleanupPageBridgeWatchers = (pageIndex: number) => {
    const stops = pageBridgeWatchStops.get(pageIndex)
    if (!stops) return
    stops.data?.()
    stops.error?.()
    pageBridgeWatchStops.delete(pageIndex)
  }

  const cleanupAllPageBridgeWatchers = () => {
    for (const pageIndex of pageBridgeWatchStops.keys()) {
      cleanupPageBridgeWatchers(pageIndex)
    }
  }

  const cleanupFirstPageBridgeWatchers = () => {
    if (stopFirstPageBridgeDataWatch) {
      stopFirstPageBridgeDataWatch()
      stopFirstPageBridgeDataWatch = null
    }
    if (stopFirstPageBridgeErrorWatch) {
      stopFirstPageBridgeErrorWatch()
      stopFirstPageBridgeErrorWatch = null
    }
  }

  const attachFirstPageSharedBridge = (bridge: QuerySubscriptionBridge) => {
    cleanupFirstPageBridgeWatchers()

    const syncDataFromBridge = () => {
      const snapshot = bridge.data.value
      if (!snapshot.hasData) return
      firstPageRealtimeData.value = snapshot.rawData as PaginationResult<Item>
      if (asyncData.error.value !== null) {
        ;(asyncData.error as unknown as Ref<Error | null>).value = null
      }
    }

    const syncErrorFromBridge = () => {
      const err = bridge.error.value
      if (!err) return
      ;(asyncData.error as unknown as Ref<Error | null>).value = err
    }

    stopFirstPageBridgeDataWatch = watch(() => bridge.data.value, syncDataFromBridge)
    stopFirstPageBridgeErrorWatch = watch(() => bridge.error.value, syncErrorFromBridge)

    syncDataFromBridge()
    syncErrorFromBridge()
  }

  const attachPageSharedBridge = (pageIndex: number, bridge: QuerySubscriptionBridge) => {
    cleanupPageBridgeWatchers(pageIndex)

    const syncDataFromBridge = () => {
      const snapshot = bridge.data.value
      if (!snapshot.hasData) return
      const currentPage = pages.value[pageIndex]
      if (!currentPage) return

      const newPages = [...pages.value]
      newPages[pageIndex] = {
        ...currentPage,
        result: snapshot.rawData as PaginationResult<Item>,
        pending: false,
        error: null,
      }
      pages.value = newPages
    }

    const syncErrorFromBridge = () => {
      const err = bridge.error.value
      if (!err) return
      const currentPage = pages.value[pageIndex]
      if (!currentPage) return

      const newPages = [...pages.value]
      newPages[pageIndex] = {
        ...currentPage,
        pending: false,
        error: err,
      }
      pages.value = newPages
    }

    const stopData = watch(() => bridge.data.value, syncDataFromBridge)
    const stopError = watch(() => bridge.error.value, syncErrorFromBridge)
    pageBridgeWatchStops.set(pageIndex, { data: stopData, error: stopError })

    // Late joiners may attach after the owner already received data/error.
    syncDataFromBridge()
    syncErrorFromBridge()
  }

  // Fetch function for HTTP transport (SSR and client HTTP-only mode)
  async function fetchPage(paginationOpts: {
    numItems: number
    cursor: string | null
    id: number
  }): Promise<PaginationResult<Item>> {
    const convexUrl = convexConfig.url
    if (!convexUrl) {
      throw new Error('[useConvexPaginatedQuery] Convex URL not configured')
    }

    const functionPath = getFunctionName(query)
    const currentArgs = getArgs() as PaginatedQueryArgs<Query>
    const siteUrl = convexConfig.siteUrl

    const fullArgs = {
      ...currentArgs,
      paginationOpts,
    }

    // Get auth token for HTTP transport
    let authToken: string | undefined
    if (import.meta.server) {
      authToken = await fetchAuthToken({
        auth: authMode,
        cookieHeader,
        siteUrl,
        cachedToken,
      })
    } else if (authMode !== 'none') {
      authToken = cachedToken.value ?? undefined
    }

    return executeQueryHttp<PaginationResult<Item>>(convexUrl, functionPath, fullArgs, authToken)
  }

  // Start subscription for a specific page
  function startPageSubscription(pageIndex: number) {
    if (import.meta.server) return
    if (!subscribeRealtime) return // Skip if subscriptions disabled
    if (shouldWaitForAuthBeforeLiveQuery.value) return

    const page = pages.value[pageIndex]
    if (!page) return

    const convex = nuxtApp.$convex as ConvexClient | undefined
    if (!convex) {
      if (import.meta.dev) {
        console.warn(
          '[useConvexPaginatedQuery] Convex client not available. Real-time updates disabled.',
        )
      }
      return
    }

    // Subscription deduplication (using shared helper)
    const subscriptionKey = getStablePaginatedSubscriptionKey({
      numItems: page.paginationOpts.numItems,
      cursor: page.paginationOpts.cursor,
    })

    // Clean up existing subscription
    if (page.unsubscribe) {
      page.unsubscribe()
    }

    const currentArgs = getArgs() as PaginatedQueryArgs<Query>
    const fullArgs = {
      ...currentArgs,
      paginationOpts: page.paginationOpts,
    }

    try {
      const subscription = acquireQuerySubscription(nuxtApp, subscriptionKey, (bridge) =>
        convex.onUpdate(
          query,
          fullArgs as FunctionArgs<Query>,
          (result: PaginationResult<Item>) => {
            commitQueryBridgeData(bridge, result)
          },
          (err: Error) => {
            void handleUnauthorizedAuthFailure({
              error: err,
              source: 'query',
              functionName: fnName,
            })
            commitQueryBridgeError(bridge, err)
          },
        ),
      )
      page.unsubscribe = () => {
        cleanupPageBridgeWatchers(pageIndex)
        void releaseSubscription(nuxtApp, subscriptionKey)
      }
      attachPageSharedBridge(pageIndex, subscription.bridge)
    } catch (e) {
      if (import.meta.dev) {
        console.warn('[useConvexPaginatedQuery] Page subscription failed:', e)
      }
      // Track error in page state so it surfaces via the error computed
      page.error = e instanceof Error ? e : new Error(String(e))
    }
  }

  // Load more function
  const loadMore = (numItems: number) => {
    if (isSkipped.value) return

    // Get cursor from either first page (asyncData/realtime) or additional pages
    let lastPageResult: PaginationResult<Item> | undefined

    if (pages.value.length > 0) {
      // Get cursor from last additional page
      const lastPage = pages.value[pages.value.length - 1]
      if (!lastPage) return
      if (lastPage.pending) return // Already loading
      lastPageResult = lastPage.result
    } else {
      // Get cursor from first page (real-time or asyncData)
      lastPageResult = firstPageRealtimeData.value ?? asyncData.data.value ?? undefined
    }

    if (!lastPageResult || lastPageResult.isDone) return

    const newPage: PageState<Item> = {
      paginationOpts: {
        numItems,
        cursor: lastPageResult.continueCursor,
        id: currentPaginationId.value,
      },
      result: undefined,
      error: null,
      pending: true,
      unsubscribe: null,
    }

    pages.value = [...pages.value, newPage]

    // Start fetching the new page (index in pages ref, not including first page from asyncData)
    const newPageIndex = pages.value.length - 1
    const requestPaginationId = currentPaginationId.value
    const requestArgsHash = argsHash.value

    const getCurrentPageForCommit = (): PageState<Item> | null => {
      if (currentPaginationId.value !== requestPaginationId || argsHash.value !== requestArgsHash) {
        return null
      }
      const currentPage = pages.value[newPageIndex]
      if (!currentPage || currentPage.paginationOpts.id !== requestPaginationId) {
        return null
      }
      return currentPage
    }

    if (import.meta.client && subscribeRealtime) {
      const convex = nuxtApp.$convex as ConvexClient | undefined
      if (convex) {
        const currentArgs = getArgs() as PaginatedQueryArgs<Query>
        const fullArgs = {
          ...currentArgs,
          paginationOpts: newPage.paginationOpts,
        }

        executeQueryViaSubscription(convex, query, fullArgs as FunctionArgs<Query>)
          .then((result) => {
            const currentPage = getCurrentPageForCommit()
            if (!currentPage) return
            const newPages = [...pages.value]
            newPages[newPageIndex] = {
              paginationOpts: currentPage.paginationOpts,
              unsubscribe: currentPage.unsubscribe,
              error: null,
              result,
              pending: false,
            }
            pages.value = newPages

            // Start subscription for real-time updates
            startPageSubscription(newPageIndex)
          })
          .catch((e) => {
            void handleUnauthorizedAuthFailure({ error: e, source: 'query', functionName: fnName })
            const currentPage = getCurrentPageForCommit()
            if (!currentPage) return
            const newPages = [...pages.value]
            newPages[newPageIndex] = {
              paginationOpts: currentPage.paginationOpts,
              unsubscribe: currentPage.unsubscribe,
              result: currentPage.result,
              error: e instanceof Error ? e : new Error(String(e)),
              pending: false,
            }
            pages.value = newPages
          })
        return
      }
    }

    void fetchPage(newPage.paginationOpts)
      .then((result) => {
        const currentPage = getCurrentPageForCommit()
        if (!currentPage) return
        const newPages = [...pages.value]
        newPages[newPageIndex] = {
          paginationOpts: currentPage.paginationOpts,
          unsubscribe: currentPage.unsubscribe,
          error: null,
          result,
          pending: false,
        }
        pages.value = newPages
      })
      .catch((e) => {
        void handleUnauthorizedAuthFailure({ error: e, source: 'query', functionName: fnName })
        const currentPage = getCurrentPageForCommit()
        if (!currentPage) return
        const newPages = [...pages.value]
        newPages[newPageIndex] = {
          paginationOpts: currentPage.paginationOpts,
          unsubscribe: currentPage.unsubscribe,
          result: currentPage.result,
          error: e instanceof Error ? e : new Error(String(e)),
          pending: false,
        }
        pages.value = newPages
      })
  }

  // === Transform helper ===
  const applyTransform = (items: Item[]): TransformedItem[] => {
    return options?.transform ? options.transform(items) : (items as unknown as TransformedItem[])
  }
  const resolveInitialData = (): Item[] | undefined => {
    const initialData = options?.initialData
    return typeof initialData === 'function' ? (initialData as () => Item[])() : initialData
  }
  const lastSettledResults = shallowRef<TransformedItem[]>([])
  const lastSettledArgsHash = ref<string | null>(null)

  const isPreviousDataForCurrentArgs = () =>
    keepPreviousData &&
    lastSettledArgsHash.value !== null &&
    argsHash.value !== lastSettledArgsHash.value &&
    asyncData.status.value === 'pending'

  // Computed status (defined before results since results may use it for default)
  // Uses asyncData/firstPageRealtimeData for first page state, pages ref for additional pages
  const status = computed((): PaginatedQueryStatus => {
    const isUsingPreviousData = isPreviousDataForCurrentArgs()
    const firstPageData = isUsingPreviousData
      ? null
      : (firstPageRealtimeData.value ?? asyncData.data.value)
    const firstPagePending =
      (isUsingPreviousData ||
        asyncData.status.value === 'pending' ||
        shouldWaitForAuthBeforeLiveQuery.value) &&
      !firstPageRealtimeData.value
    const lastPage = pages.value.length > 0 ? pages.value[pages.value.length - 1] : null

    return computePaginatedQueryStatus({
      isSkipped: isSkipped.value,
      isManualRefreshPending: isManualRefreshPending.value,
      hasGlobalError: globalError.value != null,
      hasFirstPageError: asyncData.error.value != null,
      hasMorePageError: pages.value.some((page) => page.error != null),
      server,
      isServer: import.meta.server,
      isClient: import.meta.client,
      resolveImmediately,
      hasFirstPageData: firstPageData != null,
      firstPagePending,
      lastPagePending: lastPage?.pending ?? false,
      lastPageDone: lastPage?.result?.isDone ?? false,
      firstPageDone: firstPageData?.isDone ?? false,
    })
  })

  // Computed results - concatenate all pages
  // First page comes from asyncData (for proper SSR) or firstPageRealtimeData (for real-time updates)
  // Additional pages come from pages ref
  const rawResults = computed((): Item[] => {
    if (isSkipped.value) return []
    if (isPreviousDataForCurrentArgs()) return []

    const allItems: Item[] = []

    // First page: prefer real-time data, fall back to asyncData
    // asyncData.data is tracked by Nuxt's Suspense and will block SSR until ready
    const firstPageData = firstPageRealtimeData.value ?? asyncData.data.value
    if (firstPageData) {
      allItems.push(...firstPageData.page)
    }

    // Additional pages (from loadMore) come from pages ref
    for (const page of pages.value) {
      if (page?.result) {
        allItems.push(...page.result.page)
      }
    }

    return allItems
  })

  // Apply transform to results, use default if loading first page with no data
  const transformedResults = computed((): TransformedItem[] => {
    const raw = rawResults.value
    // If we have raw data, transform it
    if (raw.length > 0) {
      return applyTransform(raw)
    }
    // If loading first page and have initial data, use it
    const initialData = resolveInitialData()
    if (status.value === 'loading-first-page' && initialData) {
      return applyTransform(initialData)
    }
    // Otherwise return empty transformed array
    return applyTransform([])
  })

  const isStale = computed(() => {
    return computePaginatedQueryStale({
      keepPreviousData,
      status: status.value,
      transformedResultCount: transformedResults.value.length,
      lastSettledResultCount: lastSettledResults.value.length,
    })
  })

  const results = computed((): TransformedItem[] => {
    if (isStale.value) {
      return lastSettledResults.value as TransformedItem[]
    }

    return transformedResults.value
  })

  // Computed isLoading
  const isLoading = computed(() => {
    const s = status.value
    return s === 'loading-first-page' || s === 'loading-more'
  })
  const hasNextPage = computed(() => status.value === 'ready')

  // Computed error - checks all error sources
  // Note: asyncData is referenced here but defined below - this works because computed is lazily evaluated
  const error = computed((): Error | null => {
    if (globalError.value) return globalError.value

    // Check asyncData error (first page fetch/subscription errors)
    const asyncError = asyncData.error.value
    if (asyncError != null) {
      // Convert NuxtError to Error if needed
      return asyncError instanceof Error ? asyncError : new Error(String(asyncError))
    }

    // Check page-specific errors
    for (const page of pages.value) {
      if (page.error) return page.error
    }
    return null
  })

  // Use useAsyncData for SSR-compatible first page fetch
  // This handles: SSR fetch, payload serialization, client hydration
  const asyncData = useAsyncData(
    cacheKey,
    async (): Promise<PaginationResult<Item> | null> => {
      if (isSkipped.value) return null

      try {
        // On client-side navigation, use WebSocket subscription in live mode only
        if (import.meta.client && subscribeRealtime) {
          if (shouldWaitForAuthBeforeLiveQuery.value) {
            return null
          }

          const convex = nuxtApp.$convex as ConvexClient | undefined
          if (convex) {
            const currentArgs = getArgs() as PaginatedQueryArgs<Query>
            const fullArgs = {
              ...currentArgs,
              paginationOpts: initialPaginationOpts.value,
            }
            return await executeQueryViaSubscription(convex, query, fullArgs as FunctionArgs<Query>)
          }
        }

        // Server or HTTP-only mode
        return await fetchPage(initialPaginationOpts.value)
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
      dedupe: 'defer', // Use cached data if same key exists, avoids "different handler" warning
      // Convex payloads are replaced immutably; deep Vue traversal is unnecessary overhead.
      deep: false,
    },
  )

  watch(
    [() => status.value, () => transformedResults.value],
    ([nextStatus, nextResults]) => {
      if (isSkipped.value) return
      if (nextStatus === 'loading-first-page') return
      lastSettledResults.value = nextResults as TransformedItem[]
      lastSettledArgsHash.value = argsHash.value
    },
    { immediate: true },
  )

  // Start subscription for the first page (for real-time updates)
  function startFirstPageSubscription() {
    if (import.meta.server) return
    if (!subscribeRealtime) return // Skip if subscriptions disabled
    if (shouldWaitForAuthBeforeLiveQuery.value) return

    const convex = nuxtApp.$convex as ConvexClient | undefined
    if (!convex) {
      if (import.meta.dev) {
        console.warn(
          '[useConvexPaginatedQuery] Convex client not available. Real-time updates disabled.',
        )
      }
      return
    }

    // Subscription deduplication (using shared helper)
    if (isSkipped.value) return

    const subscriptionKey = getStablePaginatedSubscriptionKey({
      numItems: initialPaginationOpts.value.numItems,
      cursor: initialPaginationOpts.value.cursor,
    })

    // Clean up existing subscription
    if (firstPageUnsubscribe) {
      firstPageUnsubscribe()
      firstPageUnsubscribe = null
    }

    const currentArgs = getArgs() as PaginatedQueryArgs<Query>
    const fullArgs = {
      ...currentArgs,
      paginationOpts: initialPaginationOpts.value,
    }

    try {
      const subscription = acquireQuerySubscription(nuxtApp, subscriptionKey, (bridge) =>
        convex.onUpdate(
          query,
          fullArgs as FunctionArgs<Query>,
          (result: PaginationResult<Item>) => {
            commitQueryBridgeData(bridge, result)
          },
          (err: Error) => {
            void handleUnauthorizedAuthFailure({
              error: err,
              source: 'query',
              functionName: fnName,
            })
            commitQueryBridgeError(bridge, err)
          },
        ),
      )
      firstPageUnsubscribe = () => {
        cleanupFirstPageBridgeWatchers()
        releaseSubscription(nuxtApp, subscriptionKey)
      }
      attachFirstPageSharedBridge(subscription.bridge)
    } catch (e) {
      if (import.meta.dev) {
        console.warn('[useConvexPaginatedQuery] First page subscription failed:', e)
      }
      // Track error so it surfaces via the error computed
      globalError.value = e instanceof Error ? e : new Error(String(e))
    }
  }

  // Helper to clean up all subscriptions
  function cleanupAllSubscriptions() {
    cleanupFirstPageBridgeWatchers()
    cleanupAllPageBridgeWatchers()

    // Clean up first page subscription via ref-counted release
    if (firstPageUnsubscribe) {
      firstPageUnsubscribe()
      firstPageUnsubscribe = null
    }

    // Clean up additional page subscriptions via ref-counted release
    for (let i = 0; i < pages.value.length; i++) {
      const page = pages.value[i]
      if (page?.unsubscribe) {
        page.unsubscribe()
      }
    }
  }

  // Client-side subscription setup
  if (import.meta.client) {
    const startAllSubscriptions = () => {
      if (!subscribeRealtime) {
        return
      }
      if (shouldWaitForAuthBeforeLiveQuery.value) {
        return
      }
      // Start first page subscription
      startFirstPageSubscription()

      // Start subscriptions for additional pages
      for (let i = 0; i < pages.value.length; i++) {
        startPageSubscription(i)
      }
    }

    // Start subscriptions after hydration
    if (!isSkipped.value && subscribeRealtime) {
      startAllSubscriptions()
    }

    watch(
      () => ({
        hash: argsHash.value,
        skipped: isSkipped.value,
        waitForAuth: shouldWaitForAuthBeforeLiveQuery.value,
      }),
      async (next, prev) => {
        if (
          next.hash === prev.hash &&
          next.skipped === prev.skipped &&
          next.waitForAuth === prev.waitForAuth
        ) {
          return
        }

        // Clean up all subscriptions
        cleanupAllSubscriptions()
        firstPageRealtimeData.value = null

        if (isSkipped.value || next.waitForAuth) {
          pages.value = []
          globalError.value = null
          return
        }

        // Reset pagination
        currentPaginationId.value = generatePaginationId()
        pages.value = []
        globalError.value = null

        // Refresh asyncData with new args (this will trigger re-fetch)
        await asyncData.refresh()

        // Start subscriptions in live mode
        if (subscribeRealtime) {
          startAllSubscriptions()
        }
      },
    )

    // Cleanup on unmount/scope dispose.
    if (cleanupScope) {
      onScopeDispose(() => {
        cleanupAllSubscriptions()
      })
    }
  }

  // === Methods ===

  // Refresh: Re-fetch all currently loaded pages via HTTP
  async function refresh(): Promise<void> {
    if (isSkipped.value) {
      return
    }

    isManualRefreshPending.value = true
    globalError.value = null
    ;(asyncData.error as unknown as Ref<Error | null>).value = null

    const refreshPaginationId = currentPaginationId.value
    const loadedPages = [...pages.value]

    try {
      const firstPageResult = await fetchPage(initialPaginationOpts.value)

      const refreshedPages = [...loadedPages]
      for (let i = 0; i < loadedPages.length; i++) {
        const page = loadedPages[i]
        if (!page) continue

        const pageResult = await fetchPage(page.paginationOpts)
        refreshedPages[i] = {
          ...page,
          result: pageResult,
          pending: false,
          error: null,
        }
      }

      if (currentPaginationId.value === refreshPaginationId && !isSkipped.value) {
        firstPageRealtimeData.value = firstPageResult
        pages.value = refreshedPages
        ;(asyncData.error as unknown as Ref<Error | null>).value = null
        globalError.value = null
      }
    } catch (e) {
      globalError.value = e instanceof Error ? e : new Error(String(e))
    } finally {
      isManualRefreshPending.value = false
    }
  }

  // Reset: Clear all pages and restart from the first page
  async function reset(): Promise<void> {
    isManualRefreshPending.value = true

    // Clean up subscriptions
    if (import.meta.client) {
      cleanupAllSubscriptions()
    }

    // Reset state
    firstPageRealtimeData.value = null
    currentPaginationId.value = generatePaginationId()
    pages.value = []
    globalError.value = null
    ;(asyncData.error as unknown as Ref<Error | null>).value = null

    // Re-fetch first page via asyncData refresh
    try {
      await asyncData.refresh()
    } finally {
      isManualRefreshPending.value = false
    }

    // Restart subscriptions
    if (import.meta.client && subscribeRealtime && !isSkipped.value) {
      startFirstPageSubscription()
    }
  }

  let resolvePromise: Promise<void>

  if (isSkipped.value) {
    // Skipped - resolve immediately
    resolvePromise = Promise.resolve()
  } else if (import.meta.server) {
    // SSR
    if (!server) {
      // server: false - skip SSR fetch, resolve immediately
      resolvePromise = Promise.resolve()
    } else {
      // server: true - wait for asyncData (useAsyncData handles the blocking)
      // NOTE: On SSR, immediate resolve is ignored and we always wait for fetch.
      resolvePromise = asyncData.then(() => {})
    }
  } else {
    // Client
    const isInitialHydration = nuxtApp.isHydrating
    const hasExistingData = asyncData.data.value !== null && asyncData.data.value !== undefined

    if (hasExistingData) {
      // Already have data (from SSR hydration)
      resolvePromise = Promise.resolve()
    } else if (resolveImmediately) {
      // Internal immediate resolve mode: resolve immediately while data loads in background.
      resolvePromise = Promise.resolve()
    } else if (!server && isInitialHydration) {
      // server: false during initial hydration - don't block
      resolvePromise = Promise.resolve()
    } else if (!subscribeRealtime) {
      // Real-time subscriptions are disabled - asyncData uses HTTP-only transport.
      resolvePromise = asyncData.then(() => {})
    } else {
      // Wait for asyncData (which uses subscription on client)
      resolvePromise = asyncData.then(() => {})
    }
  }

  // Create result data object
  const resultData: UseConvexPaginatedQueryData<TransformedItem> = {
    results,
    status,
    isLoading,
    isStale,
    hasNextPage,
    loadMore,
    error,
    refresh,
    reset,
  }

  return {
    resultData,
    resolvePromise,
  }
}

export async function useConvexPaginatedQuery<
  Query extends PaginatedQueryReference,
  Args extends ConvexPaginatedQueryArgs<PaginatedQueryArgs<Query>> = PaginatedQueryArgs<Query>,
  TransformedItem = PaginatedQueryItem<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexPaginatedQueryOptions<PaginatedQueryItem<Query>, TransformedItem>,
): Promise<UseConvexPaginatedQueryData<TransformedItem>> {
  const { resultData, resolvePromise } = createConvexPaginatedQueryState(
    query,
    args,
    options,
    false,
  )
  await resolvePromise
  return resultData
}
