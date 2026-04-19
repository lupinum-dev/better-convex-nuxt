import type { FunctionArgs, FunctionReference } from 'convex/server'
import { computed, getCurrentScope, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue'

import { useRuntimeConfig } from '#imports'

import { createRuntimeObserver } from '../../observability/runtime-observer.js'
import { DEFAULT_UPLOAD_MAX_CONCURRENT } from '../../utils/constants.js'
import { isFileTypeAllowed } from '../../utils/mime-type.js'
import { useConvex } from '../composables/useConvex.js'
import { getFunctionName } from '../shared/convex-cache.js'
import { getConvexRuntimeConfig } from '../shared/runtime-config.js'
import { requestUploadUrl, uploadFileViaXhr, type UploadProgressInfo } from './upload-core.js'
import {
  applyUploadQueueProgress,
  cancelQueuedUploadItems,
  clearFinishedUploadItems,
  collectUploadQueueResults,
  createUploadQueueItems,
  deriveUploadQueueSummary,
  getNextQueuedUploadItem,
  markUploadQueueItemPending,
  normalizeMaxConcurrent,
  settleUploadQueueItemCancelled,
  settleUploadQueueItemError,
  settleUploadQueueItemSuccess,
  shouldResetUploadQueueHalt,
  type UploadQueueEnqueueStateItem,
  type UploadQueueStateItemStatus,
  type UploadQueueStateItemBase,
  updateUploadQueueItem,
} from './upload-queue-state.js'

export type { UploadProgressInfo } from './upload-core.js'

export type UploadStatus = 'idle' | 'pending' | 'success' | 'error'
export type UploadQueueItemStatus = UploadQueueStateItemStatus

export interface UploadQueueItem<MutationArgs = unknown> extends UploadQueueStateItemBase {
  id: string
  file: File
  mutationArgs?: MutationArgs
  storageId?: string
}

export type UploadQueueEnqueueItem<MutationArgs = unknown> =
  UploadQueueEnqueueStateItem<MutationArgs>

export type UploadQueueEnqueueInput<MutationArgs = unknown> =
  | File
  | File[]
  | FileList
  | UploadQueueEnqueueItem<MutationArgs>[]

export interface UseConvexUploadOptions {
  maxConcurrent?: number
  continueOnError?: boolean
  allowedTypes?: string[]
  maxSizeBytes?: number
  onSuccess?: (storageId: string, file: File) => void
  onError?: (error: Error, file: File) => void
  onProgress?: (info: UploadProgressInfo, file: File) => void
  onQueueIdle?: () => void
}

export interface UseConvexUploadReturn<Mutation extends FunctionReference<'mutation'>> {
  (input: File | File[], mutationArgs?: FunctionArgs<Mutation>): Promise<string | string[]>
  upload: (
    input: File | File[],
    mutationArgs?: FunctionArgs<Mutation>,
  ) => Promise<string | string[]>
  data: Ref<string | undefined>
  status: ComputedRef<UploadStatus>
  pending: ComputedRef<boolean>
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

export function useUploadSingle<Mutation extends FunctionReference<'mutation'>>(
  generateUploadUrlMutation: Mutation,
  options?: UseConvexUploadOptions,
): UseConvexSingleUploadReturn<Mutation> {
  const config = useRuntimeConfig()
  const logger = createRuntimeObserver(config.public.convex ?? {}, { transport: 'browser' })
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

  const summary = computed(() => deriveUploadQueueSummary(items.value, haltedByError.value))
  const queuedCount = computed(() => summary.value.queuedCount)
  const pendingCount = computed(() => summary.value.pendingCount)
  const successCount = computed(() => summary.value.successCount)
  const errorCount = computed(() => summary.value.errorCount)
  const cancelledCount = computed(() => summary.value.cancelledCount)
  const isRunning = computed(() => summary.value.isRunning)
  const hasErrors = computed(() => summary.value.hasErrors)
  const aggregateProgress = computed(() => summary.value.aggregateProgress)

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
    items.value = markUploadQueueItemPending(items.value, itemId, Date.now())

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
        onProgress: (info) => {
          items.value = applyUploadQueueProgress(items.value, itemId, info)
        },
      })

      const { items: nextItems, updated: successItem } = settleUploadQueueItemSuccess(
        items.value,
        itemId,
        storageId,
        Date.now(),
      )
      items.value = nextItems
      if (successItem) options.onSuccess?.(storageId, successItem.file)
      resolveItemDeferred(itemId, storageId)
    } catch (err) {
      const now = Date.now()
      if (err instanceof DOMException && err.name === 'AbortError') {
        items.value = settleUploadQueueItemCancelled(items.value, itemId, now).items
        rejectItemDeferred(itemId, new Error('Upload cancelled'))
      } else {
        const normalizedError = err instanceof Error ? err : new Error(String(err))
        const { items: nextItems, updated: erroredItem } = settleUploadQueueItemError(
          items.value,
          itemId,
          normalizedError,
          now,
        )
        items.value = nextItems
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
        const nextQueued = getNextQueuedUploadItem(items.value)
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

    if (shouldResetUploadQueueHalt(haltedByError.value, pendingCount.value)) {
      haltedByError.value = false
    }

    const newItems = createUploadQueueItems<MutationArgs, QueueItem>(
      entries,
      Date.now(),
      createQueueItemId,
    )

    items.value = [...items.value, ...newItems]
    void schedule()

    const settled = await Promise.allSettled(
      newItems.map((item) => getItemDeferred(item.id).promise),
    )
    const { storageIds, failures } = collectUploadQueueResults(settled)

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
    const { items: nextItems, updated } = updateUploadQueueItem(items.value, id, (item) => {
      if (item.status !== 'queued') return item as QueueItem
      rejectItemDeferred(id, new Error('Upload cancelled'))
      return {
        ...item,
        status: 'cancelled',
        finishedAt: Date.now(),
      }
    })
    items.value = nextItems
    if (!updated || updated.status !== 'cancelled') return
    void schedule()
    maybeEmitQueueIdle()
  }

  const cancelAll = (): void => {
    const { items: nextItems, cancelledIds } = cancelQueuedUploadItems(items.value, Date.now())
    items.value = nextItems
    for (const id of cancelledIds) {
      rejectItemDeferred(id, new Error('Upload cancelled'))
    }
    for (const controller of activeById.values()) {
      controller.abort()
    }
    maybeEmitQueueIdle()
  }

  const clearFinished = (): void => {
    items.value = clearFinishedUploadItems(items.value)
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
      const latestQueueError = [...queue.items.value].reverse().find((item) => item.error)?.error
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
