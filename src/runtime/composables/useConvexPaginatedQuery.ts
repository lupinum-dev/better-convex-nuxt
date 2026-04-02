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

import { useRuntimeConfig } from '#imports'

import {
  appendDevtoolsEvent,
  registerDevtoolsQuery,
  unregisterDevtoolsQuery,
  updateDevtoolsQuery,
} from '../devtools/runtime'
import { handleUnauthorizedAuthFailure } from '../utils/auth-unauthorized'
import { assertConvexComposableScope } from '../utils/composable-scope'
import { getFunctionName, getQueryKey, hashArgs } from '../utils/convex-cache'
import { getLogLevel, getSharedLogger } from '../utils/logger'
import { getConvexRuntimeConfig } from '../utils/runtime-config'
import { generatePaginationId } from '../utils/shared-helpers'
import {
  createLiveQueryResource,
  executeLiveQuery,
  startSharedQuerySubscription,
  type SharedQuerySubscriptionHandle,
} from './internal/live-query-resource'
import type {
  PaginatedQueryReference,
  PaginatedQueryArgs,
  PaginatedQueryItem,
} from './optimistic-updates'

export {
  type PaginatedQueryReference,
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
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
  /** Preserve previous results while a new first page is loading */
  keepPreviousData?: boolean
}

export interface UseConvexPaginatedQueryData<Item> {
  results: ComputedRef<Item[]>
  status: ComputedRef<PaginatedQueryStatus>
  isLoading: ComputedRef<boolean>
  /** True while keepPreviousData is showing the last settled first-page result for stale args. */
  isStale: ComputedRef<boolean>
  isExhausted: ComputedRef<boolean>
  hasNextPage: ComputedRef<boolean>
  loadMore: (numItems: number) => void
  error: Readonly<Ref<Error | null>>
  /** Re-fetch all current pages in-place, preserving pagination positions */
  refresh: () => Promise<void>
  /** Clear all pages and restart from page 1 */
  reset: () => Promise<void>
}

export interface UseConvexPaginatedQueryReturn<Item>
  extends UseConvexPaginatedQueryData<Item>, PromiseLike<UseConvexPaginatedQueryData<Item>> {}

interface BuildConvexPaginatedQueryResult<Item> {
  resultData: UseConvexPaginatedQueryData<Item>
  resolvePromise: () => Promise<void>
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
  const runtimeConfig = useRuntimeConfig()
  const initialNumItems = options?.initialNumItems ?? 10
  const server = options?.server ?? query_defaults?.server ?? true
  const subscribe = options?.subscribe ?? query_defaults?.subscribe ?? true
  const keepPreviousData = options?.keepPreviousData ?? false
  const cleanupScope = import.meta.client ? getCurrentScope() : undefined
  const logger = getSharedLogger(getLogLevel(runtimeConfig.public.convex ?? {}))

  assertConvexComposableScope('useConvexPaginatedQuery', import.meta.client, cleanupScope)

  const fnName = getFunctionName(query)
  const normalizedArgs = computed((): Args => {
    const rawArgs = args === undefined ? ({} as Args) : (toValue(args) as Args)
    if (rawArgs == null) return {} as Args
    return rawArgs as Args
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
  const lastSettledArgsHash = keepPreviousData ? ref<string | null>(null) : null

  const logSkip = () => {
    logger.query({
      name: fnName,
      event: 'skip',
      reason: 'nullish-args',
    })
  }

  const getReleaseReason = (
    reason: 'args-changed' | 'args-skipped' | 'reset' | 'scope-dispose',
  ): string => reason

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
    () =>
      `${argsHash.value}:${isSkipped.value ? 'skipped' : 'enabled'}:${currentPaginationId.value}`,
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
    onSubscribe: () => {
      logger.query({ name: fnName, event: 'subscribe', args: firstPageArgs.value ?? undefined })
      registerDevtoolsQuery({
        id: firstPageCacheKey.value,
        name: fnName,
        args: normalizedArgs.value,
        status: 'pending',
        dataSource: 'websocket',
        data: null,
        hasSubscription: subscribe,
        options: {
          immediate: resolveImmediately,
          server,
          subscribe,
          auth: 'auto',
        },
      })
    },
    onUnsubscribe: (_cacheKey, didRelease, reason) => {
      if (!didRelease) return
      logger.query({
        name: fnName,
        event: 'unsubscribe',
        reason,
        args: firstPageArgs.value ?? undefined,
      })
      unregisterDevtoolsQuery(firstPageCacheKey.value)
    },
    onShare: (refCount) => {
      logger.query({
        name: fnName,
        event: 'share',
        refCount,
        args: firstPageArgs.value ?? undefined,
      })
    },
    onData: (result, source) => {
      if (source !== 'subscription') return
      logger.query({
        name: fnName,
        event: 'update',
        count: result.page.length,
        args: firstPageArgs.value ?? undefined,
        data: result,
      })
      updateDevtoolsQuery(firstPageCacheKey.value, {
        status: 'success',
        data: result,
        dataSource: 'websocket',
        hasSubscription: subscribe,
      })
    },
    onError: (error) => {
      logger.query({ name: fnName, event: 'error', error, args: firstPageArgs.value ?? undefined })
      updateDevtoolsQuery(firstPageCacheKey.value, {
        status: 'error',
        error: error.message,
      })
    },
  })

  const getStableSubscriptionKey = (paginationOpts: StablePaginationOpts): string => {
    if (isSkipped.value) {
      return `paginated:${firstPageCacheKey.value}:idle`
    }
    return `paginated:${getQueryKey(query, buildPageArgs(paginationOpts))}`
  }

  const releasePageSubscription = (
    page: PageState<Item> | undefined,
    reason: 'args-changed' | 'args-skipped' | 'reset' | 'scope-dispose',
  ) => {
    if (!page?.subscription) return
    const args = buildPageArgs(page.paginationOpts)
    const didRelease = page.subscription.release()
    page.subscription = null
    if (!didRelease) return
    logger.query({
      name: fnName,
      event: 'unsubscribe',
      reason: getReleaseReason(reason),
      args,
    })
    appendDevtoolsEvent({
      kind: 'query',
      phase: 'unsubscribe',
      operationId: getStableSubscriptionKey({
        numItems: page.paginationOpts.numItems,
        cursor: page.paginationOpts.cursor,
      }),
      name: fnName,
      args,
      reason: getReleaseReason(reason),
      meta: {
        paginated: true,
        numItems: page.paginationOpts.numItems,
        cursor: page.paginationOpts.cursor,
      },
    })
  }

  const cleanupAllPageSubscriptions = (
    reason: 'args-changed' | 'args-skipped' | 'reset' | 'scope-dispose',
  ) => {
    for (const page of pages.value) {
      releasePageSubscription(page, reason)
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

    releasePageSubscription(page, 'args-changed')
    const pageArgs = buildPageArgs(page.paginationOpts)
    page.subscription = startSharedQuerySubscription<Query, PaginationResult<Item>>({
      query,
      args: pageArgs,
      cacheKey: getStableSubscriptionKey({
        numItems: page.paginationOpts.numItems,
        cursor: page.paginationOpts.cursor,
      }),
      functionName: fnName,
      onShare: (refCount) => {
        logger.query({ name: fnName, event: 'share', refCount, args: pageArgs })
      },
      onSubscribe: () => {
        logger.query({ name: fnName, event: 'subscribe', args: pageArgs })
        appendDevtoolsEvent({
          kind: 'query',
          phase: 'subscribe',
          operationId: getStableSubscriptionKey({
            numItems: page.paginationOpts.numItems,
            cursor: page.paginationOpts.cursor,
          }),
          name: fnName,
          args: pageArgs,
          dataSource: 'websocket',
          meta: {
            paginated: true,
            page: pageIndex + 2,
            numItems: page.paginationOpts.numItems,
            cursor: page.paginationOpts.cursor,
          },
        })
      },
      onData: (result) => {
        logger.query({
          name: fnName,
          event: 'update',
          count: result.page.length,
          args: pageArgs,
          data: result,
        })
        appendDevtoolsEvent({
          kind: 'query',
          phase: 'update',
          operationId: getStableSubscriptionKey({
            numItems: page.paginationOpts.numItems,
            cursor: page.paginationOpts.cursor,
          }),
          name: fnName,
          args: pageArgs,
          payload: result,
          dataSource: 'websocket',
          meta: {
            paginated: true,
            page: pageIndex + 2,
            numItems: page.paginationOpts.numItems,
            cursor: page.paginationOpts.cursor,
          },
        })
        updatePage(pageIndex, (current) => ({
          ...current,
          result,
          pending: false,
          error: null,
        }))
      },
      onError: (error) => {
        logger.query({ name: fnName, event: 'error', error, args: pageArgs })
        appendDevtoolsEvent({
          kind: 'query',
          phase: 'error',
          operationId: getStableSubscriptionKey({
            numItems: page.paginationOpts.numItems,
            cursor: page.paginationOpts.cursor,
          }),
          name: fnName,
          args: pageArgs,
          error: error.message,
          meta: {
            paginated: true,
            page: pageIndex + 2,
            numItems: page.paginationOpts.numItems,
            cursor: page.paginationOpts.cursor,
          },
        })
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
      pages.value.length > 0
        ? pages.value[pages.value.length - 1]?.result
        : firstPageResource.asyncData.data.value
    const pendingLastPage =
      pages.value.length > 0 ? pages.value[pages.value.length - 1]?.pending : false

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
    appendDevtoolsEvent({
      kind: 'query',
      phase: 'load-more',
      operationId: getStableSubscriptionKey({
        numItems: newPage.paginationOpts.numItems,
        cursor: newPage.paginationOpts.cursor,
      }),
      name: fnName,
      args: buildPageArgs(newPage.paginationOpts),
      meta: {
        paginated: true,
        page: pageIndex + 2,
        numItems,
        cursor: newPage.paginationOpts.cursor,
      },
    })

    void runPageQuery(newPage.paginationOpts)
      .then((result) => {
        appendDevtoolsEvent({
          kind: 'query',
          phase: 'success',
          operationId: getStableSubscriptionKey({
            numItems: newPage.paginationOpts.numItems,
            cursor: newPage.paginationOpts.cursor,
          }),
          name: fnName,
          args: buildPageArgs(newPage.paginationOpts),
          payload: result,
          meta: {
            paginated: true,
            page: pageIndex + 2,
            numItems,
            cursor: newPage.paginationOpts.cursor,
          },
        })
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
        appendDevtoolsEvent({
          kind: 'query',
          phase: 'error',
          operationId: getStableSubscriptionKey({
            numItems: newPage.paginationOpts.numItems,
            cursor: newPage.paginationOpts.cursor,
          }),
          name: fnName,
          args: buildPageArgs(newPage.paginationOpts),
          error: toError(error).message,
          meta: {
            paginated: true,
            page: pageIndex + 2,
            numItems,
            cursor: newPage.paginationOpts.cursor,
          },
        })
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
    options?.transform ? options.transform(items) : (items as TransformedItem[])

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
  const isStale = computed(() => {
    if (!keepPreviousData || !lastSettledArgsHash) return false
    if (isSkipped.value || status.value !== 'loading-first-page') return false
    if (error.value) return false
    if (lastSettledArgsHash.value === null || lastSettledArgsHash.value === argsHash.value) {
      return false
    }
    return results.value.length > 0
  })

  if (keepPreviousData && lastSettledResults) {
    watch(
      [() => status.value, () => transformedResults.value, () => argsHash.value],
      ([nextStatus, nextResults, nextArgsHash]) => {
        if (isSkipped.value || nextStatus === 'loading-first-page') return
        lastSettledResults!.value = nextResults
        lastSettledArgsHash!.value = nextArgsHash
      },
      { immediate: true },
    )
  }

  watch(
    isSkipped,
    (skipped) => {
      if (!skipped) return
      logSkip()
      appendDevtoolsEvent({
        kind: 'query',
        phase: 'skip',
        operationId: `skipped:${fnName}`,
        name: fnName,
        reason: 'nullish-args',
        meta: {
          paginated: true,
        },
      })
    },
    { immediate: true },
  )

  watch(
    () => `${argsHash.value}:${isSkipped.value ? 'skipped' : 'enabled'}`,
    async (next, prev) => {
      if (next === prev) return

      cleanupAllPageSubscriptions(isSkipped.value ? 'args-skipped' : 'args-changed')
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

  async function reset(): Promise<void> {
    cleanupAllPageSubscriptions('reset')
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
      cleanupAllPageSubscriptions('scope-dispose')
    })
  }

  return {
    resultData: {
      results,
      status,
      isLoading: computed(
        () => status.value === 'loading-first-page' || status.value === 'loading-more',
      ),
      isStale,
      isExhausted: computed(() => status.value === 'exhausted'),
      hasNextPage: computed(() => status.value === 'ready'),
      loadMore,
      error,
      refresh,
      reset,
    },
    resolvePromise: () => firstPageResource.resolvePromise,
  }
}
/**
 * Composable for cursor-based paginated queries with real-time updates.
 *
 * Fetches the first page during SSR, then keeps a live subscription on the client.
 * Call `loadMore(n)` to fetch additional pages. All pages are merged into a single
 * reactive `items` array.
 *
 * Status lifecycle: `loading-first-page` -> `ready` -> `loading-more` -> `exhausted`.
 * Pass `null`/`undefined` args to skip the query (`skipped` status).
 *
 * @example Basic pagination
 * ```vue
 * <script setup>
 * import { api } from '~/convex/_generated/api'
 *
 * const { items, status, loadMore, hasNextPage } = await useConvexPaginatedQuery(
 *   api.posts.list,
 *   { workspaceId: props.workspaceId },
 *   { initialNumItems: 20 },
 * )
 * </script>
 *
 * <template>
 *   <div v-for="post in items" :key="post._id">{{ post.title }}</div>
 *   <button v-if="hasNextPage" @click="loadMore(20)">Load more</button>
 * </template>
 * ```
 */
export function useConvexPaginatedQuery<
  Query extends PaginatedQueryReference,
  Args extends PaginatedQueryArgs<Query> | null | undefined = PaginatedQueryArgs<Query>,
  TransformedItem = PaginatedQueryItem<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexPaginatedQueryOptions<PaginatedQueryItem<Query>, TransformedItem>,
): UseConvexPaginatedQueryReturn<TransformedItem> {
  const created = createConvexPaginatedQueryState(query, args, options, true)
  const result = created.resultData as UseConvexPaginatedQueryReturn<TransformedItem>
  const resolvedResult = { ...created.resultData } as UseConvexPaginatedQueryData<TransformedItem>
  result.then = (onFulfilled, onRejected) =>
    created
      .resolvePromise()
      .then(
        () =>
          new Promise<UseConvexPaginatedQueryData<TransformedItem>>((resolve) => {
            if (import.meta.server || !result.isLoading.value) {
              resolve(resolvedResult)
              return
            }

            const stop = watch(
              () => result.isLoading.value,
              (isLoading) => {
                if (isLoading) return
                stop()
                resolve(resolvedResult)
              },
            )
          }),
      )
      .then(onFulfilled, onRejected)
  return result
}
