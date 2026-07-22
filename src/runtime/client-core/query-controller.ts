import type { FunctionReference } from 'convex/server'
import { shallowRef } from 'vue'

import { normalizeConvexError, type ConvexCallError } from '../errors'
import type { ConvexIdentityKey } from './identity-key'

export interface QueryIsolationTag {
  identityKey: ConvexIdentityKey
  identityGeneration: number
}

export interface QueryOperationContext extends QueryIsolationTag {
  argsHash: string
  boundaryKey: string
  operationId: number
}

export interface QuerySubscriptionClient {
  onUpdate(
    query: FunctionReference<'query'>,
    args: Record<string, unknown>,
    onValue: (value: unknown) => void,
    onError?: (error: Error) => void,
  ): () => void
}

export interface QueryControllerBoundary<RawT> {
  readData(): RawT | null
  writeData(value: RawT | null): void
  clearAsyncError(): void
  setError(error: ConvexCallError | null, boundaryKey: string): void
  clearData(): void
}

export interface QueryControllerEvent<RawT> {
  onSubscribe?(input: { key: string; args: Record<string, unknown> }): void
  onUpdate?(input: { key: string; args: Record<string, unknown>; value: RawT }): void
  onError?(input: {
    key: string
    args: Record<string, unknown>
    error: Error
    normalized: ConvexCallError
  }): void
  onRemove?(key: string): void
}

export interface CreateQueryControllerInput<RawT, DataT> {
  query: FunctionReference<'query'>
  subscribe: boolean
  keepPreviousData: boolean
  transform?: (value: RawT) => DataT
  initialData?: RawT | (() => RawT | undefined)
  getArgs(): Record<string, unknown> | 'skip'
  getArgsHash(): string
  getBoundaryKey(): string
  getIsolationTag(): QueryIsolationTag
  getClient(): QuerySubscriptionClient | null
  boundary: QueryControllerBoundary<RawT>
  events?: QueryControllerEvent<RawT>
}

export interface QueryController<RawT, DataT> {
  beginOperation(): QueryOperationContext
  invalidateOperations(): void
  isOperationCurrent(operation: QueryOperationContext): boolean
  commitSettled(value: RawT, operation?: QueryOperationContext): void
  setOperationError(error: unknown, operation: QueryOperationContext): ConvexCallError | null
  setupSubscription(): QueryOperationContext | null
  teardownSubscription(): void
  firstValue(): Promise<RawT | null> | null
  defaultValue(): RawT | null
  transformedData(): DataT | null
  isStale(input: { idle: boolean; pending: boolean }): boolean
  handleIdentityBoundary(input: {
    nextTag: QueryIsolationTag
    previousTag: QueryIsolationTag
    previousBoundaryKey: string
  }): void
  handleExecutionBoundary(input: {
    nextBoundaryKey: string
    previousBoundaryKey: string
    nextLive: boolean
    previousLive: boolean
    nextIdle: boolean
  }): void
  clear(): void
  dispose(): void
}

interface FirstValue<RawT> {
  promise: Promise<RawT | null>
  resolve(value: RawT | null): void
  reject(error: unknown): void
}

function sameTag(a: QueryIsolationTag, b: QueryIsolationTag): boolean {
  return a.identityKey === b.identityKey && a.identityGeneration === b.identityGeneration
}

function deferred<RawT>(): FirstValue<RawT> {
  let resolve!: (value: RawT | null) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<RawT | null>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

/**
 * Framework-neutral regular-query lifecycle.
 *
 * It owns one subscription, operation-generation fencing, identity-partitioned
 * previous data, and first-value settlement. Framework adapters own SSR,
 * request credentials, payload storage, and their data-fetching primitive.
 */
export function createQueryController<RawT, DataT = RawT>(
  input: CreateQueryControllerInput<RawT, DataT>,
): QueryController<RawT, DataT> {
  const lastSettledRaw = shallowRef<RawT | null>(null)
  const lastSettledArgsHash = shallowRef<string | null>(null)
  const lastSettledTag = shallowRef<QueryIsolationTag | null>(null)

  let operationRevision = 0
  let unsubscribe: (() => void) | null = null
  let subscribedKey: string | null = null
  let pendingFirstValue: FirstValue<RawT> | null = null
  let disposed = false

  function beginOperation(): QueryOperationContext {
    return {
      ...input.getIsolationTag(),
      argsHash: input.getArgsHash(),
      boundaryKey: input.getBoundaryKey(),
      operationId: operationRevision,
    }
  }

  function invalidateOperations(): void {
    operationRevision += 1
  }

  function isOperationCurrent(operation: QueryOperationContext): boolean {
    return (
      !disposed &&
      operation.operationId === operationRevision &&
      operation.argsHash === input.getArgsHash() &&
      operation.boundaryKey === input.getBoundaryKey() &&
      sameTag(operation, input.getIsolationTag())
    )
  }

  function commitSettled(value: RawT, operation?: QueryOperationContext): void {
    lastSettledRaw.value = value
    lastSettledArgsHash.value = operation?.argsHash ?? input.getArgsHash()
    lastSettledTag.value = operation ?? input.getIsolationTag()
  }

  function teardownSubscription(): void {
    const previousKey = subscribedKey
    unsubscribe?.()
    unsubscribe = null
    pendingFirstValue?.resolve(null)
    pendingFirstValue = null
    subscribedKey = null
    if (previousKey) input.events?.onRemove?.(previousKey)
  }

  function setOperationError(
    error: unknown,
    operation: QueryOperationContext,
  ): ConvexCallError | null {
    if (!isOperationCurrent(operation)) return null
    const normalized = normalizeConvexError(error)
    input.boundary.setError(normalized, operation.boundaryKey)
    return normalized
  }

  function setupSubscription(): QueryOperationContext | null {
    if (disposed || !input.subscribe) return null
    const args = input.getArgs()
    if (args === 'skip') return null

    const key = input.getBoundaryKey()
    if (subscribedKey === key && unsubscribe) return null

    teardownSubscription()
    const client = input.getClient()
    if (!client) return null

    const operation = beginOperation()
    subscribedKey = key
    pendingFirstValue ??= deferred<RawT>()
    unsubscribe = client.onUpdate(
      input.query,
      args,
      (raw) => {
        if (!isOperationCurrent(operation)) return
        const value = raw as RawT
        input.boundary.setError(null, operation.boundaryKey)
        input.boundary.writeData(value)
        commitSettled(value, operation)
        pendingFirstValue?.resolve(value)
        input.events?.onUpdate?.({ key, args, value })
      },
      (error) => {
        if (!isOperationCurrent(operation)) return
        const normalized = normalizeConvexError(error)
        if (input.boundary.readData() == null) {
          input.boundary.setError(normalized, operation.boundaryKey)
        }
        pendingFirstValue?.reject(error)
        input.events?.onError?.({ key, args, error, normalized })
      },
    )
    input.events?.onSubscribe?.({ key, args })
    return operation
  }

  function resetSettled(): void {
    lastSettledRaw.value = null
    lastSettledArgsHash.value = null
    lastSettledTag.value = null
  }

  function handleIdentityBoundary(boundary: {
    nextTag: QueryIsolationTag
    previousTag: QueryIsolationTag
    previousBoundaryKey: string
  }): void {
    if (sameTag(boundary.nextTag, boundary.previousTag)) return
    invalidateOperations()
    teardownSubscription()
    input.boundary.setError(null, boundary.previousBoundaryKey)
    resetSettled()
    input.boundary.writeData(null)
    input.boundary.clearAsyncError()
  }

  function handleExecutionBoundary(boundary: {
    nextBoundaryKey: string
    previousBoundaryKey: string
    nextLive: boolean
    previousLive: boolean
    nextIdle: boolean
  }): void {
    if (
      boundary.nextBoundaryKey === boundary.previousBoundaryKey &&
      boundary.nextLive === boundary.previousLive
    ) {
      return
    }
    input.boundary.setError(null, boundary.previousBoundaryKey)
    if (subscribedKey === boundary.nextBoundaryKey) return
    invalidateOperations()
    teardownSubscription()
    if (boundary.nextIdle) {
      resetSettled()
      input.boundary.clearData()
      input.boundary.clearAsyncError()
      return
    }
    if (boundary.nextLive) setupSubscription()
  }

  function defaultValue(): RawT | null {
    if (
      input.keepPreviousData &&
      lastSettledRaw.value !== null &&
      lastSettledTag.value &&
      sameTag(lastSettledTag.value, input.getIsolationTag())
    ) {
      return lastSettledRaw.value
    }
    const initial =
      typeof input.initialData === 'function'
        ? (input.initialData as () => RawT | undefined)()
        : input.initialData
    return initial == null ? null : initial
  }

  function transformedData(): DataT | null {
    const raw = input.boundary.readData()
    if (raw == null) return null
    return input.transform ? input.transform(raw) : (raw as unknown as DataT)
  }

  function isStale(state: { idle: boolean; pending: boolean }): boolean {
    return (
      input.keepPreviousData &&
      !state.idle &&
      lastSettledRaw.value !== null &&
      lastSettledArgsHash.value !== null &&
      state.pending &&
      input.getArgsHash() !== lastSettledArgsHash.value
    )
  }

  function clear(): void {
    invalidateOperations()
    teardownSubscription()
    input.boundary.setError(null, input.getBoundaryKey())
    resetSettled()
    input.boundary.clearData()
  }

  function dispose(): void {
    if (disposed) return
    invalidateOperations()
    teardownSubscription()
    disposed = true
  }

  return {
    beginOperation,
    invalidateOperations,
    isOperationCurrent,
    commitSettled,
    setOperationError,
    setupSubscription,
    teardownSubscription,
    firstValue: () => pendingFirstValue?.promise ?? null,
    defaultValue,
    transformedData,
    isStale,
    handleIdentityBoundary,
    handleExecutionBoundary,
    clear,
    dispose,
  }
}
