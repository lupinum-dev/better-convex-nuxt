import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { getFunctionName } from 'convex/server'
import { hash } from 'ohash'
import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
} from 'vue'

import type { ConvexCallError } from './errors'
import type { ClientCallStatus } from './internal/call-state'
import { normalizeConvexArgs, isConvexArgsSkipped } from './internal/query-args'
import { createQueryController, type QueryIsolationTag } from './internal/query-controller'
import { useBetterConvexRuntime } from './runtime-context'

export type ConvexAuthMode = 'required' | 'optional' | 'none'
export type ConvexQuerySkip = 'skip'
export type ConvexQueryArgs<Args> = Args | ConvexQuerySkip | null | undefined

export interface UseConvexQueryOptions<Raw, Data = Raw> {
  subscribe?: boolean
  initialData?: Raw | (() => Raw | undefined)
  transform?: (value: Raw) => Data
  keepPreviousData?: boolean
  auth?: ConvexAuthMode
}

export interface UseConvexQueryResult<Data> {
  data: ComputedRef<Data | null>
  error: ComputedRef<ConvexCallError | null>
  pending: ComputedRef<boolean>
  status: ComputedRef<ClientCallStatus>
  isStale: ComputedRef<boolean>
  refresh(): Promise<void>
  clear(): void
}

type Gate = 'execute' | 'idle' | 'wait' | 'error'

export function useConvexQuery<
  Query extends FunctionReference<'query'>,
  Data = FunctionReturnType<Query>,
>(
  query: Query,
  args?: MaybeRefOrGetter<ConvexQueryArgs<FunctionArgs<Query>>>,
  options?: UseConvexQueryOptions<FunctionReturnType<Query>, Data>,
): UseConvexQueryResult<Data> {
  if (!getCurrentScope()) {
    throw new Error('[better-convex-vue] useConvexQuery must run inside a Vue effect scope')
  }
  type Raw = FunctionReturnType<Query>
  const runtime = useBetterConvexRuntime()
  const auth = options?.auth ?? 'optional'
  const subscribe = options?.subscribe ?? true
  const currentArgs = computed(() => normalizeConvexArgs(args))
  const argsHash = computed(() => hash(currentArgs.value))
  const initial = options?.initialData
  const raw = shallowRef<Raw | null>(
    (typeof initial === 'function' ? (initial as () => Raw | undefined)() : initial) ?? null,
  )
  const boundaryError = shallowRef<ConvexCallError | null>(null)
  const loading = ref(false)
  const identity = runtime.identity.snapshot
  const functionName = getFunctionName(query)

  const gate = computed<Gate>(() => {
    if (isConvexArgsSkipped(currentArgs.value)) return 'idle'
    if (auth === 'none') return 'execute'
    const snapshot = identity.value
    if (!snapshot.authEnabled) return auth === 'required' ? 'idle' : 'execute'
    if (!snapshot.settled) return 'wait'
    if (snapshot.error) return 'error'
    if (snapshot.identityKey === 'anonymous') return auth === 'required' ? 'idle' : 'execute'
    return 'execute'
  })
  const tag = computed<QueryIsolationTag>(() => ({
    identityKey: auth === 'none' ? 'anonymous' : (identity.value.identityKey ?? 'anonymous'),
    identityGeneration: auth === 'none' ? 0 : identity.value.identityGeneration,
  }))
  const boundaryKey = computed(
    () => `${functionName}:${auth}:${tag.value.identityKey}:${argsHash.value}`,
  )

  const controller = createQueryController<Raw, Data>({
    query,
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
    getClient: () =>
      gate.value === 'execute'
        ? (runtime.browser.clientFor(auth) as typeof runtime.browser.handle)
        : null,
    boundary: {
      readData: () => raw.value,
      writeData: (value) => {
        raw.value = value
      },
      clearAsyncError: () => {},
      setError: (error) => {
        boundaryError.value = error
      },
      clearData: () => {
        raw.value = null
      },
    },
    events: {
      onUpdate: () => {
        loading.value = false
      },
      onError: () => {
        loading.value = false
      },
    },
  })

  let previousTag = tag.value
  let previousBoundaryKey = boundaryKey.value
  let previousLive = false

  const reconcile = () => {
    const nextTag = tag.value
    const nextBoundaryKey = boundaryKey.value
    const nextLive = gate.value === 'execute' && subscribe
    const nextIdle = gate.value === 'idle' || gate.value === 'error'
    if (
      nextTag.identityGeneration !== previousTag.identityGeneration ||
      nextTag.identityKey !== previousTag.identityKey
    ) {
      controller.handleIdentityBoundary({ nextTag, previousTag, previousBoundaryKey })
    } else {
      controller.handleExecutionBoundary({
        nextBoundaryKey,
        previousBoundaryKey,
        nextLive,
        previousLive,
        nextIdle,
      })
    }
    previousTag = nextTag
    previousBoundaryKey = nextBoundaryKey
    previousLive = nextLive

    if (gate.value === 'error') {
      boundaryError.value = identity.value.error
      loading.value = false
      return
    }
    if (gate.value === 'wait') {
      loading.value = true
      void runtime.browser.ready().then(reconcile)
      return
    }
    if (gate.value === 'idle') {
      loading.value = false
      boundaryError.value = null
      return
    }
    boundaryError.value = null
    if (subscribe) {
      loading.value = true
      controller.setupSubscription()
      void controller.firstValue()?.catch(() => {})
    } else {
      void refresh()
    }
  }

  async function refresh(): Promise<void> {
    if (gate.value !== 'execute' || isConvexArgsSkipped(currentArgs.value)) return
    const operation = controller.beginOperation()
    loading.value = true
    boundaryError.value = null
    try {
      const value = (await runtime.browser
        .clientFor(auth)
        .query(query, currentArgs.value as FunctionArgs<Query>)) as Raw
      if (!controller.isOperationCurrent(operation)) return
      raw.value = value
      controller.commitSettled(value, operation)
    } catch (error) {
      const normalized = controller.setOperationError(error, operation)
      if (!normalized) return
      boundaryError.value = normalized
    } finally {
      if (controller.isOperationCurrent(operation)) loading.value = false
    }
  }

  const stop = watch(
    [argsHash, gate, () => identity.value.identityGeneration, () => identity.value.authEpoch],
    reconcile,
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => {
    stop()
    loading.value = false
    controller.dispose()
  })

  const data = computed(() => controller.transformedData())
  const error = computed(() => boundaryError.value)
  const pending = computed(() => loading.value)
  const status = computed<ClientCallStatus>(() =>
    loading.value
      ? 'pending'
      : boundaryError.value
        ? 'error'
        : data.value !== null
          ? 'success'
          : 'idle',
  )
  const isStale = computed(() =>
    controller.isStale({ idle: gate.value !== 'execute', pending: loading.value }),
  )

  return {
    data,
    error,
    pending,
    status,
    isStale,
    refresh,
    clear() {
      boundaryError.value = null
      raw.value = null
      controller.clear()
    },
  }
}
