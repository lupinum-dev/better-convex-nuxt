import type { PaginationResult } from 'convex/server'
import {
  computed,
  getCurrentScope,
  onScopeDispose,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
  watch,
} from 'vue'

import { useNuxtApp, useRequestEvent, useAsyncData, useState } from '#imports'

import { identityToken } from '../auth/auth-identity'
import { createPaginationController } from '../client-core/pagination-controller'
import type { PaginationStatus } from '../client-core/pagination-state'
import type { QueryIsolationTag } from '../client-core/query-controller'
import { ConvexCallError, normalizeConvexError } from '../errors'
import { readConvexRuntimeContext } from '../runtime-context'
import type { ConvexQueryRest } from '../utils/args-tuple'
import { useConvexIdentityState } from '../utils/auth-identity-state'
import type { ConvexAuthMode } from '../utils/auth-status'
import { assertConvexComposableScope } from '../utils/composable-scope'
import { fetchAuthToken, withAuthDimension } from '../utils/convex-cache'
import {
  createConvexQueryKey,
  getFunctionName,
  hashArgs,
} from '../utils/convex-shared'
import { isConvexArgsSkipped, normalizeConvexArgs } from '../utils/query-args'
import { executeQueryHttp } from '../utils/query-execution'
import { createQueryExecutionGate } from '../utils/query-execution-gate'
import {
  createConvexQueryAuthContext,
  selectLiveQueryClient,
} from '../utils/query-foundation'
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

export interface UseConvexPaginatedQueryOptions<
  Item = unknown,
  TransformedItem = Item,
> {
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

/**
 * Build the mounted paginated-query state (architecture invariant). One controller per
 * composable owns first- and later-page acquisition, the cursor chain, refresh,
 * reset, the current generation, stale-commit rejection, and disposal. It routes
 * through the query execution plan (auth gating + transport selection) and owns
 * one `onUpdate` listener per live page; Convex owns wire deduplication.
 */
export function createConvexPaginatedQueryState<
  Query extends PaginatedQueryReference,
  Args extends ConvexPaginatedQueryArgs<PaginatedQueryArgs<Query>> =
    PaginatedQueryArgs<Query>,
  TransformedItem = PaginatedQueryItem<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexPaginatedQueryOptions<
    PaginatedQueryItem<Query>,
    TransformedItem
  >,
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
  assertConvexComposableScope(
    'useConvexPaginatedQuery',
    import.meta.client,
    cleanupScope,
  )
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

  const currentTag = computed<QueryIsolationTag>(() => {
    if (authMode === 'none')
      return { identityKey: 'anonymous', identityGeneration: 0 }
    return {
      identityKey: gate.value.cacheIdentity,
      identityGeneration: authCtx.identityGeneration.value,
    }
  })

  const event = import.meta.server ? useRequestEvent() : null
  const cookieHeader = event?.headers.get('cookie') || ''
  const identity = useConvexIdentityState()
  const cachedToken = computed(() => identityToken(identity.value))

  // Identity-partitioned key (paginationOpts kept stable so SSR/client match).
  const asyncDataKey = computed((): string => {
    if (gate.value.outcome !== 'execute')
      return `convex-paginated:${gate.value.outcome}:${fnName}`
    const currentArgs = getArgs() as ConvexPaginatedQueryArgs<
      PaginatedQueryArgs<Query>
    >
    if (currentArgs == null || currentArgs === 'skip')
      return `convex-paginated:idle:${fnName}`
    const base = createConvexQueryKey(
      query,
      {
        ...currentArgs,
        paginationOpts: { numItems: initialNumItems, cursor: null },
      } as never,
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
  const setBoundaryError = (
    err: ConvexCallError | null,
    key = asyncDataKey.value,
  ) => {
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

  const selectClient = () => selectLiveQueryClient(owner, gate.value)

  async function fetchPage(paginationOpts: {
    numItems: number
    cursor: string | null
    id: number
  }): Promise<PaginationResult<Item> | null> {
    const currentArgs = getArgs() as PaginatedQueryArgs<Query>
    const fullArgs = { ...currentArgs, paginationOpts }

    // Client: dispatch through the selected client (primary or anonymous).
    if (import.meta.client) {
      const client = selectClient()
      if (client) {
        const result = (await (
          client.query as (f: unknown, a: unknown) => Promise<unknown>
        )(query, fullArgs)) as PaginationResult<Item>
        return result
      }
    }

    const convexUrl = convexConfig.url
    if (!convexUrl)
      throw new Error('[useConvexPaginatedQuery] Convex URL not configured')
    let authToken: string | undefined
    if (import.meta.server) {
      authToken = fetchAuthToken({ auth: authMode, cookieHeader, cachedToken })
    } else if (authMode !== 'none') {
      authToken = cachedToken.value ?? undefined
    }
    if (
      authMode !== 'none' &&
      gate.value.cacheIdentity !== 'anonymous' &&
      !authToken
    )
      return null
    const result = await executeQueryHttp<PaginationResult<Item>>(
      convexUrl,
      fnName,
      fullArgs,
      authToken,
    )
    return result
  }

  const boundaryPort = {
    firstPage: (): PaginationResult<Item> | null => null,
    pending: () => false,
    refresh: async (): Promise<void> => {},
  }

  const controller = createPaginationController<Item, TransformedItem>({
    query,
    initialNumItems,
    subscribe,
    keepPreviousData,
    transform: options?.transform,
    initialData: options?.initialData,
    getArgs: () => {
      const currentArgs = getArgs()
      return currentArgs === 'skip'
        ? 'skip'
        : (currentArgs as Record<string, unknown>)
    },
    getArgsHash: () => argsHash.value,
    getBoundaryKey: () => asyncDataKey.value,
    getIsolationTag: () => currentTag.value,
    isIdle: () => gate.value.outcome === 'idle',
    isLive: () =>
      import.meta.client &&
      gate.value.outcome === 'execute' &&
      gate.value.subscribe,
    isBoundaryPending: () => boundaryPort.pending(),
    getBoundaryFirstPage: () => boundaryPort.firstPage(),
    getBoundaryError: () => boundaryError.value,
    setBoundaryError,
    getClient: selectClient,
    fetchPage,
    refreshBoundary: () => boundaryPort.refresh(),
  })

  // ---- Nuxt useAsyncData: SSR + hydration + first page --------------------
  const asyncData = useAsyncData(
    asyncDataKey,
    async (): Promise<PaginationResult<Item> | null> => {
      const g = gate.value
      if (g.outcome === 'idle' || g.outcome === 'wait') return null
      if (g.outcome === 'error') {
        setBoundaryError(
          authCtx.error.value ??
            new ConvexCallError({
              kind: 'authentication',
              message: 'Authentication error',
            }),
        )
        return null
      }
      // Client live mode: the first page arrives through the composable-owned
      // subscription (`firstPageRealtimeData`), not a one-shot fetch here.
      if (import.meta.client && g.outcome === 'execute' && g.subscribe)
        return null
      setBoundaryError(null)
      const operation = controller.captureOperation()
      try {
        return await controller.fetchForOperation(
          controller.initialOptions.value,
          operation,
        )
      } catch (rawError) {
        // Normalize once and store in the library-owned state; resolve null so
        // Nuxt never manufactures an H3Error from a handler rejection.
        if (controller.isOperationCurrent(operation))
          setBoundaryError(
            normalizeConvexError(rawError),
            operation.boundaryKey,
          )
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

  boundaryPort.firstPage = () => asyncData.data.value ?? null
  boundaryPort.pending = () => asyncData.status.value === 'pending'
  boundaryPort.refresh = async () => {
    await asyncData.refresh()
  }
  controller.start()

  // ---- client reactivity --------------------------------------------------
  if (import.meta.client && cleanupScope) {
    if (gate.value.outcome === 'execute' && gate.value.subscribe)
      controller.subscribeFirstPage()

    // Synchronous identity-change clearing (architecture invariant).
    watch(
      () => ({ tag: currentTag.value, key: asyncDataKey.value }),
      (next, prev) => {
        if (prev) {
          controller.handleIdentityBoundary({
            nextTag: next.tag,
            previousTag: prev.tag,
            previousBoundaryKey: prev.key,
          })
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
        await controller.handleExecutionBoundary({
          nextBoundaryKey: next.key,
          previousBoundaryKey: prev.key,
          nextLive: next.live,
          previousLive: prev.live,
        })
      },
    )

    onScopeDispose(controller.dispose)
  }

  // ---- terminal-decision awaitability -------------------------------------
  let resolvePromise: Promise<void>
  if (gate.value.outcome === 'idle') {
    resolvePromise = Promise.resolve()
  } else if (import.meta.server) {
    resolvePromise = server ? asyncData.then(() => {}) : Promise.resolve()
  } else {
    const hasExistingData = asyncData.data.value != null
    if (
      hasExistingData ||
      resolveImmediately ||
      (!server && nuxtApp.isHydrating)
    ) {
      resolvePromise = Promise.resolve()
    } else if (gate.value.outcome === 'wait') {
      resolvePromise = authCtx
        .waitForInitialSettlement()
        .then(() => asyncData.refresh())
    } else {
      resolvePromise = asyncData.then(() => {})
    }
  }

  const resultData: UseConvexPaginatedQueryData<TransformedItem> = {
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

  return { resultData, resolvePromise }
}

export async function useConvexPaginatedQuery<
  Query extends PaginatedQueryReference,
  Args extends ConvexPaginatedQueryArgs<PaginatedQueryArgs<Query>> =
    PaginatedQueryArgs<Query>,
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
