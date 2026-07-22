import type { PaginationResult } from 'convex/server'
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

import { identityToken } from '../auth/auth-identity'
import {
  commitPaginationPageError,
  commitPaginationPageResult,
  computePaginationStale,
  computePaginationStatus,
  createPaginationGeneration,
  createPaginationOperationFence,
  createPendingPaginationPage,
  getLastLoadedPaginationResult,
  type PaginationFirstPageState,
  type PaginationNextPageState,
  type PaginationPageState,
  type PaginationOperationContext,
  type PaginationStatus,
} from '../client-core/pagination-state'
import { ConvexCallError, normalizeConvexError } from '../errors'
import { readConvexRuntimeContext } from '../runtime-context'
import type { ConvexQueryRest } from '../utils/args-tuple'
import { useConvexIdentityState } from '../utils/auth-identity-state'
import type { ConvexAuthMode } from '../utils/auth-status'
import { assertConvexComposableScope } from '../utils/composable-scope'
import { fetchAuthToken, withAuthDimension } from '../utils/convex-cache'
import { createConvexQueryKey, getFunctionName, hashArgs } from '../utils/convex-shared'
import type { ConvexIdentityKey } from '../utils/identity-key'
import { isConvexArgsSkipped, normalizeConvexArgs } from '../utils/query-args'
import { executeQueryHttp } from '../utils/query-execution'
import { createQueryExecutionGate } from '../utils/query-execution-gate'
import { createConvexQueryAuthContext, selectLiveQueryClient } from '../utils/query-foundation'
import { getConvexRuntimeConfig } from '../utils/runtime-config'
import type {
  PaginatedQueryReference,
  PaginatedQueryArgs,
  PaginatedQueryItem,
} from './optimistic-updates'

export type ConvexPaginatedQuerySkip = 'skip'
export type ConvexPaginatedQueryArgs<Args> = Args | ConvexPaginatedQuerySkip

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

export type PaginatedQueryStatus = PaginationStatus

export interface UseConvexPaginatedQueryOptions<Item = unknown, TransformedItem = Item> {
  /** Number of items to load in the initial page. */
  initialNumItems?: number
  /** Run query on server during SSR. @default true */
  server?: boolean
  /** Subscribe to real-time updates via WebSocket. @default true */
  subscribe?: boolean
  /** Initial placeholder raw results value or factory. */
  initialData?: Item[] | (() => Item[])
  /** Transform the concatenated results array from all loaded pages. */
  transform?: (results: Item[]) => TransformedItem[]
  /** Keep previous results while the first page for new args is loading. Never crosses an identity boundary. @default false */
  keepPreviousData?: boolean
  /**
   * Per-query authentication mode . `'optional'` (default) executes
   * with the signed-in identity when present, anonymously otherwise; `'required'`
   * stays idle while anonymous; `'none'` always executes anonymously.
   *
   * @default 'optional'
   */
  auth?: ConvexAuthMode
}

export interface UseConvexPaginatedQueryData<Item> {
  results: ComputedRef<Item[]>
  status: ComputedRef<PaginatedQueryStatus>
  isLoading: ComputedRef<boolean>
  isStale: ComputedRef<boolean>
  hasNextPage: ComputedRef<boolean>
  loadMore: (numItems: number) => void
  error: Readonly<Ref<ConvexCallError | null>>
  refresh: () => Promise<void>
  reset: () => Promise<void>
}

interface BuildConvexPaginatedQueryResult<Item> {
  resultData: UseConvexPaginatedQueryData<Item>
  resolvePromise: Promise<void>
}

interface IsolationTag {
  identityKey: ConvexIdentityKey
  identityGeneration: number
}

function sameTag(a: IsolationTag, b: IsolationTag): boolean {
  return a.identityKey === b.identityKey && a.identityGeneration === b.identityGeneration
}

/**
 * Build the mounted paginated-query state (architecture invariant). One controller per
 * composable owns first- and later-page acquisition, the cursor chain, refresh,
 * reset, the current generation, stale-commit rejection, and disposal. It routes
 * through the query execution plan (auth gating + transport selection) and owns
 * one `onUpdate` listener per live page; Convex owns wire deduplication.
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
  const owner = readConvexRuntimeContext(nuxtApp)?.owner

  const defaults = convexConfig.defaults
  const initialNumItems = options?.initialNumItems ?? 10
  const server = options?.server ?? defaults.server
  const subscribe = options?.subscribe ?? defaults.subscribe
  const authMode: ConvexAuthMode = options?.auth ?? 'optional'
  const keepPreviousData = options?.keepPreviousData ?? false
  const cleanupScope = import.meta.client ? getCurrentScope() : undefined
  assertConvexComposableScope('useConvexPaginatedQuery', import.meta.client, cleanupScope)
  let disposed = false

  const fnName = getFunctionName(query)

  const normalizedArgs = computed((): Args => normalizeConvexArgs(args) as Args)
  const getArgs = (): Args => normalizedArgs.value
  const isSkipped = computed(() => isConvexArgsSkipped(normalizedArgs.value))
  const argsHash = computed(() => hashArgs(normalizedArgs.value))

  const authCtx = createConvexQueryAuthContext(nuxtApp)
  const gate = computed(() =>
    createQueryExecutionGate({
      authStatus: authCtx.status.value,
      authMode,
      identityKey: authCtx.identityKey.value,
      skipped: isSkipped.value,
      subscribe,
    }),
  )

  const currentTag = computed<IsolationTag>(() => {
    if (authMode === 'none') return { identityKey: 'anonymous', identityGeneration: 0 }
    return {
      identityKey: gate.value.cacheIdentity,
      identityGeneration: authCtx.identityGeneration.value,
    }
  })

  const event = import.meta.server ? useRequestEvent() : null
  const cookieHeader = event?.headers.get('cookie') || ''
  const identity = useConvexIdentityState()
  const cachedToken = computed(() => identityToken(identity.value))

  const currentPaginationId = ref(createPaginationGeneration())
  const pages = shallowRef<PaginationPageState<Item>[]>([])
  const firstPageRealtimeData = shallowRef<PaginationResult<Item> | null>(null)
  const isManualRefreshPending = ref(false)
  let firstPageUnsub: (() => void) | null = null

  const initialPaginationOpts = computed(() => ({
    numItems: initialNumItems,
    cursor: null as string | null,
    id: currentPaginationId.value,
  }))

  // Identity-partitioned key (paginationOpts kept stable so SSR/client match).
  const asyncDataKey = computed((): string => {
    if (gate.value.outcome !== 'execute') return `convex-paginated:${gate.value.outcome}:${fnName}`
    const currentArgs = getArgs() as ConvexPaginatedQueryArgs<PaginatedQueryArgs<Query>>
    if (currentArgs == null || currentArgs === 'skip') return `convex-paginated:idle:${fnName}`
    const base = createConvexQueryKey(
      query,
      { ...currentArgs, paginationOpts: { numItems: initialNumItems, cursor: null } } as never,
      'convex-paginated',
    )
    return withAuthDimension(base, authMode, gate.value.cacheIdentity)
  })

  // Library-owned, identity-partitioned error state (decision 8). Same
  // payload-backed store as the regular query: normalized to ConvexCallError
  // exactly once, keyed by the identity-partitioned `asyncDataKey`, and revived
  // as an `instanceof ConvexCallError` after SSR. Per-page errors live on the
  // client-only page state; this holds the first-page / auth / SSR error.
  const errorStore = useState<Record<string, ConvexCallError | null>>(
    'convex:query-errors',
    () => ({}),
  )
  const setBoundaryError = (err: ConvexCallError | null, key = asyncDataKey.value) => {
    const store = errorStore.value
    if (err) {
      errorStore.value = { ...store, [key]: err }
    } else if (key in store) {
      const { [key]: _omitted, ...next } = store
      errorStore.value = next
    }
  }
  const boundaryError = computed<ConvexCallError | null>(
    () => errorStore.value[asyncDataKey.value] ?? null,
  )

  const operationFence = createPaginationOperationFence({
    getArgsHash: () => argsHash.value,
    getBoundaryKey: () => asyncDataKey.value,
    getPaginationGeneration: () => currentPaginationId.value,
    getIsolationTag: () => currentTag.value,
    isDisposed: () => disposed,
  })
  const captureOperation = operationFence.capture
  const invalidateOperations = operationFence.invalidate
  const isOperationCurrent = operationFence.isCurrent

  const selectClient = () => selectLiveQueryClient(owner, gate.value)

  async function fetchPage(
    paginationOpts: {
      numItems: number
      cursor: string | null
      id: number
    },
    operation: PaginationOperationContext,
  ): Promise<PaginationResult<Item> | null> {
    const currentArgs = getArgs() as PaginatedQueryArgs<Query>
    const fullArgs = { ...currentArgs, paginationOpts }

    // Client: dispatch through the selected client (primary or anonymous).
    if (import.meta.client) {
      const client = selectClient()
      if (client) {
        const result = (await (client.query as (f: unknown, a: unknown) => Promise<unknown>)(
          query,
          fullArgs,
        )) as PaginationResult<Item>
        return isOperationCurrent(operation) ? result : null
      }
    }

    const convexUrl = convexConfig.url
    if (!convexUrl) throw new Error('[useConvexPaginatedQuery] Convex URL not configured')
    let authToken: string | undefined
    if (import.meta.server) {
      authToken = fetchAuthToken({ auth: authMode, cookieHeader, cachedToken })
    } else if (authMode !== 'none') {
      authToken = cachedToken.value ?? undefined
    }
    if (authMode !== 'none' && gate.value.cacheIdentity !== 'anonymous' && !authToken) return null
    const result = await executeQueryHttp<PaginationResult<Item>>(
      convexUrl,
      fnName,
      fullArgs,
      authToken,
    )
    return isOperationCurrent(operation) ? result : null
  }

  // ---- live page subscriptions (composable-owned, one per page) -----------
  function subscribeFirstPage() {
    if (
      disposed ||
      !import.meta.client ||
      gate.value.outcome !== 'execute' ||
      !gate.value.subscribe
    )
      return
    const client = selectClient()
    if (!client) return
    const currentArgs = getArgs() as PaginatedQueryArgs<Query>
    const fullArgs = { ...currentArgs, paginationOpts: initialPaginationOpts.value }
    const operation = captureOperation()

    if (firstPageUnsub) firstPageUnsub()
    firstPageUnsub = (
      client.onUpdate as (
        q: unknown,
        a: unknown,
        cb: (r: unknown) => void,
        onErr?: (e: Error) => void,
      ) => () => void
    )(
      query,
      fullArgs,
      (result: unknown) => {
        if (!isOperationCurrent(operation)) return
        firstPageRealtimeData.value = result as PaginationResult<Item>
        setBoundaryError(null)
      },
      (err: Error) => {
        if (!isOperationCurrent(operation)) return
        setBoundaryError(normalizeConvexError(err))
      },
    )
  }

  function subscribePage(pageIndex: number) {
    if (
      disposed ||
      !import.meta.client ||
      gate.value.outcome !== 'execute' ||
      !gate.value.subscribe
    )
      return
    const page = pages.value[pageIndex]
    if (!page) return
    const client = selectClient()
    if (!client) return
    const currentArgs = getArgs() as PaginatedQueryArgs<Query>
    const fullArgs = { ...currentArgs, paginationOpts: page.paginationOpts }
    const operation = captureOperation()
    const requestId = page.paginationOpts.id

    if (page.unsubscribe) page.unsubscribe()
    const unsub = (
      client.onUpdate as (
        q: unknown,
        a: unknown,
        cb: (r: unknown) => void,
        onErr?: (e: Error) => void,
      ) => () => void
    )(
      query,
      fullArgs,
      (result: unknown) => {
        if (!isOperationCurrent(operation)) return
        const idx = pages.value.findIndex((p) => p.paginationOpts.id === requestId)
        if (idx < 0) return
        pages.value = commitPaginationPageResult(pages.value, idx, result as PaginationResult<Item>)
      },
      (err: Error) => {
        if (!isOperationCurrent(operation)) return
        const idx = pages.value.findIndex((p) => p.paginationOpts.id === requestId)
        if (idx < 0) return
        pages.value = commitPaginationPageError(pages.value, idx, err)
      },
    )
    page.unsubscribe = () => unsub()
  }

  function teardownAllSubscriptions() {
    if (firstPageUnsub) {
      firstPageUnsub()
      firstPageUnsub = null
    }
    for (const page of pages.value) {
      if (page.unsubscribe) {
        page.unsubscribe()
        page.unsubscribe = null
      }
    }
  }

  // ---- Nuxt useAsyncData: SSR + hydration + first page --------------------
  const asyncData = useAsyncData(
    asyncDataKey,
    async (): Promise<PaginationResult<Item> | null> => {
      const g = gate.value
      if (g.outcome === 'idle' || g.outcome === 'wait') return null
      if (g.outcome === 'error') {
        setBoundaryError(
          authCtx.error.value ??
            new ConvexCallError({ kind: 'authentication', message: 'Authentication error' }),
        )
        return null
      }
      // Client live mode: the first page arrives through the composable-owned
      // subscription (`firstPageRealtimeData`), not a one-shot fetch here.
      if (import.meta.client && g.outcome === 'execute' && g.subscribe) return null
      setBoundaryError(null)
      const operation = captureOperation()
      try {
        return await fetchPage(initialPaginationOpts.value, operation)
      } catch (rawError) {
        // Normalize once and store in the library-owned state; resolve null so
        // Nuxt never manufactures an H3Error from a handler rejection.
        if (isOperationCurrent(operation))
          setBoundaryError(normalizeConvexError(rawError), operation.boundaryKey)
        return null
      }
    },
    {
      server,
      lazy: resolveImmediately,
      dedupe: 'defer',
      deep: false,
    },
  )

  // ---- derived results / status -------------------------------------------
  const applyTransform = (items: Item[]): TransformedItem[] =>
    options?.transform ? options.transform(items) : (items as unknown as TransformedItem[])
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
    const usingPrev = isPreviousDataForCurrentArgs()
    const firstPageData = usingPrev ? null : (firstPageRealtimeData.value ?? asyncData.data.value)
    const lastPage = pages.value.length > 0 ? pages.value[pages.value.length - 1] : null
    const firstPage: PaginationFirstPageState = firstPageData
      ? { state: 'ready', isDone: firstPageData.isDone }
      : { state: 'loading' }
    const nextPage: PaginationNextPageState = lastPage?.pending
      ? { state: 'loading' }
      : lastPage?.result?.isDone
        ? { state: 'exhausted' }
        : { state: 'idle' }
    return computePaginationStatus({
      disabled: gate.value.outcome === 'idle',
      refresh: isManualRefreshPending.value ? 'pending' : 'idle',
      hasError: boundaryError.value != null || pages.value.some((page) => page.error != null),
      firstPage,
      nextPage,
    })
  })

  const rawResults = computed((): Item[] => {
    if (gate.value.outcome === 'idle') return []
    if (isPreviousDataForCurrentArgs()) return []
    const allItems: Item[] = []
    const firstPageData = firstPageRealtimeData.value ?? asyncData.data.value
    if (firstPageData) allItems.push(...firstPageData.page)
    for (const page of pages.value) {
      if (page?.result) allItems.push(...page.result.page)
    }
    return allItems
  })

  const transformedResults = computed((): TransformedItem[] => {
    const raw = rawResults.value
    if (raw.length > 0) return applyTransform(raw)
    const initialData = resolveInitialData()
    if (status.value === 'loading-first-page' && initialData) return applyTransform(initialData)
    return applyTransform([])
  })

  const isStale = computed(() =>
    computePaginationStale({
      keepPreviousData,
      status: status.value,
      transformedResultCount: transformedResults.value.length,
      lastSettledResultCount: lastSettledResults.value.length,
    }),
  )

  const results = computed((): TransformedItem[] =>
    isStale.value ? (lastSettledResults.value as TransformedItem[]) : transformedResults.value,
  )

  const isLoading = computed(() => {
    const s = status.value
    return s === 'loading-first-page' || s === 'loading-more'
  })
  const hasNextPage = computed(() => status.value === 'ready')

  // Reads ONLY library-owned state (never `asyncData.error`, which Nuxt would
  // have H3Error-wrapped): the first-page/auth/SSR boundary error, then any
  // failed later page.
  const error = computed((): ConvexCallError | null => {
    if (boundaryError.value) return boundaryError.value
    for (const page of pages.value) {
      if (page.error) return page.error
    }
    return null
  })

  // Track last settled results for keepPreviousData (tagged via lastSettledArgsHash).
  watch(
    [() => status.value, () => transformedResults.value],
    ([nextStatus, nextResults]) => {
      if (gate.value.outcome === 'idle') return
      if (nextStatus === 'loading-first-page') return
      lastSettledResults.value = nextResults as TransformedItem[]
      lastSettledArgsHash.value = argsHash.value
    },
    { immediate: true },
  )

  const loadMore = (numItems: number) => {
    if (gate.value.outcome !== 'execute' || isManualRefreshPending.value) return
    const lastPageResult = getLastLoadedPaginationResult(
      firstPageRealtimeData.value ?? asyncData.data.value,
      pages.value,
    )
    if (!lastPageResult || lastPageResult.isDone) return

    const newPage = createPendingPaginationPage<Item>({
      numItems,
      cursor: lastPageResult.continueCursor,
      id: currentPaginationId.value,
    })
    pages.value = [...pages.value, newPage]
    const newPageIndex = pages.value.length - 1
    const requestPaginationId = currentPaginationId.value
    const requestArgsHash = argsHash.value
    const operation = captureOperation()

    if (
      import.meta.client &&
      gate.value.outcome === 'execute' &&
      gate.value.subscribe &&
      selectClient()
    ) {
      subscribePage(newPageIndex)
      return
    }

    void fetchPage(newPage.paginationOpts, operation)
      .then((result) => {
        if (
          !isOperationCurrent(operation) ||
          currentPaginationId.value !== requestPaginationId ||
          argsHash.value !== requestArgsHash
        )
          return
        const idx = pages.value.findIndex(
          (p) => p.paginationOpts.id === requestPaginationId && p === pages.value[newPageIndex],
        )
        if (idx < 0 || !result) return
        pages.value = commitPaginationPageResult(pages.value, newPageIndex, result)
      })
      .catch((e) => {
        if (!isOperationCurrent(operation) || currentPaginationId.value !== requestPaginationId)
          return
        pages.value = commitPaginationPageError(pages.value, newPageIndex, e)
      })
  }

  async function refresh(): Promise<void> {
    if (gate.value.outcome !== 'execute' || isManualRefreshPending.value) return
    isManualRefreshPending.value = true
    setBoundaryError(null)

    const refreshPaginationId = currentPaginationId.value
    const loadedPages = [...pages.value]
    const operation = captureOperation()

    try {
      const firstPageResult = await fetchPage(initialPaginationOpts.value, operation)
      if (!firstPageResult) return

      // Re-chain sequentially off each fresh continueCursor; commit atomically.
      const refreshedPages: PaginationPageState<Item>[] = [...loadedPages]
      let previousResult: PaginationResult<Item> = firstPageResult
      for (let i = 0; i < loadedPages.length; i++) {
        const page = loadedPages[i]
        if (!page) continue
        const pageResult = await fetchPage(
          {
            numItems: page.paginationOpts.numItems,
            cursor: previousResult.continueCursor,
            id: page.paginationOpts.id,
          },
          operation,
        )
        if (!pageResult) return
        refreshedPages[i] = {
          ...page,
          paginationOpts: { ...page.paginationOpts, cursor: previousResult.continueCursor },
          result: pageResult,
          error: null,
          pending: false,
        }
        previousResult = pageResult
      }

      if (
        isOperationCurrent(operation) &&
        currentPaginationId.value === refreshPaginationId &&
        gate.value.outcome === 'execute' &&
        pages.value.length === loadedPages.length
      ) {
        firstPageRealtimeData.value = firstPageResult
        pages.value = refreshedPages
        if (import.meta.client && gate.value.outcome === 'execute' && gate.value.subscribe) {
          for (let i = 0; i < refreshedPages.length; i++) {
            const before = loadedPages[i]
            const after = refreshedPages[i]
            if (before && after && before.paginationOpts.cursor !== after.paginationOpts.cursor) {
              subscribePage(i)
            }
          }
        }
        setBoundaryError(null)
      }
    } catch (e) {
      if (isOperationCurrent(operation) && currentPaginationId.value === refreshPaginationId) {
        setBoundaryError(normalizeConvexError(e), operation.boundaryKey)
      }
    } finally {
      if (isOperationCurrent(operation)) isManualRefreshPending.value = false
    }
  }

  async function reset(): Promise<void> {
    invalidateOperations()
    isManualRefreshPending.value = true
    if (import.meta.client) teardownAllSubscriptions()
    firstPageRealtimeData.value = null
    currentPaginationId.value = createPaginationGeneration()
    pages.value = []
    setBoundaryError(null)
    try {
      await asyncData.refresh()
    } finally {
      isManualRefreshPending.value = false
    }
    if (disposed) return
    if (import.meta.client && gate.value.outcome === 'execute' && gate.value.subscribe)
      subscribeFirstPage()
  }

  // ---- client reactivity --------------------------------------------------
  if (import.meta.client && cleanupScope) {
    if (gate.value.outcome === 'execute' && gate.value.subscribe) subscribeFirstPage()

    // Synchronous identity-change clearing (architecture invariant).
    watch(
      () => ({ tag: currentTag.value, key: asyncDataKey.value }),
      (next, prev) => {
        if (prev && !sameTag(next.tag, prev.tag)) {
          invalidateOperations()
          teardownAllSubscriptions()
          currentPaginationId.value = createPaginationGeneration()
          isManualRefreshPending.value = false
          firstPageRealtimeData.value = null
          pages.value = []
          setBoundaryError(null, prev.key)
          lastSettledResults.value = []
          lastSettledArgsHash.value = null
        }
      },
      { flush: 'sync' },
    )

    // Re-key on args / identity / gate transitions.
    watch(
      () => ({
        key: asyncDataKey.value,
        live: gate.value.outcome === 'execute' && gate.value.subscribe,
      }),
      async (next, prev) => {
        if (next.key === prev.key && next.live === prev.live) return
        invalidateOperations()
        setBoundaryError(null, prev.key)
        teardownAllSubscriptions()
        firstPageRealtimeData.value = null
        if (gate.value.outcome === 'idle') {
          pages.value = []
          setBoundaryError(null)
          return
        }
        currentPaginationId.value = createPaginationGeneration()
        pages.value = []
        setBoundaryError(null)
        if (next.live) subscribeFirstPage()
        await asyncData.refresh()
      },
    )

    onScopeDispose(() => {
      disposed = true
      invalidateOperations()
      teardownAllSubscriptions()
    })
  }

  // ---- terminal-decision awaitability -------------------------------------
  let resolvePromise: Promise<void>
  if (gate.value.outcome === 'idle') {
    resolvePromise = Promise.resolve()
  } else if (import.meta.server) {
    resolvePromise = server ? asyncData.then(() => {}) : Promise.resolve()
  } else {
    const hasExistingData = asyncData.data.value != null
    if (hasExistingData || resolveImmediately || (!server && nuxtApp.isHydrating)) {
      resolvePromise = Promise.resolve()
    } else if (gate.value.outcome === 'wait') {
      resolvePromise = authCtx.waitForInitialSettlement().then(() => asyncData.refresh())
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

  return { resultData, resolvePromise }
}

export async function useConvexPaginatedQuery<
  Query extends PaginatedQueryReference,
  Args extends ConvexPaginatedQueryArgs<PaginatedQueryArgs<Query>> = PaginatedQueryArgs<Query>,
  TransformedItem = PaginatedQueryItem<Query>,
>(
  query: Query,
  ...rest: ConvexQueryRest<
    PaginatedQueryArgs<Query>,
    MaybeRefOrGetter<ConvexPaginatedQueryArgs<NoInfer<Args>>>,
    UseConvexPaginatedQueryOptions<PaginatedQueryItem<Query>, TransformedItem>
  >
): Promise<UseConvexPaginatedQueryData<TransformedItem>> {
  const [args, options] = rest
  const { resultData, resolvePromise } = createConvexPaginatedQueryState(
    query,
    args as MaybeRefOrGetter<ConvexPaginatedQueryArgs<Args>> | undefined,
    options,
    false,
  )
  await resolvePromise
  return resultData
}
