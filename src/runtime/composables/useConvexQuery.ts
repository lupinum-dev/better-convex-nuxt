import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server'
import {
  computed,
  watch,
  triggerRef,
  onScopeDispose,
  getCurrentScope,
  type Ref,
  type ComputedRef,
  type MaybeRefOrGetter,
} from 'vue'

import { useNuxtApp, useRequestEvent, useAsyncData, useState } from '#imports'

import { identityToken } from '../auth/auth-identity'
import {
  createQueryController,
  type QueryIsolationTag,
  type QueryOperationContext,
} from '../client-core/query-controller'
import type { QueryDataSource, QueryStatus } from '../devtools/types'
import { ConvexCallError } from '../errors'
import { readConvexRuntimeContext } from '../runtime-context'
import type { ConvexQueryRest } from '../utils/args-tuple'
import { useConvexIdentityState } from '../utils/auth-identity-state'
import type { ConvexAuthMode } from '../utils/auth-status'
import { assertConvexComposableScope } from '../utils/composable-scope'
import { fetchAuthToken, withAuthDimension } from '../utils/convex-cache'
import {
  computeQueryStatus,
  createConvexQueryKey,
  getFunctionName,
  hashArgs,
} from '../utils/convex-shared'
import { createLogger } from '../utils/logger'
import { isConvexArgsSkipped, normalizeConvexArgs } from '../utils/query-args'
import { executeQueryHttp } from '../utils/query-execution'
import { createQueryExecutionGate } from '../utils/query-execution-gate'
import { createConvexQueryAuthContext, selectLiveQueryClient } from '../utils/query-foundation'
import { computeConvexQueryPending } from '../utils/query-state'
import { getConvexRuntimeConfig } from '../utils/runtime-config'
import type { ConvexCallStatus } from '../utils/types'

// Re-export for consumers
export type { ConvexCallStatus }

export type ConvexQuerySkip = 'skip'
export type ConvexQueryArgs<Args> = Args | ConvexQuerySkip

/**
 * Options for useConvexQuery.
 */
export interface UseConvexQueryOptions<RawT, DataT = RawT> {
  /** Run query on server during SSR. @default true (configurable via `convex.defaults.server`). */
  server?: boolean
  /** Subscribe to real-time updates via WebSocket. @default true (configurable via `convex.defaults.subscribe`). */
  subscribe?: boolean
  /** Initial placeholder data value or factory. */
  initialData?: RawT | (() => RawT | undefined)
  /** Transform data after fetching. */
  transform?: (input: RawT) => DataT
  /** Keep the last successful data while args change and the next request is pending. Never crosses an identity boundary. @default false */
  keepPreviousData?: boolean
  /**
   * Per-query authentication mode .
   *
   * - `'required'`: waits for initial auth settlement; executes with the
   *   signed-in identity; stays idle while anonymous.
   * - `'optional'` (default): waits for initial auth settlement; executes with
   *   the signed-in identity when present, anonymously otherwise.
   * - `'none'`: never inspects or waits for auth; always executes anonymously
   *   through the dedicated anonymous client.
   *
   * @default 'optional'
   */
  auth?: ConvexAuthMode
}

export interface UseConvexQueryData<DataT> {
  data: ComputedRef<DataT | null>
  error: ComputedRef<ConvexCallError | null>
  refresh: () => Promise<void>
  clear: () => void
  pending: ComputedRef<boolean>
  status: ComputedRef<ConvexCallStatus>
  isStale: ComputedRef<boolean>
}

interface BuildConvexQueryResult<DataT> {
  resultData: UseConvexQueryData<DataT>
  resolvePromise: Promise<void>
}

/**
 * Build the mounted regular-query state (architecture invariant). Each instance owns one
 * `onUpdate` listener via the per-app client owner, its own Vue-visible data /
 * error / pending / transform, and clears all identity-owned state synchronously
 * on an identity change. Convex owns wire deduplication; there is no library
 * subscription registry, bridge, or reference count.
 */
export function createConvexQueryState<
  Query extends FunctionReference<'query'>,
  Args extends ConvexQueryArgs<FunctionArgs<Query>> = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<Args>,
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, DataT>,
  resolveImmediately = false,
): BuildConvexQueryResult<DataT> {
  type RawT = FunctionReturnType<Query>

  const nuxtApp = useNuxtApp()
  const convexConfig = getConvexRuntimeConfig()
  const runtime = readConvexRuntimeContext(nuxtApp)
  const owner = runtime?.owner

  const defaults = convexConfig.defaults
  const server = options?.server ?? defaults.server
  const subscribe = options?.subscribe ?? defaults.subscribe
  const authMode: ConvexAuthMode = options?.auth ?? 'optional'
  const keepPreviousData = options?.keepPreviousData ?? false

  const fnName = getFunctionName(query)

  const logger = runtime?.logger ?? createLogger(convexConfig.logging)

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

  // Isolation tag for the current identity dimension (architecture invariant). `none`
  // keys under a stable anonymous transport epoch that never changes on auth
  // transitions; every other mode carries the concrete identity + generation.
  const currentTag = computed<QueryIsolationTag>(() => {
    if (authMode === 'none') return { identityKey: 'anonymous', identityGeneration: 0 }
    return {
      identityKey: gate.value.cacheIdentity,
      identityGeneration: authCtx.identityGeneration.value,
    }
  })

  // Identity-partitioned async-data / payload key. A new identity yields a new
  // key, so B never reads A's payload (structural isolation, no token keys).
  const asyncDataKey = computed((): string => {
    if (gate.value.outcome !== 'execute') return `convex:${gate.value.outcome}:${fnName}`
    const base = createConvexQueryKey(query, getArgs() as FunctionArgs<Query>)
    return withAuthDimension(base, authMode, gate.value.cacheIdentity)
  })

  const event = import.meta.server ? useRequestEvent() : null
  const cookieHeader = event?.headers.get('cookie') || ''
  const identity = useConvexIdentityState()
  const cachedToken = computed(() => identityToken(identity.value))

  const currentScope = import.meta.client ? getCurrentScope() : undefined
  assertConvexComposableScope('useConvexQuery', import.meta.client, currentScope)

  // Library-owned, identity-partitioned error state (architecture invariant,
  // decision 8). Failures are normalized to `ConvexCallError` exactly once and
  // stored here — never routed through `asyncData.error`, which Nuxt wraps into
  // an H3Error before the payload reducer can preserve the class. The store is
  // `useState`-backed so a real SSR failure serializes and revives as an
  // `instanceof ConvexCallError` (the payload plugin reduces/revives each nested
  // instance), and it is keyed by the identity-partitioned `asyncDataKey` so
  // identity B structurally never reads identity A's error.
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
  const liveError = computed<ConvexCallError | null>(
    () => errorStore.value[asyncDataKey.value] ?? null,
  )

  function recordQuery(
    queryStatus: QueryStatus,
    data: unknown,
    dataSource: QueryDataSource,
    hasSubscription: boolean,
    queryError?: string,
  ) {
    const currentArgs = getArgs()
    if (currentArgs === 'skip') return
    runtime?.getDevtoolsSink()?.upsertQuery({
      id: asyncDataKey.value,
      name: fnName,
      args: currentArgs,
      status: queryStatus,
      dataSource,
      data,
      error: queryError,
      hasSubscription,
      options: {
        immediate: resolveImmediately,
        server,
        subscribe,
        auth: authMode,
      },
    })
  }

  // Bound to Nuxt's async-data refs immediately after useAsyncData returns.
  // Keeping this tiny port mutable breaks the construction cycle without
  // moving Nuxt payload ownership into the controller.
  let readBoundaryData = (): RawT | null => null
  let writeBoundaryData = (_value: RawT | null): void => {}
  let clearBoundaryAsyncError = (): void => {}
  let clearBoundaryData = (): void => {}

  // The framework-neutral controller is the sole owner of the live listener,
  // operation generations, previous-data tag, and first-value settlement.
  // Nuxt retains only its SSR, payload, and useAsyncData boundary below.
  const controller = createQueryController<RawT, DataT>({
    query,
    subscribe: import.meta.client && subscribe,
    keepPreviousData,
    transform: options?.transform,
    initialData: options?.initialData,
    getArgs: () => getArgs() as Record<string, unknown> | 'skip',
    getArgsHash: () => argsHash.value,
    getBoundaryKey: () => asyncDataKey.value,
    getIsolationTag: () => currentTag.value,
    getClient: () => {
      const g = gate.value
      if (g.outcome !== 'execute' || !g.subscribe) return null
      return selectLiveQueryClient(owner, g)
    },
    boundary: {
      readData: () => readBoundaryData(),
      writeData: (value) => writeBoundaryData(value),
      clearAsyncError: () => clearBoundaryAsyncError(),
      setError: (error, key) => setBoundaryError(error, key),
      clearData: () => clearBoundaryData(),
    },
    events: {
      onSubscribe: ({ args: currentArgs }) => {
        logger.query({ name: fnName, event: 'subscribe', args: currentArgs })
        recordQuery('pending', null, 'websocket', true)
      },
      onUpdate: ({ args: currentArgs, value }) => {
        logger.query({
          name: fnName,
          event: 'update',
          count: Array.isArray(value) ? value.length : 1,
          args: currentArgs,
        })
        recordQuery('success', value, 'websocket', true)
      },
      onError: ({ error }) => {
        logger.query({ name: fnName, event: 'error', error })
        recordQuery('error', null, 'websocket', true, error.message)
      },
      onRemove: (key) => runtime?.getDevtoolsSink()?.removeQuery(key),
    },
  })

  // ---- Nuxt useAsyncData: SSR + hydration + first client result -----------
  const asyncData = useAsyncData<RawT | null, Error>(
    asyncDataKey,
    async () => {
      const g = gate.value
      if (g.outcome === 'idle' || g.outcome === 'wait') return null
      // Auth resolution failed without a usable identity: surface it through the
      // composable-owned error state, never by throwing (H3Error wrap hazard).
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

      // A fresh fetch attempt clears any prior boundary error for this key.
      setBoundaryError(null)
      let operation: QueryOperationContext | null = null

      try {
        const convexUrl = convexConfig.url
        if (!convexUrl) throw new Error('[useConvexQuery] Convex URL not configured')
        const currentArgs = getArgs() as FunctionArgs<Query>

        // SSR: one-shot HTTP; never a WebSocket client.
        if (import.meta.server) {
          operation = controller.beginOperation()
          const authToken = fetchAuthToken({
            auth: authMode,
            cookieHeader,
            cachedToken,
          })
          if (authMode !== 'none' && g.cacheIdentity !== 'anonymous' && !authToken) return null
          const result = await executeQueryHttp<RawT>(convexUrl, fnName, currentArgs, authToken)
          if (!controller.isOperationCurrent(operation)) return null
          controller.commitSettled(result, operation)
          return result
        }

        // Client HTTP-only mode (subscribe: false).
        if (!subscribe) {
          operation = controller.beginOperation()
          recordQuery('pending', null, 'client', false)
          const client = selectLiveQueryClient(owner, g)
          let result: RawT
          if (client) {
            result = (await (client.query as (f: unknown, a: unknown) => Promise<unknown>)(
              query,
              currentArgs,
            )) as RawT
          } else {
            const authToken = authMode === 'none' ? undefined : (cachedToken.value ?? undefined)
            result = await executeQueryHttp<RawT>(convexUrl, fnName, currentArgs, authToken)
          }
          if (!controller.isOperationCurrent(operation)) return null
          controller.commitSettled(result, operation)
          recordQuery('success', result, 'client', false)
          return result
        }

        // Client live mode: wait for the first subscription result, with a timer
        // that is cleared on settle so no reject fires after the query resolves.
        operation = controller.setupSubscription()
        const timeoutMs = defaults.waitTimeoutMs
        const pending = controller.firstValue()
        if (!pending) return null
        const first = await new Promise<RawT | null>((resolve, reject) => {
          let done = false
          const timer =
            timeoutMs > 0 && Number.isFinite(timeoutMs)
              ? setTimeout(() => {
                  if (done) return
                  done = true
                  reject(
                    new ConvexCallError({
                      kind: 'transport',
                      code: 'TIMEOUT',
                      message: `[useConvexQuery] Timed out waiting for subscription result after ${timeoutMs}ms`,
                    }),
                  )
                }, timeoutMs)
              : null
          pending.then(
            (v) => {
              if (done) return
              done = true
              if (timer) clearTimeout(timer)
              resolve(v)
            },
            (e) => {
              if (done) return
              done = true
              if (timer) clearTimeout(timer)
              reject(e)
            },
          )
        })
        // Do not re-commit here: `commitLiveResult` already committed the
        // keepPreviousData snapshot with the correct args at emit time. Committing
        // again after this await can mis-tag it if the args changed meanwhile.
        return first
      } catch (rawError) {
        // Normalize exactly once at the query boundary and store in the
        // library-owned error state; resolve `null` data so Nuxt never
        // manufactures an H3Error from a handler rejection .
        if (!operation || !controller.isOperationCurrent(operation)) return null
        const normalized = controller.setOperationError(rawError, operation)
        if (!normalized) return null
        if (import.meta.client && !subscribe) {
          recordQuery('error', null, 'client', false, normalized.message)
        }
        return null
      }
    },
    {
      server,
      lazy: resolveImmediately,
      // Previous data is tagged by the controller and can never cross an
      // identity boundary; otherwise this resolves the configured initial data.
      default: () => controller.defaultValue(),
      deep: false,
    },
  )

  readBoundaryData = () => asyncData.data.value as RawT | null
  writeBoundaryData = (value) => {
    ;(asyncData.data as Ref<RawT | null>).value = value
    triggerRef(asyncData.data)
  }
  clearBoundaryAsyncError = () => {
    ;(asyncData.error as Ref<Error | null | undefined>).value = null
  }
  clearBoundaryData = () => asyncData.clear()

  // ---- client reactivity: identity / args / gate changes ------------------
  if (import.meta.client && currentScope) {
    // Initial live setup.
    if (subscribe) controller.setupSubscription()

    // Synchronous identity-change clearing (architecture invariant): as soon as the
    // effective identity dimension changes, drop this component's now-stale data
    // and previous-data snapshot before acquiring work for the new identity.
    watch(
      () => ({ tag: currentTag.value, key: asyncDataKey.value }),
      (next, prev) => {
        if (!prev) return
        controller.handleIdentityBoundary({
          nextTag: next.tag,
          previousTag: prev.tag,
          previousBoundaryKey: prev.key,
        })
      },
      { flush: 'sync' },
    )

    // Re-key on args / identity / gate transitions: tear down the old listener
    // and re-subscribe / refetch under the new key.
    watch(
      () => ({
        key: asyncDataKey.value,
        live: gate.value.outcome === 'execute' && gate.value.subscribe,
      }),
      (next, prev) => {
        controller.handleExecutionBoundary({
          nextBoundaryKey: next.key,
          previousBoundaryKey: prev.key,
          nextLive: next.live,
          previousLive: prev.live,
        })
      },
    )

    onScopeDispose(() => {
      controller.dispose()
      runtime?.getDevtoolsSink()?.removeQuery(asyncDataKey.value)
    })
  }

  // ---- derived Vue-visible state ------------------------------------------
  const pending = computed((): boolean => {
    const hasData = asyncData.data.value != null
    const hasSettled = asyncData.status.value === 'success' || asyncData.status.value === 'error'
    return computeConvexQueryPending({
      // Genuine idle only — a query waiting for initial auth settlement is
      // pending, not idle.
      isSkipped: gate.value.outcome === 'idle',
      hasData,
      hasSettled,
      server,
      resolveImmediately,
      isServer: import.meta.server,
      isClient: import.meta.client,
      asyncDataPending: asyncData.pending.value,
      isAuthPending: gate.value.outcome === 'wait',
    })
  })

  // Public error reads ONLY the library-owned state, never `asyncData.error`
  // (Nuxt would have H3Error-wrapped a handler rejection there;).
  const error = computed<ConvexCallError | null>(() => liveError.value)

  const status = computed((): ConvexCallStatus => {
    // Genuine idle is skip or a settled `required`-without-identity; while waiting
    // for initial auth settlement the query is pending, not idle.
    const isIdle = gate.value.outcome === 'idle'
    return computeQueryStatus(
      isIdle,
      error.value != null,
      pending.value,
      asyncData.data.value != null,
    )
  })

  const isStale = computed((): boolean =>
    controller.isStale({
      idle: gate.value.outcome === 'idle',
      pending: pending.value,
    }),
  )

  const data = computed<DataT | null>(() => {
    return controller.transformedData()
  })

  const clear = () => {
    controller.clear()
  }

  const resultData: UseConvexQueryData<DataT> = {
    data,
    pending,
    status,
    isStale,
    error,
    refresh: asyncData.refresh,
    clear,
  }

  // ---- terminal-decision awaitability () ------------------------------
  let resolvePromise: Promise<void>
  if (gate.value.outcome === 'idle') {
    // Skip, or a settled-anonymous `required` query: resolve idle immediately
    // without consuming the wait timeout.
    resolvePromise = Promise.resolve()
  } else if (import.meta.server) {
    resolvePromise = server ? asyncData.then(() => {}) : Promise.resolve()
  } else {
    const hasExistingData = asyncData.data.value != null
    if (hasExistingData || resolveImmediately) {
      resolvePromise = Promise.resolve()
    } else if (gate.value.outcome === 'wait') {
      // Wait for initial auth settlement, then for the async data.
      resolvePromise = authCtx.waitForInitialSettlement().then(() => asyncData.refresh())
    } else {
      resolvePromise = asyncData.then(() => {})
    }
  }

  return { resultData, resolvePromise }
}

export async function useConvexQuery<
  Query extends FunctionReference<'query'>,
  Args extends ConvexQueryArgs<FunctionArgs<Query>> = FunctionArgs<Query>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  ...rest: ConvexQueryRest<
    FunctionArgs<Query>,
    MaybeRefOrGetter<ConvexQueryArgs<NoInfer<Args>>>,
    UseConvexQueryOptions<FunctionReturnType<Query>, DataT>
  >
): Promise<UseConvexQueryData<DataT>> {
  const [args, options] = rest
  const { resultData, resolvePromise } = createConvexQueryState(
    query,
    args as MaybeRefOrGetter<ConvexQueryArgs<Args>> | undefined,
    options,
    false,
  )
  await resolvePromise
  return resultData
}
