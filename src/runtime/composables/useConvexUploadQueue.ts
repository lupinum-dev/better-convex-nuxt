import type { FunctionArgs, FunctionReference } from 'convex/server'
import { computed, getCurrentScope, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue'

import { toCallResult, type CallResult } from '../utils/call-result'
import { getConvexRuntimeConfig } from '../utils/runtime-config'
import { uploadFileViaXhr, requestUploadUrl } from '../utils/upload-core'
import { useConvex } from './useConvex'

export type UploadQueueItemStatus = 'queued' | 'pending' | 'success' | 'error' | 'cancelled'

export interface UploadQueueItem<MutationArgs = Record<string, unknown>> {
  id: string
  file: File
  mutationArgs?: MutationArgs
  status: UploadQueueItemStatus
  progress: number
  loadedBytes: number
  totalBytes: number
  storageId?: string
  error: Error | null
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
}

export interface UploadQueueEnqueueItem<MutationArgs = Record<string, unknown>> {
  file: File
  mutationArgs?: MutationArgs
}

export type UploadQueueEnqueueInput<MutationArgs = Record<string, unknown>> =
  | File
  | File[]
  | FileList
  | UploadQueueEnqueueItem<MutationArgs>[]

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

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let queueItemSequence = 1

function createQueueItemId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  queueItemSequence += 1
  return `upload-item-${Date.now()}-${queueItemSequence}`
}

function normalizeMaxConcurrent(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 3
  const normalized = Math.trunc(value)
  return normalized > 0 ? normalized : 1
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
  const activeById = new Map<string, AbortController>()
  const completionById = new Map<string, Deferred<string>>()
  let scheduling = false
  let hasBeenBusy = false

  const queuedCount = computed(() => items.value.filter((item) => item.status === 'queued').length)
  const pendingCount = computed(
    () => items.value.filter((item) => item.status === 'pending').length,
  )
  const successCount = computed(
    () => items.value.filter((item) => item.status === 'success').length,
  )
  const errorCount = computed(() => items.value.filter((item) => item.status === 'error').length)
  const cancelledCount = computed(
    () => items.value.filter((item) => item.status === 'cancelled').length,
  )

  const isRunning = computed(
    () => pendingCount.value > 0 || (!haltedByError.value && queuedCount.value > 0),
  )

  const hasErrors = computed(() => errorCount.value > 0)

  const aggregateProgress = computed(() => {
    if (items.value.length === 0) return 0

    let totalBytes = 0
    let uploadedBytes = 0

    for (const item of items.value) {
      const itemTotal = Math.max(0, item.totalBytes || item.file.size || 0)
      totalBytes += itemTotal

      if (item.status === 'queued') continue
      if (item.status === 'success') {
        uploadedBytes += itemTotal
        continue
      }

      uploadedBytes += Math.max(0, Math.min(item.loadedBytes, itemTotal || item.loadedBytes))
    }

    if (totalBytes <= 0) {
      const hasWork = items.value.some(
        (item) => item.status === 'queued' || item.status === 'pending',
      )
      return hasWork ? 0 : 100
    }

    return Math.min(100, Math.floor((uploadedBytes / totalBytes) * 100))
  })

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
    for (const item of items.value) {
      if (item.status === 'queued') {
        rejectItemDeferred(item.id, new Error('Upload queue halted after an upload error'))
      }
    }
  }

  const getItemDeferred = (id: string): Deferred<string> => {
    const existing = completionById.get(id)
    if (existing) return existing
    const created = createDeferred<string>()
    completionById.set(id, created)
    return created
  }

  const resolveItemDeferred = (id: string, storageId: string) => {
    const deferred = completionById.get(id)
    if (!deferred) return
    completionById.delete(id)
    deferred.resolve(storageId)
  }

  const rejectItemDeferred = (id: string, error: unknown) => {
    const deferred = completionById.get(id)
    if (!deferred) return
    completionById.delete(id)
    deferred.reject(error)
  }

  const runItem = async (itemId: string): Promise<void> => {
    const controller = new AbortController()
    activeById.set(itemId, controller)
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
        const normalizedError = error instanceof Error ? error : new Error(String(error))
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
      activeById.delete(itemId)
      void schedule()
      maybeEmitQueueIdle()
    }
  }

  const schedule = async (): Promise<void> => {
    if (scheduling) return
    scheduling = true

    try {
      while (!haltedByError.value) {
        if (activeById.size >= maxConcurrent) break
        const nextQueued = items.value.find((item) => item.status === 'queued')
        if (!nextQueued) break
        void runItem(nextQueued.id)
      }
    } finally {
      scheduling = false
      maybeEmitQueueIdle()
    }
  }

  const normalizeEnqueueInput = (
    input: UploadQueueEnqueueInput<MutationArgs>,
    mutationArgs?: MutationArgs,
  ): UploadQueueEnqueueItem<MutationArgs>[] => {
    const hasFileCtor = typeof File !== 'undefined'

    if (hasFileCtor && input instanceof File) {
      return [{ file: input, mutationArgs }]
    }

    if (typeof FileList !== 'undefined' && input instanceof FileList) {
      return Array.from(input).map((file) => ({ file, mutationArgs }))
    }

    if (!Array.isArray(input)) {
      throw new TypeError('Unsupported upload queue input')
    }

    if (input.length === 0) return []

    if (hasFileCtor && input[0] instanceof File) {
      return (input as File[]).map((file) => ({ file, mutationArgs }))
    }

    return (input as UploadQueueEnqueueItem<MutationArgs>[]).map((entry) => {
      if (!(entry.file instanceof File)) {
        throw new TypeError('Upload queue item must include a valid File')
      }
      return {
        file: entry.file,
        mutationArgs: entry.mutationArgs ?? mutationArgs,
      }
    })
  }

  const enqueue = async (
    input: UploadQueueEnqueueInput<MutationArgs>,
    mutationArgs?: MutationArgs,
  ): Promise<string[]> => {
    const entries = normalizeEnqueueInput(input, mutationArgs)
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
    void schedule()

    const settled = await Promise.allSettled(
      newItems.map((item) => getItemDeferred(item.id).promise),
    )

    const storageIds: string[] = []
    const failures: Error[] = []

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        storageIds.push(result.value)
      } else {
        failures.push(
          result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
        )
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
    return await toCallResult(() => enqueue(input, mutationArgs))
  }

  const cancelItem = (id: string): void => {
    const controller = activeById.get(id)
    if (controller) {
      controller.abort()
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

    for (const controller of activeById.values()) {
      controller.abort()
    }
    maybeEmitQueueIdle()
  }

  const clearFinished = (): void => {
    items.value = items.value.filter(
      (item) => item.status !== 'success' && item.status !== 'error' && item.status !== 'cancelled',
    )
  }

  const reset = (): void => {
    for (const [id, deferred] of completionById.entries()) {
      deferred.reject(new Error('Upload queue was reset'))
      completionById.delete(id)
    }
    for (const controller of activeById.values()) {
      controller.abort()
    }
    activeById.clear()
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
