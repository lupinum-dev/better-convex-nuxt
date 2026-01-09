import type { ConvexClient, OptimisticLocalStore } from 'convex/browser'
import type {
  FunctionReference,
  FunctionArgs,
  FunctionReturnType,
  PaginationResult,
  PaginationOptions,
} from 'convex/server'

import { useNuxtApp, useRuntimeConfig, useRequestEvent, useAsyncData } from '#imports'
import { convexToJson, type Value } from 'convex/values'
import {
  ref,
  computed,
  watch,
  onUnmounted,
  toValue,
  isRef,
  type ComputedRef,
  type Ref,
  shallowRef,
  triggerRef,
} from 'vue'

import {
  getFunctionName,
  hashArgs,
  getQueryKey,
  fetchAuthToken,
  registerSubscription,
  hasSubscription,
  removeFromSubscriptionCache,
} from '../utils/convex-cache'
import { executeQueryHttp, executeQueryViaSubscription } from './useConvexQuery'

/**
 * A FunctionReference that is usable with useConvexPaginatedQuery.
 *
 * This function reference must:
 * - Refer to a public query
 * - Have an argument named "paginationOpts" of type PaginationOptions
 * - Have a return type of PaginationResult.
 */
export type PaginatedQueryReference = FunctionReference<
  'query',
  'public',
  { paginationOpts: PaginationOptions },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PaginationResult<any>
>

/**
 * Pagination status representing the current state of the pagination.
 */
export type PaginationStatus = 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted'

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
   * Set to false for client-only data.
   * @default true
   */
  server?: boolean

  /**
   * Don't block when awaited.
   * Query runs in background, shows LoadingFirstPage state.
   * @default false
   */
  lazy?: boolean

  /**
   * Subscribe to real-time updates via WebSocket.
   * Set to false to skip WebSocket subscriptions and only use SSR data.
   * Use refresh() to manually re-fetch when needed.
   * @default true
   */
  subscribe?: boolean

  /**
   * Mark this query as public (no authentication needed).
   * When true, skips all auth token checks during SSR.
   * @default false
   */
  public?: boolean

  /**
   * Factory function for default results value.
   * Called to provide initial/placeholder data while loading first page.
   * This is NOT transformed - provide already-transformed data.
   */
  default?: () => TransformedItem[]

  /**
   * Transform results after fetching.
   * Called on the concatenated results array from all loaded pages.
   * Applied on SSR result and every subscription update.
   * Does NOT apply to the `default` value.
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
   * - 'LoadingFirstPage': Loading the initial page
   * - 'CanLoadMore': More items available, call loadMore to fetch
   * - 'LoadingMore': Currently loading another page
   * - 'Exhausted': All items have been loaded
   */
  status: ComputedRef<PaginationStatus>

  /**
   * Whether the hook is currently loading results.
   */
  isLoading: ComputedRef<boolean>

  /**
   * Function to load more items.
   * @param numItems - Number of items to load in the next page
   */
  loadMore: (numItems: number) => void

  /**
   * Error if any page failed to load.
   */
  error: Ref<Error | null>

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

  /**
   * Clear all data and subscriptions.
   * Sets results to empty, status to 'LoadingFirstPage'.
   */
  clear: () => void
}

/**
 * Return value from useConvexPaginatedQuery.
 * Combines the data properties with Promise interface for await support.
 */
export type UseConvexPaginatedQueryReturn<Item> = UseConvexPaginatedQueryData<Item> &
  Promise<UseConvexPaginatedQueryData<Item>>

type MaybeRef<T> = T | ReturnType<typeof ref<T>> | ReturnType<typeof computed<T>>

/**
 * Given a PaginatedQueryReference, get the type of the arguments
 * object for the query, excluding the `paginationOpts` argument.
 */
export type PaginatedQueryArgs<Query extends PaginatedQueryReference> = Omit<
  FunctionArgs<Query>,
  'paginationOpts'
>

/**
 * Given a PaginatedQueryReference, get the type of the item being paginated over.
 */
export type PaginatedQueryItem<Query extends PaginatedQueryReference> =
  FunctionReturnType<Query>['page'][number]

// Internal page state
interface PageState<T> {
  paginationOpts: { numItems: number; cursor: string | null; id: number }
  result: PaginationResult<T> | undefined
  error: Error | null
  pending: boolean
  unsubscribe: (() => void) | null
}

// Generate unique pagination ID for cache-busting
let paginationId = 0
function nextPaginationId(): number {
  paginationId++
  return paginationId
}

/**
 * A Nuxt composable for paginated queries with Convex.
 * Provides "Load More" or infinite scroll functionality with real-time updates.
 *
 * @example
 * ```vue
 * <script setup>
 * import { api } from '~/convex/_generated/api'
 *
 * // Basic usage
 * const { results, status, loadMore, isLoading } = useConvexPaginatedQuery(
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
 * // Lazy loading (instant navigation, shows loading state)
 * const { results, status } = await useConvexPaginatedQuery(
 *   api.messages.list,
 *   {},
 *   { initialNumItems: 10, lazy: true }
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
 *       :disabled="status !== 'CanLoadMore'"
 *     >
 *       Load More
 *     </button>
 *   </div>
 * </template>
 * ```
 */
export function useConvexPaginatedQuery<
  Query extends PaginatedQueryReference,
  Args extends PaginatedQueryArgs<Query> | 'skip' = PaginatedQueryArgs<Query>,
  TransformedItem = PaginatedQueryItem<Query>,
>(
  query: Query,
  args?: MaybeRef<Args> | Args,
  options?: UseConvexPaginatedQueryOptions<PaginatedQueryItem<Query>, TransformedItem>,
): UseConvexPaginatedQueryReturn<TransformedItem> {
  type Item = PaginatedQueryItem<Query>

  const nuxtApp = useNuxtApp()
  const config = useRuntimeConfig()

  // Resolve options with defaults
  const initialNumItems = options?.initialNumItems ?? 10
  const server = options?.server ?? true
  const lazy = options?.lazy ?? false
  const subscribe = options?.subscribe ?? true
  const isPublic = options?.public ?? false

  // Get function name (needed for cache key)
  const fnName = getFunctionName(query)

  // No-op log for compatibility (verbose debug logging removed in v0.2)
  const log = (_message: string, _data?: unknown) => {}

  // Get reactive args value
  const getArgs = (): Args => toValue(args) ?? ({} as Args)

  // Check if query is statically skipped
  const isStaticSkip = !isRef(args) && getArgs() === 'skip'

  // Early return for static skip
  if (isStaticSkip) {
    const results = computed(() => (options?.default?.() ?? []) as TransformedItem[])
    const status = computed(() => 'Exhausted' as PaginationStatus)
    const isLoading = computed(() => false)
    const error = ref<Error | null>(null)
    const loadMore = () => {}
    const refresh = async () => {}
    const reset = async () => {}
    const clear = () => {}

    const resultData: UseConvexPaginatedQueryData<TransformedItem> = {
      results,
      status,
      isLoading,
      loadMore,
      error,
      refresh,
      reset,
      clear,
    }
    const resultPromise = Promise.resolve(resultData)
    Object.assign(resultPromise, resultData)
    return resultPromise as UseConvexPaginatedQueryReturn<TransformedItem>
  }

  // Check if query should be skipped (reactive via computed)
  const isSkipped = computed(() => getArgs() === 'skip')

  // Get request event and cookies on server
  const event = import.meta.server ? useRequestEvent() : null
  const cookieHeader = event?.headers.get('cookie') || ''

  // State management
  const currentPaginationId = ref(nextPaginationId())
  // pages ref holds ADDITIONAL pages (loaded via loadMore), NOT the first page
  // First page comes from asyncData (for SSR) + firstPageRealtimeData (for real-time updates)
  const pages = shallowRef<PageState<Item>[]>([])
  const globalError = ref<Error | null>(null)

  // Real-time updates for the first page (overrides asyncData when available)
  const firstPageRealtimeData = shallowRef<PaginationResult<Item> | null>(null)
  let firstPageUnsubscribe: (() => void) | null = null

  // Initial pagination options for the first page
  const initialPaginationOpts = {
    numItems: initialNumItems,
    cursor: null as string | null,
    id: currentPaginationId.value,
  }

  // Generate cache key for SSR data
  // IMPORTANT: Do NOT include pagination ID in cache key - it changes between server/client
  // causing hydration mismatches. Only include args and initial numItems.
  const getCacheKey = (): string => {
    const currentArgs = getArgs()
    if (currentArgs === 'skip') return `convex-paginated:skip:${fnName}`
    // Use stable pagination options (without the changing id)
    const stablePaginationOpts = { numItems: initialNumItems, cursor: null }
    return `convex-paginated:${getQueryKey(query, { ...currentArgs, paginationOpts: stablePaginationOpts })}`
  }
  const cacheKey = getCacheKey()

  // Fetch function for SSR
  async function fetchPage(paginationOpts: {
    numItems: number
    cursor: string | null
    id: number
  }): Promise<PaginationResult<Item>> {
    const convexUrl = config.public.convex?.url
    if (!convexUrl) {
      throw new Error('[useConvexPaginatedQuery] Convex URL not configured')
    }

    const functionPath = getFunctionName(query)
    const currentArgs = getArgs() as PaginatedQueryArgs<Query>
    const siteUrl = config.public.convex?.siteUrl || config.public.convex?.auth?.url

    const fullArgs = {
      ...currentArgs,
      paginationOpts,
    }

    log('Fetching page', { cursor: paginationOpts.cursor, numItems: paginationOpts.numItems })

    // Get auth token using shared helper (only on server)
    let authToken: string | undefined
    if (import.meta.server) {
      authToken = await fetchAuthToken({
        isPublic,
        cookieHeader,
        siteUrl,
      })
    }

    return executeQueryHttp<PaginationResult<Item>>(convexUrl, functionPath, fullArgs, authToken)
  }

  // Start subscription for a specific page
  function startPageSubscription(pageIndex: number) {
    if (import.meta.server) return
    if (!subscribe) return // Skip if subscriptions disabled

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
    const subscriptionKey = `paginated:${cacheKey}:page:${pageIndex}`
    if (hasSubscription(nuxtApp, subscriptionKey)) {
      log('Page subscription already exists, reusing', { pageIndex })
      return
    }

    // Clean up existing subscription
    if (page.unsubscribe) {
      page.unsubscribe()
    }

    const currentArgs = getArgs() as PaginatedQueryArgs<Query>
    const fullArgs = {
      ...currentArgs,
      paginationOpts: page.paginationOpts,
    }

    log('Starting subscription for page', { pageIndex, cursor: page.paginationOpts.cursor })

    try {
      page.unsubscribe = convex.onUpdate(
        query,
        fullArgs as FunctionArgs<Query>,
        (result: PaginationResult<Item>) => {
          log('Real-time update for page', { pageIndex, itemCount: result.page.length })
          const currentPage = pages.value[pageIndex]
          if (!currentPage) return
          const newPages = [...pages.value]
          newPages[pageIndex] = {
            paginationOpts: currentPage.paginationOpts,
            unsubscribe: currentPage.unsubscribe,
            result,
            pending: false,
            error: null,
          }
          pages.value = newPages
          triggerRef(pages)
        },
        (err: Error) => {
          log('Subscription error for page', { pageIndex, error: err.message })
          const currentPage = pages.value[pageIndex]
          if (!currentPage) return
          const newPages = [...pages.value]
          newPages[pageIndex] = {
            ...currentPage,
            pending: false,
            error: err,
          }
          pages.value = newPages
          triggerRef(pages)
        },
      )
      // Register subscription in cache (using shared helper)
      registerSubscription(nuxtApp, subscriptionKey, page.unsubscribe)
    } catch (e) {
      log('Subscription failed', { pageIndex, error: e instanceof Error ? e.message : String(e) })
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

    log('Loading more', { numItems, additionalPagesCount: pages.value.length })

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
    triggerRef(pages)

    // Start fetching the new page (index in pages ref, not including first page from asyncData)
    const newPageIndex = pages.value.length - 1

    if (import.meta.client) {
      const convex = nuxtApp.$convex as ConvexClient | undefined
      if (convex) {
        const currentArgs = getArgs() as PaginatedQueryArgs<Query>
        const fullArgs = {
          ...currentArgs,
          paginationOpts: newPage.paginationOpts,
        }

        executeQueryViaSubscription(convex, query, fullArgs as FunctionArgs<Query>)
          .then((result) => {
            log('Page loaded', { pageIndex: newPageIndex, itemCount: result.page.length })
            const currentPage = pages.value[newPageIndex]
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
            triggerRef(pages)

            // Start subscription for real-time updates
            startPageSubscription(newPageIndex)
          })
          .catch((e) => {
            log('Page load failed', {
              pageIndex: newPageIndex,
              error: e instanceof Error ? e.message : String(e),
            })
            const currentPage = pages.value[newPageIndex]
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
            triggerRef(pages)
          })
      }
    }
  }

  // === Transform helper ===
  const applyTransform = (items: Item[]): TransformedItem[] => {
    return options?.transform ? options.transform(items) : (items as unknown as TransformedItem[])
  }

  // Computed status (defined before results since results may use it for default)
  // Uses asyncData/firstPageRealtimeData for first page state, pages ref for additional pages
  const status = computed((): PaginationStatus => {
    if (isSkipped.value) return 'Exhausted'

    // First page status from real-time data or asyncData
    const firstPageData = firstPageRealtimeData.value ?? asyncData.data.value
    const firstPagePending = asyncData.status.value === 'pending' && !firstPageRealtimeData.value

    if (firstPagePending && !firstPageData) return 'LoadingFirstPage'

    // If no first page data and not pending, still loading
    if (!firstPageData) return 'LoadingFirstPage'

    // Check additional pages for loading state
    if (pages.value.length > 0) {
      const lastPage = pages.value[pages.value.length - 1]
      if (lastPage?.pending) return 'LoadingMore'
      if (lastPage?.result?.isDone) return 'Exhausted'
    }

    // Only first page loaded - check if it's done
    if (firstPageData.isDone) return 'Exhausted'

    return 'CanLoadMore'
  })

  // Computed results - concatenate all pages
  // First page comes from asyncData (for proper SSR) or firstPageRealtimeData (for real-time updates)
  // Additional pages come from pages ref
  const rawResults = computed((): Item[] => {
    if (isSkipped.value) return []

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
  const results = computed((): TransformedItem[] => {
    const raw = rawResults.value
    // If we have raw data, transform it
    if (raw.length > 0) {
      return applyTransform(raw)
    }
    // If loading first page and have default, use default
    if (status.value === 'LoadingFirstPage' && options?.default) {
      return options.default()
    }
    // Otherwise return empty transformed array
    return applyTransform([])
  })

  // Computed isLoading
  const isLoading = computed(() => {
    const s = status.value
    return s === 'LoadingFirstPage' || s === 'LoadingMore'
  })

  // Computed error
  const error = computed((): Error | null => {
    if (globalError.value) return globalError.value

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

      // On client-side navigation, use WebSocket subscription
      if (import.meta.client) {
        const convex = nuxtApp.$convex as ConvexClient | undefined
        if (convex) {
          log('Client navigation - waiting for query via subscription')
          const currentArgs = getArgs() as PaginatedQueryArgs<Query>
          const fullArgs = {
            ...currentArgs,
            paginationOpts: initialPaginationOpts,
          }
          return await executeQueryViaSubscription(convex, query, fullArgs as FunctionArgs<Query>)
        }
      }

      // On server, use HTTP fetch
      log('SSR - fetching via HTTP')
      return await fetchPage(initialPaginationOpts)
    },
    {
      server,
      lazy: false, // Always block for SSR to ensure data is ready
    },
  )

  // Start subscription for the first page (for real-time updates)
  function startFirstPageSubscription() {
    if (import.meta.server) return
    if (!subscribe) return // Skip if subscriptions disabled

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
    const subscriptionKey = `paginated:${cacheKey}:firstPage`
    if (hasSubscription(nuxtApp, subscriptionKey)) {
      log('First page subscription already exists, reusing')
      return
    }

    // Clean up existing subscription
    if (firstPageUnsubscribe) {
      firstPageUnsubscribe()
      firstPageUnsubscribe = null
    }

    const currentArgs = getArgs() as PaginatedQueryArgs<Query>
    const fullArgs = {
      ...currentArgs,
      paginationOpts: initialPaginationOpts,
    }

    log('Starting first page subscription')

    try {
      firstPageUnsubscribe = convex.onUpdate(
        query,
        fullArgs as FunctionArgs<Query>,
        (result: PaginationResult<Item>) => {
          log('First page real-time update', { itemCount: result.page.length })
          firstPageRealtimeData.value = result
        },
        (err: Error) => {
          log('First page subscription error', { error: err.message })
          // Update asyncData error state
          ;(asyncData.error as Ref<Error | null>).value = err
        },
      )
      // Register subscription in cache (using shared helper)
      registerSubscription(nuxtApp, subscriptionKey, firstPageUnsubscribe)
    } catch (e) {
      log('First page subscription failed', { error: e instanceof Error ? e.message : String(e) })
    }
  }

  // Helper to clean up all subscriptions
  function cleanupAllSubscriptions() {
    // Clean up first page subscription
    if (firstPageUnsubscribe) {
      firstPageUnsubscribe()
      firstPageUnsubscribe = null
    }
    const firstPageKey = `paginated:${cacheKey}:firstPage`
    removeFromSubscriptionCache(nuxtApp, firstPageKey)

    // Clean up additional page subscriptions
    for (let i = 0; i < pages.value.length; i++) {
      const page = pages.value[i]
      if (page?.unsubscribe) {
        page.unsubscribe()
      }
      const pageKey = `paginated:${cacheKey}:page:${i}`
      removeFromSubscriptionCache(nuxtApp, pageKey)
    }
  }

  // Client-side subscription setup
  if (import.meta.client) {
    const startAllSubscriptions = () => {
      if (!subscribe) {
        log('subscribe: false, skipping all subscriptions')
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
    if (!isSkipped.value) {
      startAllSubscriptions()
    }

    // Watch for reactive args changes
    // Only auto-refetch on args change if subscribe: true
    if (isRef(args) && subscribe) {
      watch(
        () => toValue(args),
        async (newArgs, oldArgs) => {
          if (hashArgs(newArgs) !== hashArgs(oldArgs)) {
            log('Reactive args changed', { from: oldArgs, to: newArgs })

            // Clean up all subscriptions
            cleanupAllSubscriptions()
            firstPageRealtimeData.value = null

            if (newArgs === 'skip') {
              pages.value = []
              globalError.value = null
            } else {
              // Reset pagination
              currentPaginationId.value = nextPaginationId()
              pages.value = []
              globalError.value = null

              // Refresh asyncData with new args (this will trigger re-fetch)
              await asyncData.refresh()

              // Start subscriptions
              startAllSubscriptions()
            }
          }
        },
        { deep: true },
      )
    }

    // Cleanup on unmount
    onUnmounted(() => {
      log('Component unmounted - cleaning up subscriptions')
      cleanupAllSubscriptions()
    })
  }

  // === Methods ===

  // Refresh: Re-fetch all currently loaded pages via HTTP
  async function refresh(): Promise<void> {
    if (isSkipped.value) {
      log('refresh: skipped (args=skip)')
      return
    }

    log('refresh: re-fetching all pages')

    try {
      // Re-fetch first page
      const firstPageResult = await fetchPage(initialPaginationOpts)
      firstPageRealtimeData.value = firstPageResult

      // Re-fetch additional pages
      for (let i = 0; i < pages.value.length; i++) {
        const page = pages.value[i]
        if (!page) continue

        const pageResult = await fetchPage(page.paginationOpts)
        const newPages = [...pages.value]
        newPages[i] = {
          ...page,
          result: pageResult,
          pending: false,
          error: null,
        }
        pages.value = newPages
        triggerRef(pages)
      }

      globalError.value = null
      log('refresh: completed successfully')
    } catch (e) {
      globalError.value = e instanceof Error ? e : new Error(String(e))
      log('refresh: failed', { error: globalError.value.message })
    }
  }

  // Reset: Clear all pages and restart from the first page
  async function reset(): Promise<void> {
    log('reset: clearing all pages and restarting')

    // Clean up subscriptions
    if (import.meta.client) {
      cleanupAllSubscriptions()
    }

    // Reset state
    firstPageRealtimeData.value = null
    currentPaginationId.value = nextPaginationId()
    pages.value = []
    globalError.value = null

    // Re-fetch first page via asyncData refresh
    await asyncData.refresh()

    // Restart subscriptions
    if (import.meta.client && subscribe && !isSkipped.value) {
      startFirstPageSubscription()
    }

    log('reset: completed')
  }

  // Clear: Remove all data and subscriptions without re-fetching
  function clear(): void {
    log('clear: clearing all data')

    // Clean up subscriptions
    if (import.meta.client) {
      cleanupAllSubscriptions()
    }

    // Clear state
    firstPageRealtimeData.value = null
    pages.value = []
    globalError.value = null

    log('clear: completed')
  }

  // Return mutable ref for error to match interface
  const errorRef = ref<Error | null>(null)
  watch(
    error,
    (e) => {
      errorRef.value = e
    },
    { immediate: true },
  )

  // === Build thenable return ===
  let resolvePromise: Promise<void>

  if (isSkipped.value) {
    // Skipped - resolve immediately
    resolvePromise = Promise.resolve()
    log('Skipped, resolving immediately')
  } else if (import.meta.server) {
    // SSR
    log('SSR mode', { server, lazy })

    if (!server) {
      // server: false - skip SSR fetch, resolve immediately
      resolvePromise = Promise.resolve()
      log('server: false, skipping SSR (client will fetch)')
    } else {
      // server: true - wait for asyncData (useAsyncData handles the blocking)
      // NOTE: On SSR, we ignore `lazy` and ALWAYS wait for the fetch.
      // The `lazy` option only affects CLIENT navigation behavior.
      resolvePromise = asyncData.then(() => {})
      log('SSR fetch (lazy only affects client)')
    }
  } else {
    // Client
    const isInitialHydration = nuxtApp.isHydrating
    const hasExistingData = asyncData.data.value !== null && asyncData.data.value !== undefined

    if (hasExistingData) {
      // Already have data (from SSR hydration)
      resolvePromise = Promise.resolve()
      log('Hydrated from SSR', { hasData: true })
    } else if (lazy) {
      // lazy: true - resolve immediately, data loads in background
      resolvePromise = Promise.resolve()
      log('lazy: true, loading in background')
    } else if (!server && isInitialHydration) {
      // server: false during initial hydration - don't block
      resolvePromise = Promise.resolve()
      log('server: false during hydration, deferring to subscription')
    } else if (!subscribe) {
      // subscribe: false - use HTTP refresh for data
      resolvePromise = refresh()
      log('subscribe: false, fetching via HTTP')
    } else {
      // Wait for asyncData (which uses subscription on client)
      resolvePromise = asyncData.then(() => {})
      log('Waiting for first page data')
    }
  }

  // Create result data object
  const resultData: UseConvexPaginatedQueryData<TransformedItem> = {
    results,
    status,
    isLoading,
    loadMore,
    error: errorRef,
    refresh,
    reset,
    clear,
  }

  // Create thenable result by extending the promise with result data
  const resultPromise = resolvePromise.then(() => resultData)
  Object.assign(resultPromise, resultData)
  return resultPromise as UseConvexPaginatedQueryReturn<TransformedItem>
}

// ============================================================================
// Optimistic Update Helpers
// ============================================================================

/**
 * Options for insertAtTop helper
 */
export interface InsertAtTopOptions<Query extends PaginatedQueryReference> {
  /** The paginated query function reference */
  paginatedQuery: Query
  /** Optional args to match specific paginated queries. If not provided, updates all. */
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>
  /** The local store from optimistic update context */
  localQueryStore: OptimisticLocalStore
  /** The item to insert at the top of results */
  item: PaginatedQueryItem<Query>
}

/**
 * Insert an item at the top of paginated results.
 *
 * Use this in optimistic updates when you want new items to appear
 * immediately at the top of a feed or list (e.g., chat messages, activity feeds).
 *
 * @example
 * ```ts
 * const sendMessage = useMutation(api.messages.send)
 *   .withOptimisticUpdate((localStore, args) => {
 *     insertAtTop({
 *       paginatedQuery: api.messages.list,
 *       localQueryStore: localStore,
 *       item: {
 *         _id: crypto.randomUUID() as Id<"messages">,
 *         _creationTime: Date.now(),
 *         body: args.body,
 *         author: currentUser._id,
 *       },
 *     })
 *   })
 * ```
 */
export function insertAtTop<Query extends PaginatedQueryReference>(
  options: InsertAtTopOptions<Query>,
): void {
  const { paginatedQuery, argsToMatch, localQueryStore, item } = options

  // Get all queries matching this function
  const allQueries = localQueryStore.getAllQueries(paginatedQuery)

  for (const { args, value } of allQueries) {
    // Skip if args don't match filter
    if (argsToMatch && !argsMatch(args, argsToMatch)) {
      continue
    }

    // Skip if no value yet (query hasn't loaded)
    if (!value) continue

    const paginatedValue = value as PaginationResult<PaginatedQueryItem<Query>>

    // Insert item at the beginning of the page
    const newPage = [item, ...paginatedValue.page]

    localQueryStore.setQuery(paginatedQuery, args, {
      ...paginatedValue,
      page: newPage,
    })
  }
}

/**
 * Options for insertAtPosition helper
 */
export interface InsertAtPositionOptions<Query extends PaginatedQueryReference> {
  /** The paginated query function reference */
  paginatedQuery: Query
  /** Optional args to match specific paginated queries. If not provided, updates all. */
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>
  /** Sort order of the paginated query ('asc' or 'desc') */
  sortOrder: 'asc' | 'desc'
  /** Function to extract the sort key from an item */
  sortKeyFromItem: (item: PaginatedQueryItem<Query>) => Value | Value[]
  /** The local store from optimistic update context */
  localQueryStore: OptimisticLocalStore
  /** The item to insert at the correct sorted position */
  item: PaginatedQueryItem<Query>
}

/**
 * Insert an item at its sorted position in paginated results.
 *
 * Use this when your paginated query is sorted by a specific field
 * and you want the new item to appear in the correct position.
 *
 * @example
 * ```ts
 * const addTask = useMutation(api.tasks.add)
 *   .withOptimisticUpdate((localStore, args) => {
 *     insertAtPosition({
 *       paginatedQuery: api.tasks.listByPriority,
 *       sortOrder: 'desc',
 *       sortKeyFromItem: (task) => task.priority,
 *       localQueryStore: localStore,
 *       item: {
 *         _id: crypto.randomUUID() as Id<"tasks">,
 *         _creationTime: Date.now(),
 *         title: args.title,
 *         priority: args.priority,
 *       },
 *     })
 *   })
 * ```
 */
export function insertAtPosition<Query extends PaginatedQueryReference>(
  options: InsertAtPositionOptions<Query>,
): void {
  const { paginatedQuery, argsToMatch, sortOrder, sortKeyFromItem, localQueryStore, item } = options

  const allQueries = localQueryStore.getAllQueries(paginatedQuery)

  for (const { args, value } of allQueries) {
    if (argsToMatch && !argsMatch(args, argsToMatch)) {
      continue
    }

    if (!value) continue

    const paginatedValue = value as PaginationResult<PaginatedQueryItem<Query>>
    const newItemKey = sortKeyFromItem(item)
    const newItemKeyJson = convexToJson(newItemKey)

    // Find the correct position to insert
    let insertIndex = paginatedValue.page.length

    for (let i = 0; i < paginatedValue.page.length; i++) {
      const existingItem = paginatedValue.page[i]
      if (!existingItem) continue

      const existingKey = sortKeyFromItem(existingItem)
      const existingKeyJson = convexToJson(existingKey)

      const comparison = compareJsonValues(newItemKeyJson, existingKeyJson)

      if (sortOrder === 'desc') {
        // For descending, insert when new item is greater than or equal
        if (comparison >= 0) {
          insertIndex = i
          break
        }
      } else {
        // For ascending, insert when new item is less than or equal
        if (comparison <= 0) {
          insertIndex = i
          break
        }
      }
    }

    const newPage = [
      ...paginatedValue.page.slice(0, insertIndex),
      item,
      ...paginatedValue.page.slice(insertIndex),
    ]

    localQueryStore.setQuery(paginatedQuery, args, {
      ...paginatedValue,
      page: newPage,
    })
  }
}

/**
 * Options for insertAtBottomIfLoaded helper
 */
export interface InsertAtBottomIfLoadedOptions<Query extends PaginatedQueryReference> {
  /** The paginated query function reference */
  paginatedQuery: Query
  /** Optional args to match specific paginated queries. If not provided, updates all. */
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>
  /** The local store from optimistic update context */
  localQueryStore: OptimisticLocalStore
  /** The item to insert at the bottom of results */
  item: PaginatedQueryItem<Query>
}

/**
 * Insert an item at the bottom of paginated results, but only if all pages are loaded.
 *
 * Use this when you have ascending-sorted data and want new items to appear
 * at the end. The item will only be inserted if `isDone` is true (all pages loaded),
 * otherwise the server will include it when more pages are fetched.
 *
 * @example
 * ```ts
 * const addOldMessage = useMutation(api.messages.add)
 *   .withOptimisticUpdate((localStore, args) => {
 *     insertAtBottomIfLoaded({
 *       paginatedQuery: api.messages.listOldestFirst,
 *       localQueryStore: localStore,
 *       item: {
 *         _id: crypto.randomUUID() as Id<"messages">,
 *         _creationTime: Date.now(),
 *         body: args.body,
 *       },
 *     })
 *   })
 * ```
 */
export function insertAtBottomIfLoaded<Query extends PaginatedQueryReference>(
  options: InsertAtBottomIfLoadedOptions<Query>,
): void {
  const { paginatedQuery, argsToMatch, localQueryStore, item } = options

  const allQueries = localQueryStore.getAllQueries(paginatedQuery)

  for (const { args, value } of allQueries) {
    if (argsToMatch && !argsMatch(args, argsToMatch)) {
      continue
    }

    if (!value) continue

    const paginatedValue = value as PaginationResult<PaginatedQueryItem<Query>>

    // Only insert if all pages are loaded (isDone is true)
    if (!paginatedValue.isDone) {
      continue
    }

    const newPage = [...paginatedValue.page, item]

    localQueryStore.setQuery(paginatedQuery, args, {
      ...paginatedValue,
      page: newPage,
    })
  }
}

/**
 * Options for optimisticallyUpdateValueInPaginatedQuery helper
 */
export interface UpdateInPaginatedQueryOptions<Query extends PaginatedQueryReference> {
  /** The paginated query function reference */
  paginatedQuery: Query
  /** Optional args to match specific paginated queries. If not provided, updates all. */
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>
  /** The local store from optimistic update context */
  localQueryStore: OptimisticLocalStore
  /** Function to update matching items. Return the item unchanged if no update needed. */
  updateValue: (currentValue: PaginatedQueryItem<Query>) => PaginatedQueryItem<Query>
}

/**
 * Update items in paginated results.
 *
 * Use this to optimistically update existing items in paginated queries,
 * such as editing, toggling status, or marking as read.
 *
 * @example
 * ```ts
 * const toggleComplete = useMutation(api.tasks.toggleComplete)
 *   .withOptimisticUpdate((localStore, args) => {
 *     optimisticallyUpdateValueInPaginatedQuery({
 *       paginatedQuery: api.tasks.list,
 *       localQueryStore: localStore,
 *       updateValue: (task) => {
 *         if (task._id === args.taskId) {
 *           return { ...task, completed: !task.completed }
 *         }
 *         return task
 *       },
 *     })
 *   })
 * ```
 */
export function optimisticallyUpdateValueInPaginatedQuery<Query extends PaginatedQueryReference>(
  options: UpdateInPaginatedQueryOptions<Query>,
): void {
  const { paginatedQuery, argsToMatch, localQueryStore, updateValue } = options

  const allQueries = localQueryStore.getAllQueries(paginatedQuery)

  for (const { args, value } of allQueries) {
    if (argsToMatch && !argsMatch(args, argsToMatch)) {
      continue
    }

    if (!value) continue

    const paginatedValue = value as PaginationResult<PaginatedQueryItem<Query>>

    const newPage = paginatedValue.page.map(updateValue)

    localQueryStore.setQuery(paginatedQuery, args, {
      ...paginatedValue,
      page: newPage,
    })
  }
}

/**
 * Options for deleteFromPaginatedQuery helper
 */
export interface DeleteFromPaginatedQueryOptions<Query extends PaginatedQueryReference> {
  /** The paginated query function reference */
  paginatedQuery: Query
  /** Optional args to match specific paginated queries. If not provided, updates all. */
  argsToMatch?: Partial<PaginatedQueryArgs<Query>>
  /** The local store from optimistic update context */
  localQueryStore: OptimisticLocalStore
  /** Predicate to identify items to delete. Return true to delete the item. */
  shouldDelete: (item: PaginatedQueryItem<Query>) => boolean
}

/**
 * Delete items from paginated results.
 *
 * Use this to optimistically remove items from paginated queries.
 *
 * @example
 * ```ts
 * const deleteTask = useMutation(api.tasks.delete)
 *   .withOptimisticUpdate((localStore, args) => {
 *     deleteFromPaginatedQuery({
 *       paginatedQuery: api.tasks.list,
 *       localQueryStore: localStore,
 *       shouldDelete: (task) => task._id === args.taskId,
 *     })
 *   })
 * ```
 */
export function deleteFromPaginatedQuery<Query extends PaginatedQueryReference>(
  options: DeleteFromPaginatedQueryOptions<Query>,
): void {
  const { paginatedQuery, argsToMatch, localQueryStore, shouldDelete } = options

  const allQueries = localQueryStore.getAllQueries(paginatedQuery)

  for (const { args, value } of allQueries) {
    if (argsToMatch && !argsMatch(args, argsToMatch)) {
      continue
    }

    if (!value) continue

    const paginatedValue = value as PaginationResult<PaginatedQueryItem<Query>>

    const newPage = paginatedValue.page.filter((item) => !shouldDelete(item))

    localQueryStore.setQuery(paginatedQuery, args, {
      ...paginatedValue,
      page: newPage,
    })
  }
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

/**
 * Check if query args match the filter args
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function argsMatch(queryArgs: Record<string, any>, filterArgs: Record<string, any>): boolean {
  for (const key of Object.keys(filterArgs)) {
    // Skip paginationOpts - we don't match on those
    if (key === 'paginationOpts') continue

    const filterValue = filterArgs[key]
    const queryValue = queryArgs[key]

    // Deep equality check using JSON
    if (JSON.stringify(filterValue) !== JSON.stringify(queryValue)) {
      return false
    }
  }
  return true
}

/**
 * Compare two JSON values for sorting.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compareJsonValues(a: any, b: any): number {
  // Handle arrays (multi-key sort)
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const comparison = compareJsonValues(a[i], b[i])
      if (comparison !== 0) return comparison
    }
    return 0
  }

  // Handle null/undefined
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1

  // Handle numbers
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }

  // Handle strings
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b)
  }

  // Handle booleans
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return (a ? 1 : 0) - (b ? 1 : 0)
  }

  // Handle BigInt ($integer format from convexToJson)
  if (typeof a === 'object' && a.$integer && typeof b === 'object' && b.$integer) {
    return Number(BigInt(a.$integer) - BigInt(b.$integer))
  }

  // Fallback to string comparison
  return String(a).localeCompare(String(b))
}
