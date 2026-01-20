import type { ConvexClient } from 'convex/browser'
import type { FunctionArgs, PaginationResult } from 'convex/server'

import { useNuxtApp, useRuntimeConfig, useRequestEvent, useAsyncData } from '#imports'
import {
  ref,
  computed,
  watch,
  onUnmounted,
  toValue,
  isRef,
  isReactive,
  type ComputedRef,
  type Ref,
  shallowRef,
} from 'vue'

import {
  getFunctionName,
  hashArgs,
  getQueryKey,
  fetchAuthToken,
  registerSubscription,
  hasSubscription,
  releaseSubscription,
  getSubscription,
} from '../utils/convex-cache'
import { generatePaginationId } from '../utils/shared-helpers'
import { executeQueryHttp, executeQueryViaSubscription } from './useConvexQuery'
import type { PaginatedQueryReference, PaginatedQueryArgs, PaginatedQueryItem } from './optimistic-updates'

// Re-export optimistic update helpers and types for backwards compatibility
export {
  insertAtTop,
  insertAtPosition,
  insertAtBottomIfLoaded,
  optimisticallyUpdateValueInPaginatedQuery,
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
   * @default true (configurable via nuxt.config convex.defaults.server)
   */
  server?: boolean

  /**
   * Don't block when awaited.
   * Query runs in background, shows LoadingFirstPage state.
   * @default false (configurable via nuxt.config convex.defaults.lazy)
   */
  lazy?: boolean

  /**
   * Subscribe to real-time updates via WebSocket.
   * Set to false to skip WebSocket subscriptions and only use SSR data.
   * Use refresh() to manually re-fetch when needed.
   * @default true (configurable via nuxt.config convex.defaults.subscribe)
   */
  subscribe?: boolean

  /**
   * Mark this query as public (no authentication needed).
   * When true, skips all auth token checks during SSR.
   * @default false (configurable via nuxt.config convex.defaults.public)
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

// Internal page state
interface PageState<T> {
  paginationOpts: { numItems: number; cursor: string | null; id: number }
  result: PaginationResult<T> | undefined
  error: Error | null
  pending: boolean
  unsubscribe: (() => void) | null
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

  // Resolve options from: per-call options → global defaults → built-in defaults
  const defaults = config.public.convex?.defaults as { server?: boolean; lazy?: boolean; subscribe?: boolean; public?: boolean } | undefined
  const initialNumItems = options?.initialNumItems ?? 10
  const server = options?.server ?? defaults?.server ?? true // SSR enabled by default
  const lazy = options?.lazy ?? defaults?.lazy ?? false
  const subscribe = options?.subscribe ?? defaults?.subscribe ?? true
  const isPublic = options?.public ?? defaults?.public ?? false

  // Get function name (needed for cache key)
  const fnName = getFunctionName(query)

  // Get reactive args value
  const getArgs = (): Args => toValue(args) ?? ({} as Args)

  // Dev-mode warning for reactive() args (won't trigger re-fetches)
  if (import.meta.dev && args !== undefined && !isRef(args) && isReactive(args)) {
    console.warn(
      `[useConvexPaginatedQuery] Detected reactive() object passed as args for "${fnName}". ` +
        `Changes to reactive objects will NOT trigger query re-fetches. ` +
        `Use ref() or computed() instead.`,
    )
  }

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
  const currentPaginationId = ref(generatePaginationId())
  // pages ref holds ADDITIONAL pages (loaded via loadMore), NOT the first page
  // First page comes from asyncData (for SSR) + firstPageRealtimeData (for real-time updates)
  const pages = shallowRef<PageState<Item>[]>([])
  const globalError = ref<Error | null>(null)

  // Real-time updates for the first page (overrides asyncData when available)
  const firstPageRealtimeData = shallowRef<PaginationResult<Item> | null>(null)
  let firstPageUnsubscribe: (() => void) | null = null

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
    const currentArgs = getArgs()
    if (currentArgs === 'skip') return `convex-paginated:skip:${fnName}`
    // Use stable pagination options (without the changing id)
    const stablePaginationOpts = { numItems: initialNumItems, cursor: null }
    return `convex-paginated:${getQueryKey(query, { ...currentArgs, paginationOpts: stablePaginationOpts })}`
  })

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
    const siteUrl = config.public.convex?.siteUrl
    const authRoute = config.public.convex?.authRoute as string | undefined

    const fullArgs = {
      ...currentArgs,
      paginationOpts,
    }

    // Get auth token using shared helper (only on server)
    let authToken: string | undefined
    if (import.meta.server) {
      authToken = await fetchAuthToken({
        isPublic,
        cookieHeader,
        siteUrl,
        authRoute,
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
    const subscriptionKey = `paginated:${cacheKey.value}:page:${pageIndex}`

    if (hasSubscription(nuxtApp, subscriptionKey)) {
      // Join existing subscription - increment ref count and set unsubscribe
      const existingEntry = getSubscription(nuxtApp, subscriptionKey)
      if (existingEntry) {
        existingEntry.refCount++
        page.unsubscribe = () => releaseSubscription(nuxtApp, subscriptionKey)
      }
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

    try {
      const rawUnsubscribe = convex.onUpdate(
        query,
        fullArgs as FunctionArgs<Query>,
        (result: PaginationResult<Item>) => {
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
        },
        (err: Error) => {
          const currentPage = pages.value[pageIndex]
          if (!currentPage) return
          const newPages = [...pages.value]
          newPages[pageIndex] = {
            ...currentPage,
            pending: false,
            error: err,
          }
          pages.value = newPages
        },
      )
      // Register subscription in cache and wrap unsubscribe to go through ref-counting
      registerSubscription(nuxtApp, subscriptionKey, rawUnsubscribe)
      page.unsubscribe = () => releaseSubscription(nuxtApp, subscriptionKey)
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

            // Start subscription for real-time updates
            startPageSubscription(newPageIndex)
          })
          .catch((e) => {
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
  // NOTE: Nuxt's useAsyncData has different semantics than what we want:
  // - server: false → pending=false on SSR (but we want LoadingFirstPage, data will load on client)
  // - lazy: true on client nav → may show pending=false (but we want LoadingFirstPage until data arrives)
  const status = computed((): PaginationStatus => {
    if (isSkipped.value) return 'Exhausted'

    // When server: false, report LoadingFirstPage during SSR
    // Nuxt's asyncData doesn't set pending=true when server:false, but we need
    // consistent hydration (client will also be LoadingFirstPage until data arrives)
    if (!server && import.meta.server) {
      return 'LoadingFirstPage'
    }

    // First page status from real-time data or asyncData
    const firstPageData = firstPageRealtimeData.value ?? asyncData.data.value

    // When server: false on client, show loading until data arrives
    if (!server && import.meta.client && !firstPageData) {
      return 'LoadingFirstPage'
    }

    // For lazy: true on client, show LoadingFirstPage until data arrives
    // This handles the case where navigation is instant but data is still loading
    if (lazy && import.meta.client && !firstPageData) {
      return 'LoadingFirstPage'
    }

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

  // Computed error - checks all error sources
  // Note: asyncData is referenced here but defined below - this works because computed is lazily evaluated
  const error = computed((): Error | null => {
    if (globalError.value) return globalError.value

    // Check asyncData error (first page fetch/subscription errors)
    const asyncError = asyncData.error.value
    if (asyncError) {
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
    cacheKey.value,
    async (): Promise<PaginationResult<Item> | null> => {
      if (isSkipped.value) return null

      // On client-side navigation, use WebSocket subscription
      if (import.meta.client) {
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

      // On server, use HTTP fetch
      return await fetchPage(initialPaginationOpts.value)
    },
    {
      server,
      lazy,
      dedupe: 'defer', // Use cached data if same key exists, avoids "different handler" warning
      watch: [cacheKey], // Re-fetch when args change (cacheKey includes hashed args)
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
    const subscriptionKey = `paginated:${cacheKey.value}:firstPage`

    if (hasSubscription(nuxtApp, subscriptionKey)) {
      // Join existing subscription - increment ref count and set unsubscribe
      const existingEntry = getSubscription(nuxtApp, subscriptionKey)
      if (existingEntry) {
        existingEntry.refCount++
        firstPageUnsubscribe = () => releaseSubscription(nuxtApp, subscriptionKey)
      }
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
      paginationOpts: initialPaginationOpts.value,
    }

    try {
      const rawUnsubscribe = convex.onUpdate(
        query,
        fullArgs as FunctionArgs<Query>,
        (result: PaginationResult<Item>) => {
          firstPageRealtimeData.value = result
        },
        (err: Error) => {
          // Update asyncData error state - match Nuxt's expected type
          asyncData.error.value = err as unknown as typeof asyncData.error.value
        },
      )
      // Register subscription in cache and wrap unsubscribe to go through ref-counting
      registerSubscription(nuxtApp, subscriptionKey, rawUnsubscribe)
      firstPageUnsubscribe = () => releaseSubscription(nuxtApp, subscriptionKey)
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
      if (!subscribe) {
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
            // Clean up all subscriptions
            cleanupAllSubscriptions()
            firstPageRealtimeData.value = null

            if (newArgs === 'skip') {
              pages.value = []
              globalError.value = null
            } else {
              // Reset pagination
              currentPaginationId.value = generatePaginationId()
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
      cleanupAllSubscriptions()
    })
  }

  // === Methods ===

  // Refresh: Re-fetch all currently loaded pages via HTTP
  async function refresh(): Promise<void> {
    if (isSkipped.value) {
      return
    }

    try {
      // Re-fetch first page
      const firstPageResult = await fetchPage(initialPaginationOpts.value)
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
      }

      globalError.value = null
    } catch (e) {
      globalError.value = e instanceof Error ? e : new Error(String(e))
    }
  }

  // Reset: Clear all pages and restart from the first page
  async function reset(): Promise<void> {
    // Clean up subscriptions
    if (import.meta.client) {
      cleanupAllSubscriptions()
    }

    // Reset state
    firstPageRealtimeData.value = null
    currentPaginationId.value = generatePaginationId()
    pages.value = []
    globalError.value = null

    // Re-fetch first page via asyncData refresh
    await asyncData.refresh()

    // Restart subscriptions
    if (import.meta.client && subscribe && !isSkipped.value) {
      startFirstPageSubscription()
    }
  }

  // Clear: Remove all data and subscriptions without re-fetching
  function clear(): void {
    // Clean up subscriptions
    if (import.meta.client) {
      cleanupAllSubscriptions()
    }

    // Clear state
    firstPageRealtimeData.value = null
    // Also clear asyncData to prevent stale data on re-mount
    asyncData.data.value = null
    asyncData.error.value = undefined
    pages.value = []
    globalError.value = null
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
  } else if (import.meta.server) {
    // SSR
    if (!server) {
      // server: false - skip SSR fetch, resolve immediately
      resolvePromise = Promise.resolve()
    } else {
      // server: true - wait for asyncData (useAsyncData handles the blocking)
      // NOTE: On SSR, we ignore `lazy` and ALWAYS wait for the fetch.
      // The `lazy` option only affects CLIENT navigation behavior.
      resolvePromise = asyncData.then(() => {})
    }
  } else {
    // Client
    const isInitialHydration = nuxtApp.isHydrating
    const hasExistingData = asyncData.data.value !== null && asyncData.data.value !== undefined

    if (hasExistingData) {
      // Already have data (from SSR hydration)
      resolvePromise = Promise.resolve()
    } else if (lazy) {
      // lazy: true - resolve immediately, data loads in background
      resolvePromise = Promise.resolve()
    } else if (!server && isInitialHydration) {
      // server: false during initial hydration - don't block
      resolvePromise = Promise.resolve()
    } else if (!subscribe) {
      // subscribe: false - use HTTP refresh for data
      resolvePromise = refresh()
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
