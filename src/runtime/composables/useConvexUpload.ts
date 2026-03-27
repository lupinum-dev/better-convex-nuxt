import type { FunctionArgs, FunctionReference } from 'convex/server'
import { computed, getCurrentScope, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue'

import { useRuntimeConfig } from '#imports'

import { DEFAULT_UPLOAD_MAX_CONCURRENT } from '../utils/constants'
import { getFunctionName } from '../utils/convex-cache'
import { getSharedLogger, getLogLevel } from '../utils/logger'
import { isFileTypeAllowed } from '../utils/mime-type'
import { requestUploadUrl, uploadFileViaXhr, type UploadProgressInfo } from '../utils/upload-core'
import { getConvexRuntimeConfig } from '../utils/runtime-config'
import { useConvex } from './useConvex'

export type { UploadProgressInfo } from '../utils/upload-core'

/** Upload status for single-file mode */
export type UploadStatus = 'idle' | 'pending' | 'success' | 'error'

/** Status of an individual item in queue mode */
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

export interface UseConvexUploadOptions {
  /** When set, enables queue mode with this many concurrent uploads */
  maxConcurrent?: number
  /** In queue mode: continue processing after an item errors (default: true) */
  continueOnError?: boolean
  /** Allowed MIME types. Files not matching are rejected. Supports wildcards like `image/*`. */
  allowedTypes?: string[]
  /** Maximum file size in bytes. Files exceeding this are rejected. */
  maxSizeBytes?: number
  /** Called when a file uploads successfully */
  onSuccess?: (storageId: string, file: File) => void
  /** Called when an upload errors */
  onError?: (error: Error, file: File) => void
  /** Called for progress updates during upload */
  onProgress?: (info: UploadProgressInfo, file: File) => void
  /** Queue mode: called when all queued uploads finish */
  onQueueIdle?: () => void
}

export interface UseConvexUploadReturn<Mutation extends FunctionReference<'mutation'>> {
  (
    input: File | File[],
    mutationArgs?: FunctionArgs<Mutation>,
  ): Promise<string | string[]>
  upload: (
    input: File | File[],
    mutationArgs?: FunctionArgs<Mutation>,
  ) => Promise<string | string[]>
  /** storageId from the last successful single-file upload */
  data: Ref<string | undefined>
  status: ComputedRef<UploadStatus>
  pending: ComputedRef<boolean>
  /** Single-file progress or aggregate queue progress (0-100). */
  progress: ComputedRef<number>
  error: Readonly<Ref<Error | null>>
  items: Ref<UploadQueueItem<FunctionArgs<Mutation>>[]>
  cancelItem: (id: string) => void
  cancelAll: () => void
  clearFinished: () => void
  reset: () => void
}

export interface UseConvexSingleUploadReturn<Mutation extends FunctionReference<'mutation'>> {
  upload: (file: File, mutationArgs?: FunctionArgs<Mutation>) => Promise<string>
  data: Ref<string | undefined>
  status: ComputedRef<UploadStatus>
  pending: ComputedRef<boolean>
  progress: Ref<number>
  error: Ref<Error | null>
  reset: () => void
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
  cancelItem: (id: string) => void
  cancelAll: () => void
  clearFinished: () => void
  reset: () => void
}

// ─── Single-file implementation ────────────────────────────────────────────

/** @internal */
export function useUploadSingle<Mutation extends FunctionReference<'mutation'>>(
  generateUploadUrlMutation: Mutation,
  options?: UseConvexUploadOptions,
): UseConvexSingleUploadReturn<Mutation> {
  const config = useRuntimeConfig()
  const logger = getSharedLogger(getLogLevel(config.public.convex ?? {}))
  const fnName = getFunctionName(generateUploadUrlMutation)
  const client = useConvex()

  const _status = ref<UploadStatus>('idle')
  const error = ref<Error | null>(null) as Ref<Error | null>
  const data = ref<string | undefined>(undefined) as Ref<string | undefined>
  const progress = ref(0)

  let currentAbortController: AbortController | null = null

  const status = computed(() => _status.value)
  const pending = computed(() => _status.value === 'pending')

  const reset = () => {
    if (currentAbortController) {
      currentAbortController.abort()
      currentAbortController = null
    }
    _status.value = 'idle'
    error.value = null
    data.value = undefined
    progress.value = 0
  }

  const currentScope = getCurrentScope()
  if (currentScope) {
    onScopeDispose(() => {
      currentAbortController?.abort()
      currentAbortController = null
    })
  }

  const upload = async (file: File, mutationArgs?: FunctionArgs<Mutation>): Promise<string> => {
    const startTime = Date.now()

    if (currentAbortController) {
      const err = new Error('Upload already in progress for this composable instance')
      _status.value = 'error'
      error.value = err
      throw err
    }

    if (options?.maxSizeBytes && file.size > options.maxSizeBytes) {
      const err = new Error(
        `File size ${file.size} bytes exceeds maximum ${options.maxSizeBytes} bytes`,
      )
      _status.value = 'error'
      error.value = err
      options.onError?.(err, file)
      throw err
    }

    if (options?.allowedTypes && !isFileTypeAllowed(file.type, options.allowedTypes)) {
      const err = new Error(
        `File type "${file.type}" not allowed. Allowed: ${options.allowedTypes.join(', ')}`,
      )
      _status.value = 'error'
      error.value = err
      options.onError?.(err, file)
      throw err
    }

    _status.value = 'pending'
    error.value = null
    progress.value = 0

    try {
      const postUrl = await requestUploadUrl(
        client,
        generateUploadUrlMutation,
        (mutationArgs ?? {}) as FunctionArgs<Mutation>,
      )

      const controller = new AbortController()
      currentAbortController = controller
      const storageId = await uploadFileViaXhr(postUrl, file, {
        signal: controller.signal,
        onProgress: (info) => {
          progress.value = info.percent
          options?.onProgress?.(info, file)
        },
      })

      _status.value = 'success'
      data.value = storageId

      logger.upload({
        name: fnName,
        event: 'success',
        filename: file.name,
        size: file.size,
        duration: Date.now() - startTime,
      })

      options?.onSuccess?.(storageId, file)
      return storageId
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw e
      }

      const err = e instanceof Error ? e : new Error(String(e))
      _status.value = 'error'
      error.value = err

      logger.upload({
        name: fnName,
        event: 'error',
        filename: file.name,
        size: file.size,
        duration: Date.now() - startTime,
        error: err,
      })

      options?.onError?.(err, file)
      throw err
    } finally {
      currentAbortController = null
    }
  }

  return { upload, data, status, pending, progress, error, reset }
}

// ─── Queue implementation ─────────────────────────────────────────────────

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

function normalizeMaxConcurrent(value: number): number {
  if (!Number.isFinite(value)) return 3
  const n = Math.trunc(value)
  return n > 0 ? n : 1
}

/** @internal */
export function useUploadQueue<Mutation extends FunctionReference<'mutation'>>(
  generateUploadUrlMutation: Mutation,
  options: UseConvexUploadOptions & { maxConcurrent: number },
): UseConvexUploadQueueReturn<Mutation> {
  type MutationArgs = FunctionArgs<Mutation>
  type QueueItem = UploadQueueItem<MutationArgs>

  const convexConfig = getConvexRuntimeConfig()
  const client = useConvex()

  const maxConcurrent = normalizeMaxConcurrent(
    options.maxConcurrent ?? convexConfig.upload.maxConcurrent,
  )
  const continueOnError = options.continueOnError ?? true

  const items = ref<QueueItem[]>([])
  const haltedByError = ref(false)
  const activeById = new Map<string, AbortController>()
  const completionById = new Map<string, Deferred<string>>()
  let scheduling = false
  let hasBeenBusy = false

  const queuedCount = computed(() => items.value.filter((i) => i.status === 'queued').length)
  const pendingCount = computed(() => items.value.filter((i) => i.status === 'pending').length)
  const successCount = computed(() => items.value.filter((i) => i.status === 'success').length)
  const errorCount = computed(() => items.value.filter((i) => i.status === 'error').length)
  const cancelledCount = computed(() => items.value.filter((i) => i.status === 'cancelled').length)

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
      return items.value.some((i) => i.status === 'queued' || i.status === 'pending') ? 0 : 100
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
    options.onQueueIdle?.()
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

  const rejectQueuedDeferredsAfterHalt = () => {
    for (const item of items.value) {
      if (item.status === 'queued') {
        rejectItemDeferred(item.id, new Error('Upload queue halted after an upload error'))
      }
    }
  }

  const runItem = async (itemId: string): Promise<void> => {
    const controller = new AbortController()
    activeById.set(itemId, controller)
    mutateItem(itemId, (item) => ({ ...item, status: 'pending', startedAt: Date.now(), error: null }))

    try {
      const item = items.value.find((e) => e.id === itemId)
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
        onProgress: (info) => {
          mutateItem(itemId, (cur) => ({
            ...cur,
            progress: info.percent,
            loadedBytes: info.loaded,
            totalBytes: info.total > 0 ? info.total : cur.totalBytes,
          }))
        },
      })

      const successItem = mutateItem(itemId, (cur) => ({
        ...cur,
        status: 'success',
        storageId,
        progress: 100,
        loadedBytes: cur.totalBytes,
        error: null,
        finishedAt: Date.now(),
      }))
      if (successItem) options.onSuccess?.(storageId, successItem.file)
      resolveItemDeferred(itemId, storageId)
    } catch (err) {
      const now = Date.now()
      if (err instanceof DOMException && err.name === 'AbortError') {
        mutateItem(itemId, (cur) => ({ ...cur, status: 'cancelled', error: null, finishedAt: now }))
        rejectItemDeferred(itemId, new Error('Upload cancelled'))
      } else {
        const normalizedError = err instanceof Error ? err : new Error(String(err))
        const erroredItem = mutateItem(itemId, (cur) => ({
          ...cur,
          status: 'error',
          error: normalizedError,
          finishedAt: now,
        }))
        if (erroredItem) options.onError?.(normalizedError, erroredItem.file)
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
    if (hasFileCtor && input instanceof File) return [{ file: input, mutationArgs }]
    if (typeof FileList !== 'undefined' && input instanceof FileList) {
      return Array.from(input).map((file) => ({ file, mutationArgs }))
    }
    if (!Array.isArray(input)) throw new TypeError('Unsupported upload queue input')
    if (input.length === 0) return []
    if (hasFileCtor && input[0] instanceof File) {
      return (input as File[]).map((file) => ({ file, mutationArgs }))
    }
    return (input as UploadQueueEnqueueItem<MutationArgs>[]).map((entry) => {
      if (!(entry.file instanceof File)) {
        throw new TypeError('Upload queue item must include a valid File')
      }
      return { file: entry.file, mutationArgs: entry.mutationArgs ?? mutationArgs }
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
        failures.push(result.reason instanceof Error ? result.reason : new Error(String(result.reason)))
      }
    }

    if (failures.length > 0) {
      throw failures.length === 1
        ? failures[0]
        : new AggregateError(failures, `${failures.length} uploads failed`)
    }

    return storageIds
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
      return { ...item, status: 'cancelled', finishedAt: Date.now() }
    })
    void schedule()
    maybeEmitQueueIdle()
  }

  const cancelAll = (): void => {
    const now = Date.now()
    items.value = items.value.map((item) => {
      if (item.status === 'queued') {
        rejectItemDeferred(item.id, new Error('Upload cancelled'))
        return { ...item, status: 'cancelled', finishedAt: now }
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
    cancelItem,
    cancelAll,
    clearFinished,
    reset,
  }
}

export function useConvexUpload<Mutation extends FunctionReference<'mutation'>>(
  generateUploadUrlMutation: Mutation,
  options?: UseConvexUploadOptions,
): UseConvexUploadReturn<Mutation> {
  type MutationArgs = FunctionArgs<Mutation>

  const single = useUploadSingle(generateUploadUrlMutation, options)
  const queue = useUploadQueue(generateUploadUrlMutation, {
    ...options,
    maxConcurrent: options?.maxConcurrent ?? DEFAULT_UPLOAD_MAX_CONCURRENT,
  })

  const mode = ref<'idle' | 'single' | 'queue'>('idle')
  const progress = computed(() =>
    mode.value === 'queue' ? queue.aggregateProgress.value : single.progress.value,
  )
  const pending = computed(() =>
    mode.value === 'queue' ? queue.isRunning.value : single.pending.value,
  )
  const status = computed<UploadStatus>(() => {
    if (mode.value === 'queue') {
      if (queue.isRunning.value) return 'pending'
      if (queue.errorCount.value > 0) return 'error'
      if (queue.successCount.value > 0) return 'success'
      return 'idle'
    }
    return single.status.value
  })
  const error = computed(() => {
    if (mode.value === 'queue') {
      const latestQueueError = [...queue.items.value]
        .reverse()
        .find((item) => item.error)?.error
      return latestQueueError ?? null
    }
    return single.error.value
  })
  const reset = () => {
    single.reset()
    queue.reset()
    mode.value = 'idle'
  }

  const upload = async (
    input: File | File[],
    mutationArgs?: MutationArgs,
  ): Promise<string | string[]> => {
    if (Array.isArray(input)) {
      mode.value = 'queue'
      single.reset()
      return await queue.enqueue(input, mutationArgs)
    }

    mode.value = 'single'
    queue.reset()
    return await single.upload(input, mutationArgs)
  }

  const callable = ((input: File | File[], mutationArgs?: MutationArgs) =>
    upload(input, mutationArgs)) as UseConvexUploadReturn<Mutation>

  callable.upload = upload
  callable.data = single.data
  callable.status = status
  callable.pending = pending
  callable.progress = progress
  callable.error = error as Readonly<Ref<Error | null>>
  callable.items = queue.items
  callable.cancelItem = queue.cancelItem
  callable.cancelAll = queue.cancelAll
  callable.clearFinished = queue.clearFinished
  callable.reset = reset

  return callable
}
