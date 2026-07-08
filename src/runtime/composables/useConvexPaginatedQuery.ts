import type { ConvexClient } from 'convex/browser'
import type { FunctionArgs, PaginationResult } from 'convex/server'
import {
  ref,
  computed,
  getCurrentScope,
  onScopeDispose,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
  shallowRef,
  watch,
} from 'vue'

import { useNuxtApp, useRequestEvent, useAsyncData, useState } from '#imports'

import { handleUnauthorizedAuthFailure } from '../utils/auth-unauthorized'
import { assertConvexComposableScope } from '../utils/composable-scope'
import {
  getFunctionName,
  hashArgs,
  getQueryKey,
  fetchAuthToken,
  waitForQueryBridgeData,
  type QuerySubscriptionBridge,
} from '../utils/convex-cache'
import {
  acquirePaginatedQuerySubscription,
  createPaginatedQueryBridgeSync,
  type PaginatedQueryBridgeSync,
} from '../utils/paginated-query-bridge'
import {
  commitPaginatedPageError,
  commitPaginatedPageResult,
  createPendingPaginatedPage,
  getLastLoadedPaginatedResult,
  type PaginatedPageState,
} from '../utils/paginated-query-pages'
import { isConvexArgsSkipped, normalizeConvexArgs } from '../utils/query-args'
import { executeQueryHttp } from '../utils/query-execution'
import { createQueryExecutionGate, type ConvexQueryAuthMode } from '../utils/query-execution-gate'
import {
  computePaginatedQueryStale,
  computePaginatedQueryStatus,
  type PaginatedFirstPageState,
  type PaginatedNextPageState,
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
  initialNumItems?: number

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

  /**
   * Auth transport mode for this query. Public queries can opt out with "none".
   * @default convex.defaults.auth
   */
  auth?: ConvexQueryAuthMode
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

  const defaults = convexConfig.defaults
  const initialNumItems = options?.initialNumItems ?? 10
  const server = options?.server ?? defaults?.server ?? true // SSR enabled by default
  const subscribe = options?.subscribe ?? defaults?.subscribe ?? true
  const authMode = options?.auth ?? defaults?.auth ?? 'auto'
  const keepPreviousData = options?.keepPreviousData ?? false
  const cleanupScope = import.meta.client ? getCurrentScope() : undefined
  assertConvexComposableScope('useConvexPaginatedQuery', import.meta.client, cleanupScope)
  const subscribeRealtime = subscribe

  const fnName = getFunctionName(query)

  const normalizedArgs = computed((): Args => {
    return normalizeConvexArgs(args) as Args
  })
  const getArgs = (): Args => normalizedArgs.value

  const isSkipped = computed(() => isConvexArgsSkipped(normalizedArgs.value))
  const argsHash = computed(() => hashArgs(normalizedArgs.value))

  const event = import.meta.server ? useRequestEvent() : null
  const cookieHeader = event?.headers.get('cookie') || ''

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
      subscribe: subscribeRealtime,
    }),
  )

  const currentPaginationId = ref(generatePaginationId())
  const pages = shallowRef<PaginatedPageState<Item>[]>([])
  const globalError = ref<Error | null>(null)
  const isManualRefreshPending = ref(false)

  const firstPageRealtimeData = shallowRef<PaginationResult<Item> | null>(null)
  let firstPageUnsubscribe: (() => void) | null = null
  let firstPageSubscriptionKey: string | null = null
  let firstPageBridge: QuerySubscriptionBridge | null = null
  let bridgeSync: PaginatedQueryBridgeSync | null = null

  const initialPaginationOpts = computed(() => ({
    numItems: initialNumItems,
    cursor: null as string | null,
    id: currentPaginationId.value,
  }))

  // IMPORTANT: Do NOT include pagination ID in cache key - it changes between server/client
  // causing hydration mismatches. Only include args and initial numItems.
  const cacheKey = computed((): string => {
    if (executionGate.value.resolveAsIdle) {
      return `convex-paginated:idle:${fnName}`
    }
    const currentArgs = getArgs()
    if (currentArgs == null || currentArgs === 'skip') return `convex-paginated:idle:${fnName}`
    const stablePaginationOpts = { numItems: initialNumItems, cursor: null }
    return `convex-paginated:${getQueryKey(query, { ...currentArgs, paginationOpts: stablePaginationOpts })}`
  })

  const getStablePaginatedSubscriptionKey = (paginationOpts: StablePaginationOpts): string => {
    if (executionGate.value.resolveAsIdle) {
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

  async function fetchPage(paginationOpts: {
    numItems: number
    cursor: string | null
    id: number
  }): Promise<PaginationResult<Item> | null> {
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
    if (authMode !== 'none' && !authToken) {
      return null
    }

    return executeQueryHttp<PaginationResult<Item>>(convexUrl, functionPath, fullArgs, authToken)
  }

  const loadMore = (numItems: number) => {
    if (executionGate.value.resolveAsIdle) return

    const lastPageResult = getLastLoadedPaginatedResult(
      firstPageRealtimeData.value ?? asyncData.data.value,
      pages.value,
    )

    if (!lastPageResult || lastPageResult.isDone) return

    const newPage = createPendingPaginatedPage<Item>({
      numItems,
      cursor: lastPageResult.continueCursor,
      id: currentPaginationId.value,
    })

    pages.value = [...pages.value, newPage]

    const newPageIndex = pages.value.length - 1
    const requestPaginationId = currentPaginationId.value
    const requestArgsHash = argsHash.value

    const getCurrentPageForCommit = (): PaginatedPageState<Item> | null => {
      if (currentPaginationId.value !== requestPaginationId || argsHash.value !== requestArgsHash) {
        return null
      }
      const currentPage = pages.value[newPageIndex]
      if (!currentPage || currentPage.paginationOpts.id !== requestPaginationId) {
        return null
      }
      return currentPage
    }

    if (import.meta.client && executionGate.value.setupLiveSubscription && nuxtApp.$convex) {
      startPageSubscription(newPageIndex)
      return
    }

    void fetchPage(newPage.paginationOpts)
      .then((result) => {
        const currentPage = getCurrentPageForCommit()
        if (!currentPage) return
        if (result) {
          pages.value = commitPaginatedPageResult(pages.value, newPageIndex, result)
        }
      })
      .catch((e) => {
        void handleUnauthorizedAuthFailure({ error: e, source: 'query', functionName: fnName })
        const currentPage = getCurrentPageForCommit()
        if (!currentPage) return
        pages.value = commitPaginatedPageError(pages.value, newPageIndex, e)
      })
  }

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
    firstPageRealtimeData.value === null &&
    lastSettledArgsHash.value !== null &&
    argsHash.value !== lastSettledArgsHash.value &&
    asyncData.status.value === 'pending'

  const status = computed((): PaginatedQueryStatus => {
    const isUsingPreviousData = isPreviousDataForCurrentArgs()
    const firstPageData = isUsingPreviousData
      ? null
      : (firstPageRealtimeData.value ?? asyncData.data.value)
    const lastPage = pages.value.length > 0 ? pages.value[pages.value.length - 1] : null
    const firstPage: PaginatedFirstPageState = firstPageData
      ? { state: 'ready', isDone: firstPageData.isDone }
      : { state: 'loading' }
    const nextPage: PaginatedNextPageState = lastPage?.pending
      ? { state: 'loading' }
      : lastPage?.result?.isDone
        ? { state: 'exhausted' }
        : { state: 'idle' }
    const isIdle =
      executionGate.value.pendingReason === 'explicit-skip' ||
      executionGate.value.pendingReason === 'auth-signed-out'

    return computePaginatedQueryStatus({
      disabled: isIdle,
      refresh: isManualRefreshPending.value ? 'pending' : 'idle',
      hasError:
        globalError.value != null ||
        asyncData.error.value != null ||
        pages.value.some((page) => page.error != null),
      firstPage,
      nextPage,
    })
  })

  const rawResults = computed((): Item[] => {
    if (executionGate.value.resolveAsIdle) return []
    if (isPreviousDataForCurrentArgs()) return []

    const allItems: Item[] = []

    const firstPageData = firstPageRealtimeData.value ?? asyncData.data.value
    if (firstPageData) {
      allItems.push(...firstPageData.page)
    }

    for (const page of pages.value) {
      if (page?.result) {
        allItems.push(...page.result.page)
      }
    }

    return allItems
  })

  const transformedResults = computed((): TransformedItem[] => {
    const raw = rawResults.value
    if (raw.length > 0) {
      return applyTransform(raw)
    }
    const initialData = resolveInitialData()
    if (status.value === 'loading-first-page' && initialData) {
      return applyTransform(initialData)
    }
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

  const isLoading = computed(() => {
    const s = status.value
    return s === 'loading-first-page' || s === 'loading-more'
  })
  const hasNextPage = computed(() => status.value === 'ready')

  const error = computed((): Error | null => {
    if (globalError.value) return globalError.value

    const asyncError = asyncData.error.value
    if (asyncError != null) {
      return asyncError instanceof Error ? asyncError : new Error(String(asyncError))
    }

    for (const page of pages.value) {
      if (page.error) return page.error
    }
    return null
  })

  const asyncData = useAsyncData(
    cacheKey,
    async (): Promise<PaginationResult<Item> | null> => {
      if (executionGate.value.resolveAsIdle) return null

      try {
        // On client-side navigation, use WebSocket subscription in live mode only
        if (import.meta.client && subscribeRealtime) {
          if (executionGate.value.waitForAuth) {
            return null
          }

          if (nuxtApp.$convex) {
            const bridge = acquireFirstPageSubscriptionBridge()
            return await waitForQueryBridgeData<PaginationResult<Item>>(bridge, {
              timeoutMessage:
                '[useConvexPaginatedQuery] Timed out waiting for first page subscription result after 10000ms',
            })
          }
        }

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
  const asyncDataError = asyncData.error as unknown as Ref<Error | null>
  bridgeSync = createPaginatedQueryBridgeSync({
    firstPageRealtimeData,
    asyncDataError,
    pages,
  })

  function cleanupFirstPageSubscription() {
    bridgeSync?.cleanupFirstPage()

    if (firstPageUnsubscribe) {
      firstPageUnsubscribe()
      firstPageUnsubscribe = null
    }
    firstPageSubscriptionKey = null
    firstPageBridge = null
  }

  function acquireFirstPageSubscriptionBridge(): QuerySubscriptionBridge {
    const subscriptionKey = getStablePaginatedSubscriptionKey({
      numItems: initialPaginationOpts.value.numItems,
      cursor: initialPaginationOpts.value.cursor,
    })

    if (firstPageSubscriptionKey === subscriptionKey && firstPageBridge) {
      bridgeSync?.attachFirstPage(firstPageBridge)
      return firstPageBridge
    }

    cleanupFirstPageSubscription()

    const convex = nuxtApp.$convex as ConvexClient | undefined
    if (!convex) {
      throw new Error('[useConvexPaginatedQuery] Convex client not available')
    }

    const currentArgs = getArgs() as PaginatedQueryArgs<Query>
    const fullArgs = {
      ...currentArgs,
      paginationOpts: initialPaginationOpts.value,
    }

    const subscription = acquirePaginatedQuerySubscription<Query, Item>({
      nuxtApp,
      subscriptionKey,
      convex,
      query,
      args: fullArgs as FunctionArgs<Query>,
      functionName: fnName,
      authMode,
    })

    firstPageSubscriptionKey = subscriptionKey
    firstPageBridge = subscription.bridge
    firstPageUnsubscribe = () => {
      bridgeSync?.cleanupFirstPage()
      subscription.release()
      firstPageSubscriptionKey = null
      firstPageBridge = null
    }
    bridgeSync?.attachFirstPage(subscription.bridge)

    return subscription.bridge
  }

  function startPageSubscription(pageIndex: number) {
    if (import.meta.server) return
    if (!executionGate.value.setupLiveSubscription) return

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

    const subscriptionKey = getStablePaginatedSubscriptionKey({
      numItems: page.paginationOpts.numItems,
      cursor: page.paginationOpts.cursor,
    })

    if (page.unsubscribe) {
      page.unsubscribe()
    }

    const currentArgs = getArgs() as PaginatedQueryArgs<Query>
    const fullArgs = {
      ...currentArgs,
      paginationOpts: page.paginationOpts,
    }

    try {
      const subscription = acquirePaginatedQuerySubscription<Query, Item>({
        nuxtApp,
        subscriptionKey,
        convex,
        query,
        args: fullArgs as FunctionArgs<Query>,
        functionName: fnName,
        authMode,
      })
      page.unsubscribe = () => {
        bridgeSync?.cleanupPage(pageIndex)
        void subscription.release()
      }
      bridgeSync?.attachPage(pageIndex, subscription.bridge)
    } catch (e) {
      if (import.meta.dev) {
        console.warn('[useConvexPaginatedQuery] Page subscription failed:', e)
      }
      page.error = e instanceof Error ? e : new Error(String(e))
    }
  }

  watch(
    [() => status.value, () => transformedResults.value],
    ([nextStatus, nextResults]) => {
      if (executionGate.value.resolveAsIdle) return
      if (nextStatus === 'loading-first-page') return
      lastSettledResults.value = nextResults as TransformedItem[]
      lastSettledArgsHash.value = argsHash.value
    },
    { immediate: true },
  )

  function startFirstPageSubscription() {
    if (import.meta.server) return
    if (!executionGate.value.setupLiveSubscription) return

    const convex = nuxtApp.$convex as ConvexClient | undefined
    if (!convex) {
      if (import.meta.dev) {
        console.warn(
          '[useConvexPaginatedQuery] Convex client not available. Real-time updates disabled.',
        )
      }
      return
    }

    if (executionGate.value.resolveAsIdle) return

    try {
      const bridge = acquireFirstPageSubscriptionBridge()
      bridgeSync?.attachFirstPage(bridge)
    } catch (e) {
      if (import.meta.dev) {
        console.warn('[useConvexPaginatedQuery] First page subscription failed:', e)
      }
      globalError.value = e instanceof Error ? e : new Error(String(e))
    }
  }

  function cleanupAllSubscriptions() {
    cleanupFirstPageSubscription()
    bridgeSync?.cleanupAllPages()

    for (let i = 0; i < pages.value.length; i++) {
      const page = pages.value[i]
      if (page?.unsubscribe) {
        page.unsubscribe()
      }
    }
  }

  if (import.meta.client) {
    const startAllSubscriptions = () => {
      if (!executionGate.value.setupLiveSubscription) {
        return
      }
      startFirstPageSubscription()

      for (let i = 0; i < pages.value.length; i++) {
        startPageSubscription(i)
      }
    }

    if (executionGate.value.setupLiveSubscription) {
      startAllSubscriptions()
    }

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

        cleanupAllSubscriptions()
        firstPageRealtimeData.value = null

        if (executionGate.value.resolveAsIdle) {
          pages.value = []
          globalError.value = null
          return
        }

        currentPaginationId.value = generatePaginationId()
        pages.value = []
        globalError.value = null

        if (subscribeRealtime) {
          startAllSubscriptions()
        }
        await asyncData.refresh()
      },
    )

    if (cleanupScope) {
      onScopeDispose(() => {
        cleanupAllSubscriptions()
      })
    }
  }

  async function refresh(): Promise<void> {
    if (executionGate.value.resolveAsIdle) {
      return
    }

    isManualRefreshPending.value = true
    globalError.value = null
    asyncDataError.value = null

    const refreshPaginationId = currentPaginationId.value
    const loadedPages = [...pages.value]

    try {
      const firstPageResult = await fetchPage(initialPaginationOpts.value)
      if (!firstPageResult) return

      const pageResults = await Promise.all(
        loadedPages.map((page) => (page ? fetchPage(page.paginationOpts) : Promise.resolve(null))),
      )
      let refreshedPages = [...loadedPages]
      for (let i = 0; i < pageResults.length; i++) {
        const pageResult = pageResults[i]
        if (!pageResult) continue
        refreshedPages = commitPaginatedPageResult(refreshedPages, i, pageResult)
      }

      if (currentPaginationId.value === refreshPaginationId && !executionGate.value.resolveAsIdle) {
        firstPageRealtimeData.value = firstPageResult
        pages.value = refreshedPages
        asyncDataError.value = null
        globalError.value = null
      }
    } catch (e) {
      globalError.value = e instanceof Error ? e : new Error(String(e))
    } finally {
      isManualRefreshPending.value = false
    }
  }

  async function reset(): Promise<void> {
    isManualRefreshPending.value = true

    if (import.meta.client) {
      cleanupAllSubscriptions()
    }

    firstPageRealtimeData.value = null
    currentPaginationId.value = generatePaginationId()
    pages.value = []
    globalError.value = null
    asyncDataError.value = null

    try {
      await asyncData.refresh()
    } finally {
      isManualRefreshPending.value = false
    }

    if (import.meta.client && executionGate.value.setupLiveSubscription) {
      startFirstPageSubscription()
    }
  }

  let resolvePromise: Promise<void>

  if (executionGate.value.resolveAsIdle) {
    resolvePromise = Promise.resolve()
  } else if (import.meta.server) {
    if (!server) {
      resolvePromise = Promise.resolve()
    } else {
      // NOTE: On SSR, immediate resolve is ignored and we always wait for fetch.
      resolvePromise = asyncData.then(() => {})
    }
  } else {
    const isInitialHydration = nuxtApp.isHydrating
    const hasExistingData = asyncData.data.value !== null && asyncData.data.value !== undefined

    if (hasExistingData) {
      resolvePromise = Promise.resolve()
    } else if (resolveImmediately) {
      resolvePromise = Promise.resolve()
    } else if (!server && isInitialHydration) {
      resolvePromise = Promise.resolve()
    } else if (!subscribeRealtime) {
      resolvePromise = asyncData.then(() => {})
    } else {
      resolvePromise = asyncData.then(() => {})
    }
  }

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
