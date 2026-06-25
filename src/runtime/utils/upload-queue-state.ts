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

export function normalizeUploadQueueEnqueueInput<MutationArgs>(
  input: UploadQueueEnqueueInput<MutationArgs>,
  mutationArgs?: MutationArgs,
): UploadQueueEnqueueItem<MutationArgs>[] {
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

export function countUploadQueueItems(
  items: readonly UploadQueueItem[],
  status: UploadQueueItemStatus,
): number {
  return items.reduce((count, item) => count + (item.status === status ? 1 : 0), 0)
}

export function computeUploadQueueAggregateProgress(items: readonly UploadQueueItem[]): number {
  if (items.length === 0) return 0

  let totalBytes = 0
  let uploadedBytes = 0

  for (const item of items) {
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
    const hasWork = items.some((item) => item.status === 'queued' || item.status === 'pending')
    return hasWork ? 0 : 100
  }

  return Math.min(100, Math.floor((uploadedBytes / totalBytes) * 100))
}
