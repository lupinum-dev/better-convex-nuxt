import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  PaginationOptions,
  PaginationResult,
} from 'convex/server'
import { getFunctionName } from 'convex/server'
import { hash } from 'ohash'
import {
  computed,
  getCurrentScope,
  onScopeDispose,
  shallowRef,
  watch,
  type MaybeRefOrGetter,
} from 'vue'

import { normalizeConvexError, type ConvexCallError } from './errors'
import { createPaginationController } from './internal/pagination-controller'
import { normalizeConvexArgs, isConvexArgsSkipped } from './internal/query-args'
import type { QueryIsolationTag } from './internal/query-controller'
import { useBetterConvexRuntime } from './runtime-context'
import type { ConvexAuthMode } from './use-query'

export type PaginatedQueryReference = FunctionReference<
  'query',
  'public',
  { paginationOpts: PaginationOptions },
  PaginationResult<unknown>
>
export type PaginatedQueryArgs<Query extends PaginatedQueryReference> = Omit<
  FunctionArgs<Query>,
  'paginationOpts'
>
export type PaginatedQueryItem<Query extends PaginatedQueryReference> =
  FunctionReturnType<Query>['page'][number]

export interface UseConvexPaginatedQueryOptions<Item, TransformedItem = Item> {
  initialNumItems?: number
  subscribe?: boolean
  initialData?: Item[] | (() => Item[])
  /** Complete first-page seed for SSR adapters that must preserve continuation state. */
  initialPage?: PaginationResult<Item> | (() => PaginationResult<Item> | undefined)
  transform?: (items: Item[]) => TransformedItem[]
  keepPreviousData?: boolean
  auth?: ConvexAuthMode
}

export function useConvexPaginatedQuery<
  Query extends PaginatedQueryReference,
  TransformedItem = PaginatedQueryItem<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<PaginatedQueryArgs<Query> | 'skip' | null | undefined>,
  options?: UseConvexPaginatedQueryOptions<PaginatedQueryItem<Query>, TransformedItem>,
) {
  if (!getCurrentScope()) {
    throw new Error(
      '[better-convex-vue] useConvexPaginatedQuery must run inside a Vue effect scope',
    )
  }
  type Item = PaginatedQueryItem<Query>
  const runtime = useBetterConvexRuntime()
  const auth = options?.auth ?? 'optional'
  const subscribe = options?.subscribe ?? true
  const initialNumItems = options?.initialNumItems ?? 10
  const identity = runtime.identity.snapshot
  const currentArgs = computed(() => normalizeConvexArgs(args))
  const argsHash = computed(() => hash(currentArgs.value))
  const functionName = getFunctionName(query)
  const initialPage = options?.initialPage
  const boundaryFirstPage = shallowRef<PaginationResult<Item> | null>(
    (typeof initialPage === 'function' ? initialPage() : initialPage) ?? null,
  )
  const boundaryError = shallowRef<ConvexCallError | null>(null)

  const idle = computed(() => {
    if (isConvexArgsSkipped(currentArgs.value)) return true
    if (auth === 'none') return false
    const snapshot = identity.value
    if (!snapshot.authEnabled) return auth === 'required'
    if (!snapshot.settled || snapshot.error) return true
    return auth === 'required' && snapshot.identityKey === 'anonymous'
  })
  const live = computed(() => !idle.value && subscribe)
  const tag = computed<QueryIsolationTag>(() => ({
    identityKey: auth === 'none' ? 'anonymous' : (identity.value.identityKey ?? 'anonymous'),
    identityGeneration: auth === 'none' ? 0 : identity.value.identityGeneration,
  }))
  const boundaryKey = computed(
    () => `${functionName}:${auth}:${tag.value.identityKey}:${argsHash.value}:${initialNumItems}`,
  )

  const fetchPage = async (paginationOpts: {
    numItems: number
    cursor: string | null
    id: number
  }): Promise<PaginationResult<Item> | null> => {
    if (idle.value || isConvexArgsSkipped(currentArgs.value)) return null
    return (await runtime.browser.clientFor(auth).query(query, {
      ...(currentArgs.value as PaginatedQueryArgs<Query>),
      paginationOpts,
    } as FunctionArgs<Query>)) as PaginationResult<Item>
  }

  async function refreshBoundary() {
    if (idle.value) return
    const operation = controller.captureOperation()
    try {
      const result = await controller.fetchForOperation(controller.initialOptions.value, operation)
      if (result && controller.isOperationCurrent(operation)) boundaryFirstPage.value = result
    } catch (error) {
      if (controller.isOperationCurrent(operation))
        boundaryError.value = normalizeConvexError(error)
    }
  }

  const controller = createPaginationController<Item, TransformedItem>({
    query,
    initialNumItems,
    subscribe,
    keepPreviousData: options?.keepPreviousData ?? false,
    transform: options?.transform,
    initialData: options?.initialData,
    getArgs: () =>
      isConvexArgsSkipped(currentArgs.value)
        ? 'skip'
        : (currentArgs.value as Record<string, unknown>),
    getArgsHash: () => argsHash.value,
    getBoundaryKey: () => boundaryKey.value,
    getIsolationTag: () => tag.value,
    isIdle: () => idle.value,
    isLive: () => live.value,
    isBoundaryPending: () => false,
    getBoundaryFirstPage: () => boundaryFirstPage.value,
    getBoundaryError: () => identity.value.error ?? boundaryError.value,
    setBoundaryError: (error) => {
      boundaryError.value = error
    },
    getClient: () => (idle.value ? null : runtime.browser.clientFor(auth)),
    fetchPage,
    refreshBoundary,
  })
  controller.start()

  let previousTag = tag.value
  let previousBoundaryKey = boundaryKey.value
  let previousLive = live.value
  const reconcile = () => {
    const nextTag = tag.value
    const nextBoundaryKey = boundaryKey.value
    if (
      nextTag.identityGeneration !== previousTag.identityGeneration ||
      nextTag.identityKey !== previousTag.identityKey
    ) {
      boundaryFirstPage.value = null
      controller.handleIdentityBoundary({ nextTag, previousTag, previousBoundaryKey })
    } else {
      void controller.handleExecutionBoundary({
        nextBoundaryKey,
        previousBoundaryKey,
        nextLive: live.value,
        previousLive,
      })
    }
    previousTag = nextTag
    previousBoundaryKey = nextBoundaryKey
    previousLive = live.value
    if (live.value) controller.subscribeFirstPage()
    else if (!idle.value) void refreshBoundary()
  }
  const stop = watch(
    [argsHash, idle, live, () => identity.value.identityGeneration, () => identity.value.authEpoch],
    reconcile,
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => {
    stop()
    controller.dispose()
  })

  return {
    results: controller.results,
    status: controller.status,
    isLoading: controller.isLoading,
    isStale: controller.isStale,
    hasNextPage: controller.hasNextPage,
    loadMore: controller.loadMore,
    error: controller.error,
    refresh: controller.refresh,
    reset: controller.reset,
  }
}
