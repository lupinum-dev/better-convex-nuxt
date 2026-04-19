import type { UploadProgressInfo } from './upload-core.js'

export type UploadQueueStateItemStatus = 'queued' | 'pending' | 'success' | 'error' | 'cancelled'

export interface UploadQueueStateItemBase {
  id: string
  file: { size: number }
  status: UploadQueueStateItemStatus
  progress: number
  loadedBytes: number
  totalBytes: number
  storageId?: string
  error: Error | null
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
}

export interface UploadQueueSummary {
  queuedCount: number
  pendingCount: number
  successCount: number
  errorCount: number
  cancelledCount: number
  isRunning: boolean
  hasErrors: boolean
  aggregateProgress: number
}

export interface UploadQueueEnqueueStateItem<MutationArgs = unknown> {
  file: File
  mutationArgs?: MutationArgs
}

export function normalizeMaxConcurrent(value: number): number {
  if (!Number.isFinite(value)) return 3
  const n = Math.trunc(value)
  return n > 0 ? n : 1
}

export function deriveUploadQueueSummary<T extends UploadQueueStateItemBase>(
  items: T[],
  haltedByError: boolean,
): UploadQueueSummary {
  let queuedCount = 0
  let pendingCount = 0
  let successCount = 0
  let errorCount = 0
  let cancelledCount = 0

  if (items.length === 0) {
    return {
      queuedCount,
      pendingCount,
      successCount,
      errorCount,
      cancelledCount,
      isRunning: false,
      hasErrors: false,
      aggregateProgress: 0,
    }
  }

  let totalBytes = 0
  let uploadedBytes = 0
  let hasQueuedOrPending = false

  for (const item of items) {
    switch (item.status) {
      case 'queued':
        queuedCount += 1
        hasQueuedOrPending = true
        break
      case 'pending':
        pendingCount += 1
        hasQueuedOrPending = true
        break
      case 'success':
        successCount += 1
        break
      case 'error':
        errorCount += 1
        break
      case 'cancelled':
        cancelledCount += 1
        break
    }

    const itemTotal = Math.max(0, item.totalBytes || item.file.size || 0)
    totalBytes += itemTotal

    if (item.status === 'queued') continue
    if (item.status === 'success') {
      uploadedBytes += itemTotal
      continue
    }

    uploadedBytes += Math.max(0, Math.min(item.loadedBytes, itemTotal || item.loadedBytes))
  }

  const aggregateProgress =
    totalBytes <= 0
      ? hasQueuedOrPending
        ? 0
        : 100
      : Math.min(100, Math.floor((uploadedBytes / totalBytes) * 100))

  return {
    queuedCount,
    pendingCount,
    successCount,
    errorCount,
    cancelledCount,
    isRunning: pendingCount > 0 || (!haltedByError && queuedCount > 0),
    hasErrors: errorCount > 0,
    aggregateProgress,
  }
}

export function createUploadQueueItems<
  MutationArgs,
  TItem extends UploadQueueStateItemBase & {
    file: File
    mutationArgs?: MutationArgs
  },
>(
  entries: UploadQueueEnqueueStateItem<MutationArgs>[],
  now: number,
  createId: () => string,
): TItem[] {
  return entries.map((entry) => ({
    id: createId(),
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
  })) as TItem[]
}

export function updateUploadQueueItem<T extends UploadQueueStateItemBase>(
  items: T[],
  id: string,
  updater: (item: T) => T,
): { items: T[]; updated: T | null } {
  let updated: T | null = null
  return {
    items: items.map((item) => {
      if (item.id !== id) return item
      updated = updater(item)
      return updated
    }),
    updated,
  }
}

export function markUploadQueueItemPending<T extends UploadQueueStateItemBase>(
  items: T[],
  id: string,
  startedAt: number,
): T[] {
  return updateUploadQueueItem(items, id, (item) => ({
    ...item,
    status: 'pending',
    startedAt,
    error: null,
  })).items
}

export function applyUploadQueueProgress<T extends UploadQueueStateItemBase>(
  items: T[],
  id: string,
  info: UploadProgressInfo,
): T[] {
  return updateUploadQueueItem(items, id, (item) => ({
    ...item,
    progress: info.percent,
    loadedBytes: info.loaded,
    totalBytes: info.total > 0 ? info.total : item.totalBytes,
  })).items
}

export function settleUploadQueueItemSuccess<T extends UploadQueueStateItemBase>(
  items: T[],
  id: string,
  storageId: string,
  finishedAt: number,
): { items: T[]; updated: T | null } {
  return updateUploadQueueItem(items, id, (item) => ({
    ...item,
    status: 'success',
    storageId,
    progress: 100,
    loadedBytes: item.totalBytes,
    error: null,
    finishedAt,
  }))
}

export function settleUploadQueueItemError<T extends UploadQueueStateItemBase>(
  items: T[],
  id: string,
  error: Error,
  finishedAt: number,
): { items: T[]; updated: T | null } {
  return updateUploadQueueItem(items, id, (item) => ({
    ...item,
    status: 'error',
    error,
    finishedAt,
  }))
}

export function settleUploadQueueItemCancelled<T extends UploadQueueStateItemBase>(
  items: T[],
  id: string,
  finishedAt: number,
): { items: T[]; updated: T | null } {
  return updateUploadQueueItem(items, id, (item) => ({
    ...item,
    status: 'cancelled',
    error: null,
    finishedAt,
  }))
}

export function cancelQueuedUploadItems<T extends UploadQueueStateItemBase>(
  items: T[],
  finishedAt: number,
): { items: T[]; cancelledIds: string[] } {
  const cancelledIds: string[] = []
  return {
    items: items.map((item) => {
      if (item.status !== 'queued') {
        return item
      }
      cancelledIds.push(item.id)
      return {
        ...item,
        status: 'cancelled',
        finishedAt,
      }
    }),
    cancelledIds,
  }
}

export function clearFinishedUploadItems<T extends UploadQueueStateItemBase>(items: T[]): T[] {
  return items.filter(
    (item) => item.status !== 'success' && item.status !== 'error' && item.status !== 'cancelled',
  )
}

export function getNextQueuedUploadItem<T extends UploadQueueStateItemBase>(items: T[]): T | null {
  return items.find((item) => item.status === 'queued') ?? null
}

export function shouldResetUploadQueueHalt(haltedByError: boolean, pendingCount: number): boolean {
  return haltedByError && pendingCount === 0
}

export function collectUploadQueueResults(settled: PromiseSettledResult<string>[]): {
  storageIds: string[]
  failures: Error[]
} {
  const storageIds: string[] = []
  const failures: Error[] = []

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      storageIds.push(result.value)
      continue
    }
    failures.push(result.reason instanceof Error ? result.reason : new Error(String(result.reason)))
  }

  return { storageIds, failures }
}
