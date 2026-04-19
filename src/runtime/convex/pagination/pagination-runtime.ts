import type { FunctionArgs } from 'convex/server'
import {
  computed,
  getCurrentInstance,
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

import { handleUnauthorizedAuthFailure } from '../../auth/shared/auth-unauthorized.js'
import {
  appendDevtoolsEvent,
  registerDevtoolsQuery,
  unregisterDevtoolsQuery,
  updateDevtoolsQuery,
} from '../../devtools/runtime.js'
import { createRuntimeObserver } from '../../observability/runtime-observer.js'
import { generatePaginationId } from '../../utils/shared-helpers.js'
import type {
  PaginatedQueryReference,
  PaginatedQueryArgs,
  PaginatedQueryItem,
  PaginatedQueryResult,
} from '../composables/optimistic-updates.js'
import { createLiveQueryResource, executeLiveQuery } from '../query/live-query-resource.js'
import {
  startSharedQuerySubscription,
  type SharedQuerySubscriptionHandle,
} from '../query/shared-query-subscription.js'
import { assertConvexComposableScope } from '../shared/composable-scope.js'
import { getFunctionName, getQueryKey, hashArgs } from '../shared/convex-cache.js'
import { getConvexRuntimeConfig } from '../shared/runtime-config.js'
import {
  createPaginatedWatchSource,
  createSkippedPaginatedCacheKey,
  markRuntimePaginationPagesRefreshing,
  resolveRuntimePaginationError,
  shouldPersistSettledPaginatedResults,
  updateRuntimePaginationPage,
  type RuntimePageState,
  type StablePaginationOpts,
} from './pagination-page-state.js'
import {
  createLoadMoreBootstrap,
  createPaginationOperationContext,
  createPaginationResetState,
  createStablePaginatedSubscriptionKey,
} from './pagination-runtime-state.js'
import {
  collectPaginatedResults,
  derivePaginatedStatus,
  shouldPaginatedResultsBeStale,
  shouldUsePreviousPaginatedResults,
  type PaginatedQueryStatus,
} from './pagination-state.js'
export type { PaginatedQueryStatus } from './pagination-state.js'

export {
  type PaginatedQueryReference,
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
} from '../composables/optimistic-updates.js'

export interface UseConvexPaginatedQueryOptions<Item, TransformedItem = Item> {
  initialNumItems: number
  server?: boolean
  subscribe?: boolean
  default?: () => Item[]
  transform?: (results: Item[]) => TransformedItem[]
  keepPreviousData?: boolean
}

export interface UseConvexPaginatedQueryData<Item> {
  results: ComputedRef<Item[]>
  status: ComputedRef<PaginatedQueryStatus>
  isLoading: ComputedRef<boolean>
  isStale: ComputedRef<boolean>
  isExhausted: ComputedRef<boolean>
  hasNextPage: ComputedRef<boolean>
  loadMore: (numItems: number) => void
  error: Readonly<Ref<Error | null>>
  refresh: () => Promise<void>
  reset: () => Promise<void>
}

export interface UseConvexPaginatedQueryReturn<Item>
  extends UseConvexPaginatedQueryData<Item>, PromiseLike<UseConvexPaginatedQueryData<Item>> {}

interface BuildConvexPaginatedQueryResult<Item> {
  resultData: UseConvexPaginatedQueryData<Item>
  resolvePromise: () => Promise<void>
}
type PageState<T> = RuntimePageState<T, SharedQuerySubscriptionHandle>

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function createConvexPaginatedQueryState<
  Query extends PaginatedQueryReference,
  TransformedItem = PaginatedQueryItem<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<PaginatedQueryArgs<Query> | null | undefined>,
  options?: UseConvexPaginatedQueryOptions<PaginatedQueryItem<Query>, TransformedItem>,
  resolveImmediately = false,
): BuildConvexPaginatedQueryResult<TransformedItem> {
  type Item = PaginatedQueryItem<Query>

  const convexConfig = getConvexRuntimeConfig()
  const queryDefaults = convexConfig.query
  const runtimeConfig = useRuntimeConfig()
  const initialNumItems = options?.initialNumItems ?? 10
  const server = options?.server ?? queryDefaults?.server ?? true
  const subscribe = options?.subscribe ?? queryDefaults?.subscribe ?? true
  const keepPreviousData = options?.keepPreviousData ?? false
  const cleanupScope = import.meta.client ? getCurrentScope() : undefined
  const logger = createRuntimeObserver(runtimeConfig.public.convex ?? {}, { transport: 'browser' })

  assertConvexComposableScope(
    'useConvexPaginatedQuery',
    import.meta.client,
    cleanupScope,
    import.meta.client ? getCurrentInstance() : undefined,
  )

  const fnName = getFunctionName(query)
  const normalizedArgs = computed((): PaginatedQueryArgs<Query> => {
    const rawArgs = args === undefined ? ({} as PaginatedQueryArgs<Query>) : toValue(args)
    if (rawArgs == null) return {} as PaginatedQueryArgs<Query>
    return rawArgs as PaginatedQueryArgs<Query>
  })

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
      return createSkippedPaginatedCacheKey(fnName)
    }
    return `convex-paginated:${getQueryKey(query, buildPageArgs({ numItems: initialNumItems, cursor: null }))}`
  })

  const firstPageWatchSource = computed(() =>
    createPaginatedWatchSource(argsHash.value, isSkipped.value, currentPaginationId.value),
  )

  const firstPageArgs = computed(() => {
    if (isSkipped.value) return null
    return buildPageArgs(initialPaginationOpts.value)
  })

  const firstPageResource = createLiveQueryResource<Query, PaginatedQueryResult<Item>>({
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

  const getStableSubscriptionKey = (paginationOpts: StablePaginationOpts): string =>
    createStablePaginatedSubscriptionKey({
      isSkipped: isSkipped.value,
      firstPageCacheKey: firstPageCacheKey.value,
      queryKey: getQueryKey(query, buildPageArgs(paginationOpts)),
    })

  const releasePageSubscription = (
    page: PageState<Item> | undefined,
    reason: 'args-changed' | 'args-skipped' | 'reset' | 'scope-dispose',
  ) => {
    if (!page?.subscription) return
    const pageArgs = buildPageArgs(page.paginationOpts)
    const didRelease = page.subscription.release()
    page.subscription = null
    if (!didRelease) return
    const operation = createPaginationOperationContext(
      page.paginationOpts,
      getStableSubscriptionKey({
        numItems: page.paginationOpts.numItems,
        cursor: page.paginationOpts.cursor,
      }),
    )
    logger.query({
      name: fnName,
      event: 'unsubscribe',
      reason: getReleaseReason(reason),
      args: pageArgs,
    })
    appendDevtoolsEvent({
      kind: 'query',
      phase: 'unsubscribe',
      operationId: operation.operationId,
      name: fnName,
      args: pageArgs,
      reason: getReleaseReason(reason),
      meta: operation.meta,
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
    pages.value = updateRuntimePaginationPage(pages.value, pageIndex, updater)
  }

  const startPageSubscription = (pageIndex: number) => {
    if (!import.meta.client || !subscribe) return

    const page = pages.value[pageIndex]
    if (!page) return

    releasePageSubscription(page, 'args-changed')
    const pageArgs = buildPageArgs(page.paginationOpts)
    const operation = createPaginationOperationContext(
      page.paginationOpts,
      getStableSubscriptionKey({
        numItems: page.paginationOpts.numItems,
        cursor: page.paginationOpts.cursor,
      }),
      pageIndex,
    )
    page.subscription = startSharedQuerySubscription<Query, PaginatedQueryResult<Item>>({
      query,
      args: pageArgs,
      cacheKey: operation.operationId,
      functionName: fnName,
      onShare: (refCount) => {
        logger.query({ name: fnName, event: 'share', refCount, args: pageArgs })
      },
      onSubscribe: () => {
        logger.query({ name: fnName, event: 'subscribe', args: pageArgs })
        appendDevtoolsEvent({
          kind: 'query',
          phase: 'subscribe',
          operationId: operation.operationId,
          name: fnName,
          args: pageArgs,
          dataSource: 'websocket',
          meta: operation.meta,
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
          operationId: operation.operationId,
          name: fnName,
          args: pageArgs,
          payload: result,
          dataSource: 'websocket',
          meta: operation.meta,
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
          operationId: operation.operationId,
          name: fnName,
          args: pageArgs,
          error: error.message,
          meta: operation.meta,
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
  ): Promise<PaginatedQueryResult<Item>> => {
    return await executeLiveQuery<Query, PaginatedQueryResult<Item>>({
      query,
      args: buildPageArgs(paginationOpts),
      subscribe: opts.subscribe ?? subscribe,
      authMode: 'auto',
      functionName: fnName,
    })
  }

  const loadMore = (numItems: number) => {
    const loadMoreState = createLoadMoreBootstrap<Item, SharedQuerySubscriptionHandle>({
      isSkipped: isSkipped.value,
      firstPage: firstPageResource.asyncData.data.value,
      pages: pages.value,
      numItems,
      paginationId: currentPaginationId.value,
    })
    if (!loadMoreState) {
      return
    }

    const { newPage, pageIndex } = loadMoreState
    pages.value = [...pages.value, newPage]
    const operation = createPaginationOperationContext(
      newPage.paginationOpts,
      getStableSubscriptionKey({
        numItems: newPage.paginationOpts.numItems,
        cursor: newPage.paginationOpts.cursor,
      }),
      pageIndex,
    )
    const pageArgs = buildPageArgs(newPage.paginationOpts)
    appendDevtoolsEvent({
      kind: 'query',
      phase: 'load-more',
      operationId: operation.operationId,
      name: fnName,
      args: pageArgs,
      meta: operation.meta,
    })

    void runPageQuery(newPage.paginationOpts)
      .then((result) => {
        appendDevtoolsEvent({
          kind: 'query',
          phase: 'success',
          operationId: operation.operationId,
          name: fnName,
          args: pageArgs,
          payload: result,
          meta: operation.meta,
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
          operationId: operation.operationId,
          name: fnName,
          args: pageArgs,
          error: toError(error).message,
          meta: operation.meta,
        })
        updatePage(pageIndex, (current) => ({
          ...current,
          pending: false,
          error: toError(error),
        }))
      })
  }

  const status = computed(
    (): PaginatedQueryStatus =>
      derivePaginatedStatus({
        isSkipped: isSkipped.value,
        isManualRefreshPending: isManualRefreshPending.value,
        firstPage: firstPageResource.asyncData.data.value,
        firstPagePending: firstPageResource.pending.value,
        firstPageError: firstPageResource.asyncData.error.value ?? null,
        extraPages: pages.value,
        globalError: globalError.value,
        serverEnabled: server,
        isServerRuntime: import.meta.server,
      }),
  )

  const rawResults = computed((): Item[] => {
    if (isSkipped.value) return []
    return collectPaginatedResults(firstPageResource.asyncData.data.value, pages.value)
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
      shouldUsePreviousPaginatedResults({
        keepPreviousData,
        status: status.value,
        transformedResults: transformedResults.value,
        lastSettledResults: lastSettledResults?.value ?? null,
      })
    ) {
      return lastSettledResults!.value
    }
    return transformedResults.value
  })

  const error = computed((): Error | null => {
    return resolveRuntimePaginationError(
      globalError.value,
      firstPageResource.asyncData.error.value
        ? toError(firstPageResource.asyncData.error.value)
        : null,
      pages.value,
    )
  })

  const isStale = computed(() =>
    shouldPaginatedResultsBeStale({
      keepPreviousData,
      isSkipped: isSkipped.value,
      status: status.value,
      error: error.value,
      lastSettledArgsHash: lastSettledArgsHash?.value ?? null,
      currentArgsHash: argsHash.value,
      results: results.value,
    }),
  )

  if (keepPreviousData && lastSettledResults) {
    watch(
      [() => status.value, () => transformedResults.value, () => argsHash.value],
      ([nextStatus, nextResults, nextArgsHash]) => {
        if (!shouldPersistSettledPaginatedResults(isSkipped.value, nextStatus)) return
        lastSettledResults.value = nextResults
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
      const resetState = createPaginationResetState(generatePaginationId())
      pages.value = resetState.pages
      globalError.value = resetState.globalError
      currentPaginationId.value = resetState.paginationId

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

    const currentPages = markRuntimePaginationPagesRefreshing(pages.value)
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
    const resetState = createPaginationResetState(generatePaginationId())
    pages.value = resetState.pages
    globalError.value = resetState.globalError
    currentPaginationId.value = resetState.paginationId
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

export function useConvexPaginatedQuery<
  Query extends PaginatedQueryReference,
  TransformedItem = PaginatedQueryItem<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<PaginatedQueryArgs<Query> | null | undefined>,
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
