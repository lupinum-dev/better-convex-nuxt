import type { FunctionArgs, PaginationResult } from 'convex/server'
import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  shallowRef,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'

import { handleUnauthorizedAuthFailure } from '../utils/auth-unauthorized'
import { assertConvexComposableScope } from '../utils/composable-scope'
import { getFunctionName, getQueryKey, hashArgs } from '../utils/convex-cache'
import { deepUnref } from '../utils/deep-unref'
import { getConvexRuntimeConfig } from '../utils/runtime-config'
import { generatePaginationId } from '../utils/shared-helpers'
import type {
  PaginatedQueryReference,
  PaginatedQueryArgs,
  PaginatedQueryItem,
} from './optimistic-updates'
import {
  createLiveQueryResource,
  executeLiveQuery,
  startSharedQuerySubscription,
  type SharedQuerySubscriptionHandle,
} from './internal/live-query-resource'

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

export type PaginatedQueryStatus =
  | 'skipped'
  | 'loading-first-page'
  | 'ready'
  | 'loading-more'
  | 'exhausted'
  | 'error'

export interface UseConvexPaginatedQueryOptions<Item = unknown, TransformedItem = Item> {
  initialNumItems: number
  /** @default true — run first page server-side during SSR */
  server?: boolean
  /** @default true — keep a live WebSocket subscription after initial load */
  subscribe?: boolean
  /** Fallback items while the first page is loading */
  default?: () => Item[]
  /** Transform raw items before exposing via `results` */
  transform?: (results: Item[]) => TransformedItem[]
  /**
   * When `false` (default), `useConvexPaginatedQuery` returns a Promise that resolves
   * once the first page arrives. When `true`, returns synchronously.
   * @default false
   */
  lazy?: boolean
  /** Preserve previous results while a new first page is loading */
  keepPreviousData?: boolean
  /**
   * Recursively unref Vue refs inside args before sending to Convex.
   * @default false
   */
  deepUnrefArgs?: boolean
}

export interface UseConvexPaginatedQueryData<Item> {
  results: ComputedRef<Item[]>
  status: ComputedRef<PaginatedQueryStatus>
  isLoading: ComputedRef<boolean>
  isExhausted: ComputedRef<boolean>
  hasNextPage: ComputedRef<boolean>
  loadMore: (numItems: number) => void
  error: Readonly<Ref<Error | null>>
  /** Re-fetch all current pages in-place, preserving pagination positions */
  refetch: () => Promise<void>
  /** Clear all pages and restart from page 1 */
  restart: () => Promise<void>
}

interface BuildConvexPaginatedQueryResult<Item> {
  resultData: UseConvexPaginatedQueryData<Item>
  resolvePromise: Promise<void>
}

interface StablePaginationOpts {
  numItems: number
  cursor: string | null
}

interface PageState<T> {
  paginationOpts: { numItems: number; cursor: string | null; id: number }
  result: PaginationResult<T> | null
  error: Error | null
  pending: boolean
  subscription: SharedQuerySubscriptionHandle | null
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function createConvexPaginatedQueryState<
  Query extends PaginatedQueryReference,
  Args extends PaginatedQueryArgs<Query> | null | undefined = PaginatedQueryArgs<Query>,
  TransformedItem = PaginatedQueryItem<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexPaginatedQueryOptions<PaginatedQueryItem<Query>, TransformedItem>,
  resolveImmediately = false,
): BuildConvexPaginatedQueryResult<TransformedItem> {
  type Item = PaginatedQueryItem<Query>

  const convexConfig = getConvexRuntimeConfig()
  const query_defaults = convexConfig.query
  const initialNumItems = options?.initialNumItems ?? 10
  const server = options?.server ?? query_defaults?.server ?? true
  const subscribe = options?.subscribe ?? query_defaults?.subscribe ?? true
  const keepPreviousData = options?.keepPreviousData ?? false
  const deepUnrefArgs = options?.deepUnrefArgs ?? false
  const cleanupScope = import.meta.client ? getCurrentScope() : undefined

  assertConvexComposableScope('useConvexPaginatedQuery', import.meta.client, cleanupScope)

  const fnName = getFunctionName(query)
  const normalizedArgs = computed((): Args => {
    const rawArgs = args === undefined ? ({} as Args) : (toValue(args) as Args)
    if (rawArgs == null) return {} as Args
    return (deepUnrefArgs ? deepUnref(rawArgs) : rawArgs) as Args
  })

  // null/undefined args = skip. Canonical pattern:
  // useConvexPaginatedQuery(api.tasks.list, () => teamId.value ? { teamId: teamId.value } : null, ...)
  const isSkipped = computed(() => {
    const rawArgs = args === undefined ? {} : toValue(args)
    return rawArgs == null
  })

  const argsHash = computed(() => hashArgs(normalizedArgs.value))

  const currentPaginationId = ref(generatePaginationId())
  const pages = shallowRef<PageState<Item>[]>([])
  const globalError = ref<Error | null>(null)
  const isManualRefreshPending = ref(false)

  const lastSettledResults = keepPreviousData ? shallowRef<TransformedItem[]>([]) : null

  const initialPaginationOpts = computed(() => ({
    numItems: initialNumItems,
    cursor: null as string | null,
    id: currentPaginationId.value,
  }))

  const buildPageArgs = (
    paginationOpts: PageState<Item>['paginationOpts'] | StablePaginationOpts,
  ): FunctionArgs<Query> => {
    return {
      ...(normalizedArgs.value as PaginatedQueryArgs<Query>),
      paginationOpts,
    } as FunctionArgs<Query>
  }

  const firstPageCacheKey = computed(() => {
    if (isSkipped.value) {
      return `convex-paginated:skipped:${fnName}`
    }
    return `convex-paginated:${getQueryKey(query, buildPageArgs({ numItems: initialNumItems, cursor: null }))}`
  })

  const firstPageWatchSource = computed(
    () => `${argsHash.value}:${isSkipped.value ? 'skipped' : 'enabled'}:${currentPaginationId.value}`,
  )

  const firstPageArgs = computed(() => {
    if (isSkipped.value) return null
    return buildPageArgs(initialPaginationOpts.value)
  })

  const firstPageResource = createLiveQueryResource<Query, PaginationResult<Item>>({
    query,
    args: firstPageArgs as typeof firstPageArgs,
    cacheKey: firstPageCacheKey,
    watchSource: firstPageWatchSource,
    isSkipped,
    server,
    subscribe,
    authMode: 'auto',
    resolveImmediately,
    dedupe: 'defer',
  })

  const getStableSubscriptionKey = (paginationOpts: StablePaginationOpts): string => {
    if (isSkipped.value) {
      return `paginated:${firstPageCacheKey.value}:idle`
    }
    return `paginated:${getQueryKey(query, buildPageArgs(paginationOpts))}`
  }

  const releasePageSubscription = (page: PageState<Item> | undefined) => {
    if (!page?.subscription) return
    page.subscription.release()
    page.subscription = null
  }

  const cleanupAllPageSubscriptions = () => {
    for (const page of pages.value) {
      releasePageSubscription(page)
    }
  }

  const updatePage = (pageIndex: number, updater: (page: PageState<Item>) => PageState<Item>) => {
    const current = pages.value[pageIndex]
    if (!current) return
    const nextPages = [...pages.value]
    nextPages[pageIndex] = updater(current)
    pages.value = nextPages
  }

  const startPageSubscription = (pageIndex: number) => {
    if (!import.meta.client || !subscribe) return

    const page = pages.value[pageIndex]
    if (!page) return

    releasePageSubscription(page)
    page.subscription = startSharedQuerySubscription<Query, PaginationResult<Item>>({
      query,
      args: buildPageArgs(page.paginationOpts),
      cacheKey: getStableSubscriptionKey({
        numItems: page.paginationOpts.numItems,
        cursor: page.paginationOpts.cursor,
      }),
      functionName: fnName,
      onData: (result) => {
        updatePage(pageIndex, (current) => ({
          ...current,
          result,
          pending: false,
          error: null,
        }))
      },
      onError: (error) => {
        updatePage(pageIndex, (current) => ({
          ...current,
          pending: false,
          error,
        }))
      },
    })
  }

  const runPageQuery = async (
    paginationOpts: PageState<Item>['paginationOpts'],
    opts: { subscribe?: boolean } = {},
  ): Promise<PaginationResult<Item>> => {
    return await executeLiveQuery<Query, PaginationResult<Item>>({
      query,
      args: buildPageArgs(paginationOpts),
      subscribe: opts.subscribe ?? subscribe,
      authMode: 'auto',
      functionName: fnName,
    })
  }

  const loadMore = (numItems: number) => {
    if (isSkipped.value) return

    const lastLoadedPage =
      pages.value.length > 0 ? pages.value[pages.value.length - 1]?.result : firstPageResource.asyncData.data.value
    const pendingLastPage = pages.value.length > 0 ? pages.value[pages.value.length - 1]?.pending : false

    if (!lastLoadedPage || pendingLastPage || lastLoadedPage.isDone) {
      return
    }

    const newPage: PageState<Item> = {
      paginationOpts: {
        numItems,
        cursor: lastLoadedPage.continueCursor,
        id: currentPaginationId.value,
      },
      result: null,
      error: null,
      pending: true,
      subscription: null,
    }

    const pageIndex = pages.value.length
    pages.value = [...pages.value, newPage]

    void runPageQuery(newPage.paginationOpts)
      .then((result) => {
        updatePage(pageIndex, (current) => ({
          ...current,
          result,
          pending: false,
          error: null,
        }))
        startPageSubscription(pageIndex)
      })
      .catch((error) => {
        void handleUnauthorizedAuthFailure({ error, source: 'query', functionName: fnName })
        updatePage(pageIndex, (current) => ({
          ...current,
          pending: false,
          error: toError(error),
        }))
      })
  }

  const status = computed((): PaginatedQueryStatus => {
    if (isSkipped.value) return 'skipped'
    if (isManualRefreshPending.value) return 'loading-first-page'

    const firstPageError = firstPageResource.asyncData.error.value
    const extraPageError = pages.value.some((page) => page.error != null)
    if (globalError.value || firstPageError || extraPageError) {
      return 'error'
    }

    if (!server && import.meta.server) {
      return 'loading-first-page'
    }

    const firstPage = firstPageResource.asyncData.data.value
    if (!firstPage || firstPageResource.pending.value) {
      return 'loading-first-page'
    }

    if (pages.value.some((page) => page.pending)) {
      return 'loading-more'
    }

    const lastPage = pages.value.length > 0 ? pages.value[pages.value.length - 1]?.result : null
    if (lastPage?.isDone || firstPage.isDone) {
      return 'exhausted'
    }

    return 'ready'
  })

  const rawResults = computed((): Item[] => {
    if (isSkipped.value) return []

    const items: Item[] = []
    const firstPage = firstPageResource.asyncData.data.value
    if (firstPage) {
      items.push(...firstPage.page)
    }

    for (const page of pages.value) {
      if (page.result) {
        items.push(...page.result.page)
      }
    }

    return items
  })

  const applyTransform = (items: Item[]): TransformedItem[] =>
    options?.transform ? options.transform(items) : (items as unknown as TransformedItem[])

  const transformedResults = computed((): TransformedItem[] => {
    if (rawResults.value.length > 0) {
      return applyTransform(rawResults.value)
    }
    if (status.value === 'loading-first-page' && options?.default) {
      return applyTransform(options.default())
    }
    return applyTransform([])
  })

  const results = computed((): TransformedItem[] => {
    if (
      keepPreviousData &&
      status.value === 'loading-first-page' &&
      transformedResults.value.length === 0 &&
      lastSettledResults!.value.length > 0
    ) {
      return lastSettledResults!.value
    }
    return transformedResults.value
  })

  const error = computed((): Error | null => {
    if (globalError.value) return globalError.value
    if (firstPageResource.asyncData.error.value) {
      return toError(firstPageResource.asyncData.error.value)
    }
    for (const page of pages.value) {
      if (page.error) return page.error
    }
    return null
  })

  if (keepPreviousData && lastSettledResults) {
    watch(
      [() => status.value, () => transformedResults.value],
      ([nextStatus, nextResults]) => {
        if (isSkipped.value || nextStatus === 'loading-first-page') return
        lastSettledResults!.value = nextResults
      },
      { immediate: true },
    )
  }

  watch(
    () => `${argsHash.value}:${isSkipped.value ? 'skipped' : 'enabled'}`,
    async (next, prev) => {
      if (next === prev) return

      cleanupAllPageSubscriptions()
      pages.value = []
      globalError.value = null
      currentPaginationId.value = generatePaginationId()

      if (isSkipped.value) {
        return
      }

      await firstPageResource.asyncData.refresh()
    },
  )

  async function refetch(): Promise<void> {
    if (isSkipped.value) return

    isManualRefreshPending.value = true
    globalError.value = null
    ;(firstPageResource.asyncData.error as Ref<Error | null>).value = null

    const currentPages = pages.value.map((page) => ({
      ...page,
      pending: true,
      error: null,
    }))
    pages.value = currentPages

    try {
      await firstPageResource.asyncData.refresh()
      const refreshedPages = await Promise.all(
        currentPages.map(async (page) => {
          try {
            const result = await runPageQuery(page.paginationOpts, { subscribe: false })
            return {
              ...page,
              result,
              pending: false,
              error: null,
            }
          } catch (err) {
            return {
              ...page,
              pending: false,
              error: toError(err),
            }
          }
        }),
      )
      pages.value = refreshedPages
    } finally {
      isManualRefreshPending.value = false
    }
  }

  async function restart(): Promise<void> {
    cleanupAllPageSubscriptions()
    pages.value = []
    globalError.value = null
    currentPaginationId.value = generatePaginationId()
    ;(firstPageResource.asyncData.error as Ref<Error | null>).value = null

    if (isSkipped.value) {
      return
    }

    await firstPageResource.asyncData.refresh()
  }

  if (cleanupScope) {
    onScopeDispose(() => {
      cleanupAllPageSubscriptions()
    })
  }

  return {
    resultData: {
      results,
      status,
      isLoading: computed(
        () => status.value === 'loading-first-page' || status.value === 'loading-more',
      ),
      isExhausted: computed(() => status.value === 'exhausted'),
      hasNextPage: computed(() => status.value === 'ready'),
      loadMore,
      error,
      refetch,
      restart,
    },
    resolvePromise: firstPageResource.resolvePromise,
  }
}

// Overload: lazy: true → synchronous return
export function useConvexPaginatedQuery<
  Query extends PaginatedQueryReference,
  Args extends PaginatedQueryArgs<Query> | null | undefined = PaginatedQueryArgs<Query>,
  TransformedItem = PaginatedQueryItem<Query>,
>(
  query: Query,
  args: MaybeRefOrGetter<Args> | undefined,
  options: UseConvexPaginatedQueryOptions<PaginatedQueryItem<Query>, TransformedItem> & {
    lazy: true
  },
): UseConvexPaginatedQueryData<TransformedItem>

// Overload: default (lazy: false) → async return
export function useConvexPaginatedQuery<
  Query extends PaginatedQueryReference,
  Args extends PaginatedQueryArgs<Query> | null | undefined = PaginatedQueryArgs<Query>,
  TransformedItem = PaginatedQueryItem<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexPaginatedQueryOptions<PaginatedQueryItem<Query>, TransformedItem>,
): Promise<UseConvexPaginatedQueryData<TransformedItem>>

// Implementation
export function useConvexPaginatedQuery<
  Query extends PaginatedQueryReference,
  Args extends PaginatedQueryArgs<Query> | null | undefined = PaginatedQueryArgs<Query>,
  TransformedItem = PaginatedQueryItem<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexPaginatedQueryOptions<PaginatedQueryItem<Query>, TransformedItem>,
): UseConvexPaginatedQueryData<TransformedItem> | Promise<UseConvexPaginatedQueryData<TransformedItem>> {
  const lazy = options?.lazy ?? false
  const created = createConvexPaginatedQueryState(query, args, options, lazy)
  if (lazy) {
    return created.resultData
  }
  return created.resolvePromise.then(() => created.resultData)
}

/**
 * @deprecated Use `useConvexPaginatedQuery(query, args, { lazy: true })` instead.
 */
export function useConvexPaginatedQueryLazy<
  Query extends PaginatedQueryReference,
  Args extends PaginatedQueryArgs<Query> | null | undefined = PaginatedQueryArgs<Query>,
  TransformedItem = PaginatedQueryItem<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexPaginatedQueryOptions<PaginatedQueryItem<Query>, TransformedItem>,
): UseConvexPaginatedQueryData<TransformedItem> {
  return useConvexPaginatedQuery(query, args, { ...options, lazy: true } as typeof options & {
    lazy: true
  })
}
