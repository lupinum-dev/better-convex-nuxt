import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server'
import {
  computed,
  watch,
  triggerRef,
  onScopeDispose,
  getCurrentScope,
  ref,
  type Ref,
  type ComputedRef,
  type MaybeRefOrGetter,
} from 'vue'

import { useNuxtApp, useRequestEvent, useAsyncData, useState } from '#imports'

import type { QueryDataSource, QueryStatus } from '../devtools/types'
import { readConvexRuntimeContext } from '../runtime-context'
import type { ConvexQueryRest } from '../utils/args-tuple'
import type { ConvexAuthMode } from '../utils/auth-status'
import { ConvexCallError, normalizeConvexError } from '../utils/call-result'
import { assertConvexComposableScope } from '../utils/composable-scope'
import {
  getFunctionName,
  hashArgs,
  createConvexQueryKey,
  computeQueryStatus,
  fetchAuthToken,
  withAuthDimension,
  type ConvexCallStatus,
} from '../utils/convex-cache'
import type { ConvexIdentityKey } from '../utils/identity-key'
import { createLogger } from '../utils/logger'
import { isConvexArgsSkipped, normalizeConvexArgs } from '../utils/query-args'
import { executeQueryHttp } from '../utils/query-execution'
import { createQueryExecutionGate } from '../utils/query-execution-gate'
import { createConvexQueryAuthContext, selectLiveQueryClient } from '../utils/query-foundation'
import { computeConvexQueryPending, computeConvexQueryStale } from '../utils/query-state'
import { getConvexRuntimeConfig } from '../utils/runtime-config'

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
   * Per-query authentication mode (vNext §5.2).
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

interface IsolationTag {
  identityKey: ConvexIdentityKey
  identityGeneration: number
}

function sameTag(a: IsolationTag, b: IsolationTag): boolean {
  return a.identityKey === b.identityKey && a.identityGeneration === b.identityGeneration
}

/**
 * Build the mounted regular-query state (internal §7.3). Each instance owns one
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
  const owner = readConvexRuntimeContext(nuxtApp)?.owner

  const defaults = convexConfig.defaults
  const server = options?.server ?? defaults.server
  const subscribe = options?.subscribe ?? defaults.subscribe
  const authMode: ConvexAuthMode = options?.auth ?? 'optional'
  const keepPreviousData = options?.keepPreviousData ?? false

  const fnName = getFunctionName(query)

  const logger = owner?.logger ?? createLogger(convexConfig.logging)

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

  // Isolation tag for the current identity dimension (internal §7.3). `none`
  // keys under a stable anonymous transport epoch that never changes on auth
  // transitions; every other mode carries the concrete identity + generation.
  const currentTag = computed<IsolationTag>(() => {
    if (authMode === 'none') return { identityKey: 'anonymous', identityGeneration: 0 }
    return {
      identityKey: gate.value.cacheIdentity,
      identityGeneration: authCtx.identityGeneration.value,
    }
  })

  // Identity-partitioned async-data / payload key. A new identity yields a new
  // key, so B never reads A's payload (structural isolation, no token keys).
  const asyncDataKey = computed((): string => {
    if (gate.value.resolveAsIdle) return `convex:idle:${fnName}`
    const base = createConvexQueryKey(query, getArgs() as FunctionArgs<Query>)
    return withAuthDimension(base, authMode, gate.value.cacheIdentity)
  })

  const applyTransform = (raw: RawT): DataT =>
    options?.transform ? options.transform(raw) : (raw as unknown as DataT)
  const resolveInitialData = (): RawT | undefined => {
    const initialData = options?.initialData
    return typeof initialData === 'function'
      ? (initialData as () => RawT | undefined)()
      : initialData
  }

  // keepPreviousData snapshot, tagged so it never crosses an identity boundary.
  const lastSettledRaw = ref<RawT | null>(null)
  const lastSettledArgsHash = ref<string | null>(null)
  const lastSettledTag = ref<IsolationTag | null>(null)

  const commitLastSettled = (raw: RawT) => {
    lastSettledRaw.value = raw
    lastSettledArgsHash.value = argsHash.value
    lastSettledTag.value = currentTag.value
  }

  const event = import.meta.server ? useRequestEvent() : null
  const cookieHeader = event?.headers.get('cookie') || ''
  const cachedToken = useState<string | null>('convex:token', () => null)

  const currentScope = import.meta.client ? getCurrentScope() : undefined
  assertConvexComposableScope('useConvexQuery', import.meta.client, currentScope)

  // Library-owned, identity-partitioned error state (vNext §7, internal §7.3,
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
  const setBoundaryError = (err: ConvexCallError | null) => {
    const key = asyncDataKey.value
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

  // ---- single composable-owned live subscription --------------------------
  let liveUnsub: (() => void) | null = null
  let liveKey: string | null = null
  let firstValue: {
    promise: Promise<RawT>
    resolve: (v: RawT) => void
    reject: (e: unknown) => void
  } | null = null

  function makeDeferred() {
    let resolve!: (v: RawT) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<RawT>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  function teardownLive() {
    const previousKey = liveKey
    if (liveUnsub) {
      liveUnsub()
      liveUnsub = null
    }
    liveKey = null
    if (previousKey) owner?.getDevtoolsSink()?.removeQuery(previousKey)
  }

  function recordQuery(
    queryStatus: QueryStatus,
    data: unknown,
    dataSource: QueryDataSource,
    hasSubscription: boolean,
    queryError?: string,
  ) {
    const currentArgs = getArgs()
    if (currentArgs === 'skip') return
    owner?.getDevtoolsSink()?.upsertQuery({
      id: asyncDataKey.value,
      name: fnName,
      args: currentArgs,
      status: queryStatus,
      dataSource,
      data,
      error: queryError,
      hasSubscription,
      options: { immediate: resolveImmediately, server, subscribe, auth: authMode },
    })
  }

  function commitLiveResult(raw: RawT, tag: IsolationTag): boolean {
    // Reject a stale-generation commit: a WebSocket result captured under a
    // superseded identity generation must not commit after the switch (§5.4).
    if (!sameTag(tag, currentTag.value)) return false
    setBoundaryError(null)
    ;(asyncData.data as Ref<RawT | null>).value = raw
    commitLastSettled(raw)
    triggerRef(asyncData.data)
    firstValue?.resolve(raw)
    return true
  }

  function commitLiveError(err: Error, tag: IsolationTag): boolean {
    if (!sameTag(tag, currentTag.value)) return false
    // Only surface an error while there is no data to keep showing. A live
    // subscription failure is normalized once at this boundary (§9.2): a
    // reconnectable socket disconnect is connection state, not a call error, so
    // Convex only invokes this path for a genuine query failure.
    if (asyncData.data.value == null) setBoundaryError(normalizeConvexError(err))
    firstValue?.reject(err)
    return true
  }

  function setupSubscription() {
    if (!import.meta.client || !subscribe) return
    if (!gate.value.setupLiveSubscription) return
    const currentArgs = getArgs()
    if (currentArgs == null || currentArgs === 'skip') return

    const key = asyncDataKey.value
    if (liveKey === key && liveUnsub) return

    teardownLive()

    const client = selectLiveQueryClient(owner, gate.value)
    if (!client) return

    const tag = currentTag.value
    liveKey = key
    firstValue = firstValue ?? makeDeferred()

    const unsubscribe = (
      client.onUpdate as (
        q: unknown,
        a: unknown,
        cb: (r: unknown) => void,
        onErr?: (e: Error) => void,
      ) => () => void
    )(
      query,
      currentArgs,
      (result: unknown) => {
        if (!commitLiveResult(result as RawT, tag)) return
        logger.query({
          name: fnName,
          event: 'update',
          count: Array.isArray(result) ? result.length : 1,
          args: currentArgs,
        })
        recordQuery('success', result, 'websocket', true)
      },
      (err: Error) => {
        if (!commitLiveError(err, tag)) return
        logger.query({ name: fnName, event: 'error', error: err })
        recordQuery('error', null, 'websocket', true, err.message)
      },
    )
    liveUnsub = unsubscribe
    logger.query({ name: fnName, event: 'subscribe', args: currentArgs })
    recordQuery('pending', null, 'websocket', true)
  }

  // ---- Nuxt useAsyncData: SSR + hydration + first client result -----------
  const asyncData = useAsyncData<RawT | null, Error>(
    asyncDataKey,
    async () => {
      const g = gate.value
      if (g.resolveAsIdle) return null
      if (g.waitForAuth) return null
      // Auth resolution failed without a usable identity: surface it through the
      // composable-owned error state, never by throwing (H3Error wrap hazard).
      if (g.surfaceAuthError) {
        setBoundaryError(
          authCtx.error.value ??
            new ConvexCallError({ kind: 'authentication', message: 'Authentication error' }),
        )
        return null
      }

      // A fresh fetch attempt clears any prior boundary error for this key.
      setBoundaryError(null)

      try {
        const convexUrl = convexConfig.url
        if (!convexUrl) throw new Error('[useConvexQuery] Convex URL not configured')
        const currentArgs = getArgs() as FunctionArgs<Query>

        // SSR: one-shot HTTP; never a WebSocket client.
        if (import.meta.server) {
          const authToken = fetchAuthToken({ auth: authMode, cookieHeader, cachedToken })
          if (authMode !== 'none' && g.cacheIdentity !== 'anonymous' && !authToken) return null
          const result = await executeQueryHttp<RawT>(convexUrl, fnName, currentArgs, authToken)
          commitLastSettled(result)
          return result
        }

        // Client HTTP-only mode (subscribe: false).
        if (!subscribe) {
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
          commitLastSettled(result)
          recordQuery('success', result, 'client', false)
          return result
        }

        // Client live mode: wait for the first subscription result, with a timer
        // that is cleared on settle so no reject fires after the query resolves.
        firstValue = makeDeferred()
        setupSubscription()
        const timeoutMs = defaults.waitTimeoutMs
        const pending = firstValue
        const first = await new Promise<RawT>((resolve, reject) => {
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
          pending.promise.then(
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
        // manufactures an H3Error from a handler rejection (vNext §7).
        const normalized = normalizeConvexError(rawError)
        setBoundaryError(normalized)
        if (import.meta.client && !subscribe) {
          recordQuery('error', null, 'client', false, normalized.message)
        }
        return null
      }
    },
    {
      server,
      lazy: resolveImmediately,
      default: () => {
        // keepPreviousData never crosses an identity boundary: only reuse when
        // the retained snapshot is tagged with the current identity.
        if (
          keepPreviousData &&
          lastSettledRaw.value !== null &&
          lastSettledTag.value &&
          sameTag(lastSettledTag.value, currentTag.value)
        ) {
          return lastSettledRaw.value
        }
        const fallbackRaw = resolveInitialData()
        return fallbackRaw == null ? null : fallbackRaw
      },
      deep: false,
    },
  )

  // ---- client reactivity: identity / args / gate changes ------------------
  if (import.meta.client && currentScope) {
    // Initial live setup.
    if (subscribe) setupSubscription()

    // Synchronous identity-change clearing (internal §7.4): as soon as the
    // effective identity dimension changes, drop this component's now-stale data
    // and previous-data snapshot before acquiring work for the new identity.
    watch(
      () => currentTag.value,
      (next, prev) => {
        if (prev && !sameTag(next, prev)) {
          teardownLive()
          setBoundaryError(null)
          lastSettledRaw.value = null
          lastSettledArgsHash.value = null
          lastSettledTag.value = null
          // Nuxt keeps `asyncData.data` across a key change until the next fetch
          // resolves; clear it synchronously so A's value is never visible under
          // B (keepPreviousData must not cross an identity boundary).
          ;(asyncData.data as Ref<RawT | null>).value = null
          ;(asyncData.error as Ref<Error | null | undefined>).value = null
          firstValue = null
        }
      },
      { flush: 'sync' },
    )

    // Re-key on args / identity / gate transitions: tear down the old listener
    // and re-subscribe / refetch under the new key.
    watch(
      () => ({ key: asyncDataKey.value, live: gate.value.setupLiveSubscription }),
      (next, prev) => {
        if (next.key === prev.key && next.live === prev.live) return
        teardownLive()
        firstValue = null
        if (next.live) setupSubscription()
      },
    )

    onScopeDispose(() => {
      teardownLive()
      owner?.getDevtoolsSink()?.removeQuery(asyncDataKey.value)
    })
  }

  // ---- derived Vue-visible state ------------------------------------------
  const pending = computed((): boolean => {
    const hasData = asyncData.data.value != null
    const hasSettled = asyncData.status.value === 'success' || asyncData.status.value === 'error'
    return computeConvexQueryPending({
      // Genuine idle only — a query waiting for initial auth settlement is
      // pending, not idle.
      isSkipped: gate.value.resolveAsIdle && !gate.value.waitForAuth,
      hasData,
      hasSettled,
      server,
      resolveImmediately,
      isServer: import.meta.server,
      isClient: import.meta.client,
      asyncDataPending: asyncData.pending.value,
      isAuthPending: gate.value.waitForAuth,
    })
  })

  // Public error reads ONLY the library-owned state, never `asyncData.error`
  // (Nuxt would have H3Error-wrapped a handler rejection there; §7.3).
  const error = computed<ConvexCallError | null>(() => liveError.value)

  const status = computed((): ConvexCallStatus => {
    // Genuine idle is skip or a settled `required`-without-identity; while waiting
    // for initial auth settlement the query is pending, not idle.
    const isIdle = gate.value.resolveAsIdle && !gate.value.waitForAuth
    return computeQueryStatus(
      isIdle,
      error.value != null,
      pending.value,
      asyncData.data.value != null,
    )
  })

  const isStale = computed((): boolean =>
    computeConvexQueryStale({
      keepPreviousData,
      isSkipped: gate.value.resolveAsIdle,
      hasLastSettledData: lastSettledRaw.value !== null,
      hasLastSettledArgsHash: lastSettledArgsHash.value !== null,
      pending: pending.value,
      argsHash: argsHash.value,
      lastSettledArgsHash: lastSettledArgsHash.value,
    }),
  )

  const data = computed<DataT | null>(() => {
    const raw = asyncData.data.value
    return raw == null ? null : applyTransform(raw as RawT)
  })

  const clear = () => {
    teardownLive()
    setBoundaryError(null)
    lastSettledRaw.value = null
    lastSettledArgsHash.value = null
    lastSettledTag.value = null
    asyncData.clear()
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

  // ---- terminal-decision awaitability (§5.5) ------------------------------
  let resolvePromise: Promise<void>
  if (gate.value.resolveAsIdle) {
    // Skip, or a settled-anonymous `required` query: resolve idle immediately
    // without consuming the wait timeout.
    resolvePromise = Promise.resolve()
  } else if (import.meta.server) {
    resolvePromise = server ? asyncData.then(() => {}) : Promise.resolve()
  } else {
    const hasExistingData = asyncData.data.value != null
    if (hasExistingData || resolveImmediately) {
      resolvePromise = Promise.resolve()
    } else if (gate.value.waitForAuth) {
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
