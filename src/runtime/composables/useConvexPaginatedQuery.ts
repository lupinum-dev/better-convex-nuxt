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
import type { ConvexClientAuthMode } from '../utils/types'
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
  | 'idle'
  | 'loading-first-page'
  | 'ready'
  | 'loading-more'
  | 'exhausted'
  | 'error'

export interface UseConvexPaginatedQueryOptions<Item = unknown, TransformedItem = Item> {
  initialNumItems: number
  server?: boolean
  subscribe?: boolean
  auth?: ConvexClientAuthMode
  default?: () => Item[]
  transform?: (results: Item[]) => TransformedItem[]
  enabled?: MaybeRefOrGetter<boolean | undefined>
  keepPreviousData?: boolean
  deepUnrefArgs?: boolean
}

export interface UseConvexPaginatedQueryData<Item> {
  results: ComputedRef<Item[]>
  status: ComputedRef<PaginatedQueryStatus>
  isLoading: ComputedRef<boolean>
  hasNextPage: ComputedRef<boolean>
  loadMore: (numItems: number) => void
  error: Readonly<Ref<Error | null>>
  refresh: () => Promise<void>
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
  const defaults = convexConfig.defaults
  const initialNumItems = options?.initialNumItems ?? 10
  const server = options?.server ?? defaults?.server ?? true
  const subscribe = options?.subscribe ?? defaults?.subscribe ?? true
  const authMode = options?.auth ?? defaults?.auth ?? 'auto'
  const keepPreviousData = options?.keepPreviousData ?? false
  const deepUnrefArgs = options?.deepUnrefArgs ?? true
  const cleanupScope = import.meta.client ? getCurrentScope() : undefined

  assertConvexComposableScope('useConvexPaginatedQuery', import.meta.client, cleanupScope)

  const fnName = getFunctionName(query)
  const normalizedArgs = computed((): Args => {
    const rawArgs = args === undefined ? ({} as Args) : (toValue(args) as Args)
    if (rawArgs == null) {
      return rawArgs
    }
    return (deepUnrefArgs ? deepUnref(rawArgs) : rawArgs) as Args
  })
  const enabled = computed(() => toValue(options?.enabled) ?? true)
  const isSkipped = computed(() => !enabled.value || normalizedArgs.value == null)
  const argsHash = computed(() => hashArgs(normalizedArgs.value))

  const currentPaginationId = ref(generatePaginationId())
  const pages = shallowRef<PageState<Item>[]>([])
  const globalError = ref<Error | null>(null)
  const isManualRefreshPending = ref(false)
  const lastSettledResults = shallowRef<TransformedItem[]>([])

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
      return `convex-paginated:idle:${fnName}`
    }
    return `convex-paginated:${getQueryKey(query, buildPageArgs({ numItems: initialNumItems, cursor: null }))}`
  })

  const firstPageWatchSource = computed(
    () => `${argsHash.value}:${enabled.value ? 'enabled' : 'disabled'}:${currentPaginationId.value}`,
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
    authMode,
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
    options: { subscribe?: boolean } = {},
  ): Promise<PaginationResult<Item>> => {
    return await executeLiveQuery<Query, PaginationResult<Item>>({
      query,
      args: buildPageArgs(paginationOpts),
      subscribe: options.subscribe ?? subscribe,
      authMode,
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
    if (isSkipped.value) return 'idle'
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
      lastSettledResults.value.length > 0
    ) {
      return lastSettledResults.value
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

  watch(
    [() => status.value, () => transformedResults.value],
    ([nextStatus, nextResults]) => {
      if (isSkipped.value || nextStatus === 'loading-first-page') return
      lastSettledResults.value = nextResults
    },
    { immediate: true },
  )

  watch(
    () => `${argsHash.value}:${enabled.value ? 'enabled' : 'disabled'}`,
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

  async function refresh(): Promise<void> {
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
          } catch (error) {
            return {
              ...page,
              pending: false,
              error: toError(error),
            }
          }
        }),
      )
      pages.value = refreshedPages
    } finally {
      isManualRefreshPending.value = false
    }
  }

  async function reset(): Promise<void> {
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
      hasNextPage: computed(() => status.value === 'ready'),
      loadMore,
      error,
      refresh,
      reset,
    },
    resolvePromise: firstPageResource.resolvePromise,
  }
}

export async function useConvexPaginatedQuery<
  Query extends PaginatedQueryReference,
  Args extends PaginatedQueryArgs<Query> | null | undefined = PaginatedQueryArgs<Query>,
  TransformedItem = PaginatedQueryItem<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexPaginatedQueryOptions<PaginatedQueryItem<Query>, TransformedItem>,
): Promise<UseConvexPaginatedQueryData<TransformedItem>> {
  const created = createConvexPaginatedQueryState(query, args, options, false)
  await created.resolvePromise
  return created.resultData
}
