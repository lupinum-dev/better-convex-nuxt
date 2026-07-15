import type { FunctionArgs, FunctionReference } from 'convex/server'
import { computed, getCurrentScope, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue'

import { normalizeConvexError, type CallResult, type ConvexCallError } from '../errors'
import { normalizeMaxConcurrent } from '../utils/config-defaults'
import { getConvexRuntimeConfig } from '../utils/runtime-config'
import { uploadFileViaXhr, requestUploadUrl } from '../utils/upload-core'
import {
  computeUploadQueueAggregateProgress,
  countUploadQueueItems,
  normalizeUploadQueueEnqueueInput,
  type UploadQueueItem,
  type UploadQueueEnqueueInput,
} from '../utils/upload-queue-state'
import { useConvex } from './useConvex'

export type {
  UploadQueueEnqueueInput,
  UploadQueueEnqueueItem,
  UploadQueueItem,
  UploadQueueItemStatus,
} from '../utils/upload-queue-state'

export interface UseConvexUploadQueueOptions<Mutation extends FunctionReference<'mutation'>> {
  maxConcurrent?: number
  continueOnError?: boolean
  onItemSuccess?: (item: UploadQueueItem<FunctionArgs<Mutation>>) => void
  onItemError?: (item: UploadQueueItem<FunctionArgs<Mutation>>) => void
  onQueueIdle?: (items: UploadQueueItem<FunctionArgs<Mutation>>[]) => void
}

export interface UseConvexUploadQueueReturn<Mutation extends FunctionReference<'mutation'>> {
  items: Ref<UploadQueueItem<FunctionArgs<Mutation>>[]>
  isRunning: ComputedRef<boolean>
  hasErrors: ComputedRef<boolean>
  queuedCount: ComputedRef<number>
  pendingCount: ComputedRef<number>
  successCount: ComputedRef<number>
  errorCount: ComputedRef<number>
  cancelledCount: ComputedRef<number>
  aggregateProgress: ComputedRef<number>
  enqueue: (
    input: UploadQueueEnqueueInput<FunctionArgs<Mutation>>,
    mutationArgs?: FunctionArgs<Mutation>,
  ) => Promise<string[]>
  enqueueSafe: (
    input: UploadQueueEnqueueInput<FunctionArgs<Mutation>>,
    mutationArgs?: FunctionArgs<Mutation>,
  ) => Promise<CallResult<string[]>>
  cancelItem: (id: string) => void
  cancelAll: () => void
  clearFinished: () => void
  reset: () => void
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

interface UploadQueueRuntime {
  controller: AbortController | null
  deferred: Deferred<string>
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function isUploadAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function useConvexUploadQueue<Mutation extends FunctionReference<'mutation'>>(
  generateUploadUrlMutation: Mutation,
  options?: UseConvexUploadQueueOptions<Mutation>,
): UseConvexUploadQueueReturn<Mutation> {
  type MutationArgs = FunctionArgs<Mutation>
  type QueueItem = UploadQueueItem<MutationArgs>

  const convexConfig = getConvexRuntimeConfig()
  const client = useConvex()

  const maxConcurrent = normalizeMaxConcurrent(
    options?.maxConcurrent ?? convexConfig.upload.maxConcurrent,
  )
  const continueOnError = options?.continueOnError ?? true

  const items = ref<QueueItem[]>([])
  const haltedByError = ref(false)
  const runtimeById = new Map<string, UploadQueueRuntime>()
  let queueItemSequence = 0
  let scheduling = false
  let hasBeenBusy = false

  const createQueueItemId = (): string => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
    queueItemSequence += 1
    return `upload-item-${Date.now()}-${queueItemSequence}`
  }

  const queuedCount = computed(() => countUploadQueueItems(items.value, 'queued'))
  const pendingCount = computed(() => countUploadQueueItems(items.value, 'pending'))
  const successCount = computed(() => countUploadQueueItems(items.value, 'success'))
  const errorCount = computed(() => countUploadQueueItems(items.value, 'error'))
  const cancelledCount = computed(() => countUploadQueueItems(items.value, 'cancelled'))

  const isRunning = computed(
    () => pendingCount.value > 0 || (!haltedByError.value && queuedCount.value > 0),
  )

  const hasErrors = computed(() => errorCount.value > 0)

  const aggregateProgress = computed(() => computeUploadQueueAggregateProgress(items.value))

  const mutateItem = (id: string, updater: (item: QueueItem) => QueueItem): QueueItem | null => {
    let updated: QueueItem | null = null
    items.value = items.value.map((item) => {
      if (item.id !== id) return item
      updated = updater(item)
      return updated
    })
    return updated
  }

  const maybeEmitQueueIdle = () => {
    if (isRunning.value) {
      hasBeenBusy = true
      return
    }

    if (!hasBeenBusy) return
    hasBeenBusy = false
    options?.onQueueIdle?.([...items.value])
  }

  const rejectQueuedDeferredsAfterHalt = () => {
    // Settle still-queued items to 'cancelled' (not just reject their deferreds).
    // Leaving them 'queued' let a later enqueue() reset haltedByError and hand
    // them straight back to schedule(), silently resuming uploads the caller
    // was already told (via the rejected promise) had failed.
    const now = Date.now()
    items.value = items.value.map((item) => {
      if (item.status !== 'queued') return item
      rejectItemDeferred(item.id, new Error('Upload queue halted after an upload error'))
      return {
        ...item,
        status: 'cancelled',
        finishedAt: now,
      }
    })
  }

  const getItemRuntime = (id: string): UploadQueueRuntime => {
    const existing = runtimeById.get(id)
    if (existing) return existing
    const created = { controller: null, deferred: createDeferred<string>() }
    runtimeById.set(id, created)
    return created
  }

  const resolveItemDeferred = (id: string, storageId: string) => {
    const runtime = runtimeById.get(id)
    if (!runtime) return
    runtimeById.delete(id)
    runtime.deferred.resolve(storageId)
  }

  const rejectItemDeferred = (id: string, error: unknown) => {
    const runtime = runtimeById.get(id)
    if (!runtime) return
    runtimeById.delete(id)
    runtime.deferred.reject(error)
  }

  const runItem = async (itemId: string): Promise<void> => {
    const controller = new AbortController()
    getItemRuntime(itemId).controller = controller
    mutateItem(itemId, (item) => ({
      ...item,
      status: 'pending',
      startedAt: Date.now(),
      error: null,
    }))

    try {
      const item = items.value.find((entry) => entry.id === itemId)
      if (!item) {
        rejectItemDeferred(itemId, new Error('Upload item no longer exists'))
        return
      }

      const postUrl = await requestUploadUrl(
        client,
        generateUploadUrlMutation,
        (item.mutationArgs ?? {}) as MutationArgs,
      )

      const storageId = await uploadFileViaXhr(postUrl, item.file, {
        signal: controller.signal,
        onProgress: (progressInfo) => {
          mutateItem(itemId, (current) => ({
            ...current,
            progress: progressInfo.percent,
            loadedBytes: progressInfo.loaded,
            totalBytes: progressInfo.total > 0 ? progressInfo.total : current.totalBytes,
          }))
        },
      })

      const successItem = mutateItem(itemId, (current) => ({
        ...current,
        status: 'success',
        storageId,
        progress: 100,
        loadedBytes: current.totalBytes,
        error: null,
        finishedAt: Date.now(),
      }))
      if (successItem) options?.onItemSuccess?.(successItem)
      resolveItemDeferred(itemId, storageId)
    } catch (error) {
      const now = Date.now()
      if (isUploadAbortError(error)) {
        mutateItem(itemId, (current) => ({
          ...current,
          status: 'cancelled',
          error: null,
          finishedAt: now,
        }))
        rejectItemDeferred(itemId, new Error('Upload cancelled'))
      } else {
        const normalizedError = normalizeConvexError(error)
        const erroredItem = mutateItem(itemId, (current) => ({
          ...current,
          status: 'error',
          error: normalizedError,
          finishedAt: now,
        }))
        if (erroredItem) options?.onItemError?.(erroredItem)
        rejectItemDeferred(itemId, normalizedError)

        if (!continueOnError) {
          haltedByError.value = true
          rejectQueuedDeferredsAfterHalt()
        }
      }
    } finally {
      const runtime = runtimeById.get(itemId)
      if (runtime) runtime.controller = null
      void schedule()
      maybeEmitQueueIdle()
    }
  }

  const schedule = async (): Promise<void> => {
    if (scheduling) return
    scheduling = true

    try {
      while (!haltedByError.value) {
        const activeCount = [...runtimeById.values()].filter((runtime) => runtime.controller).length
        if (activeCount >= maxConcurrent) break
        const nextQueued = items.value.find((item) => item.status === 'queued')
        if (!nextQueued) break
        void runItem(nextQueued.id)
      }
    } finally {
      scheduling = false
      maybeEmitQueueIdle()
    }
  }

  const enqueue = async (
    input: UploadQueueEnqueueInput<MutationArgs>,
    mutationArgs?: MutationArgs,
  ): Promise<string[]> => {
    const entries = normalizeUploadQueueEnqueueInput(input, mutationArgs)
    if (entries.length === 0) return []

    if (haltedByError.value && pendingCount.value === 0) {
      haltedByError.value = false
    }

    const now = Date.now()
    const newItems: QueueItem[] = entries.map((entry) => ({
      id: createQueueItemId(),
      file: entry.file,
      mutationArgs: entry.mutationArgs,
      status: 'queued',
      progress: 0,
      loadedBytes: 0,
      totalBytes: entry.file.size,
      error: null,
      createdAt: now,
      startedAt: null,
      finishedAt: null,
    }))

    items.value = [...items.value, ...newItems]
    for (const item of newItems) {
      getItemRuntime(item.id)
    }
    void schedule()

    const settled = await Promise.allSettled(
      newItems.map((item) => getItemRuntime(item.id).deferred.promise),
    )

    const storageIds: string[] = []
    const failures: ConvexCallError[] = []

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        storageIds.push(result.value)
      } else {
        failures.push(normalizeConvexError(result.reason))
      }
    }

    if (failures.length > 0) {
      if (failures.length === 1) {
        throw failures[0]
      }
      throw new AggregateError(failures, `${failures.length} uploads failed`)
    }

    return storageIds
  }

  const enqueueSafe = async (
    input: UploadQueueEnqueueInput<MutationArgs>,
    mutationArgs?: MutationArgs,
  ): Promise<CallResult<string[]>> => {
    try {
      return { ok: true, data: await enqueue(input, mutationArgs) }
    } catch (error) {
      return { ok: false, error: normalizeConvexError(error) }
    }
  }

  const cancelItem = (id: string): void => {
    const runtime = runtimeById.get(id)
    if (runtime?.controller) {
      runtime.controller.abort()
      return
    }

    mutateItem(id, (item) => {
      if (item.status !== 'queued') return item
      rejectItemDeferred(id, new Error('Upload cancelled'))
      return {
        ...item,
        status: 'cancelled',
        finishedAt: Date.now(),
      }
    })

    void schedule()
    maybeEmitQueueIdle()
  }

  const cancelAll = (): void => {
    const now = Date.now()
    items.value = items.value.map((item) => {
      if (item.status === 'queued') {
        rejectItemDeferred(item.id, new Error('Upload cancelled'))
        return {
          ...item,
          status: 'cancelled',
          finishedAt: now,
        }
      }
      return item
    })

    for (const runtime of runtimeById.values()) {
      runtime.controller?.abort()
    }
    maybeEmitQueueIdle()
  }

  const clearFinished = (): void => {
    items.value = items.value.filter(
      (item) => item.status !== 'success' && item.status !== 'error' && item.status !== 'cancelled',
    )
  }

  const reset = (): void => {
    for (const runtime of runtimeById.values()) {
      runtime.deferred.reject(new Error('Upload queue was reset'))
      runtime.controller?.abort()
    }
    runtimeById.clear()
    haltedByError.value = false
    items.value = []
    maybeEmitQueueIdle()
  }

  const currentScope = getCurrentScope()
  if (currentScope) {
    onScopeDispose(() => {
      reset()
    })
  }

  return {
    items,
    isRunning,
    hasErrors,
    queuedCount,
    pendingCount,
    successCount,
    errorCount,
    cancelledCount,
    aggregateProgress,
    enqueue,
    enqueueSafe,
    cancelItem,
    cancelAll,
    clearFinished,
    reset,
  }
}
