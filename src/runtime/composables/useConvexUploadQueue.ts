import type { FunctionReference } from 'convex/server'

import {
  useUploadQueue,
  type UseConvexUploadQueueReturn,
  type UseConvexUploadOptions,
  type UploadQueueItem,
  type UploadQueueItemStatus,
  type UploadQueueEnqueueInput,
  type UploadQueueEnqueueItem,
  type UploadProgressInfo,
} from './useConvexUpload'

export type {
  UseConvexUploadQueueReturn,
  UploadQueueItem,
  UploadQueueItemStatus,
  UploadQueueEnqueueInput,
  UploadQueueEnqueueItem,
  UploadProgressInfo,
}

export interface UseConvexUploadQueueOptions extends Omit<UseConvexUploadOptions, 'maxConcurrent'> {
  /**
   * Maximum number of uploads to process concurrently.
   * @default 3
   */
  maxConcurrent?: number
}

/**
 * Composable for batching multiple file uploads to Convex storage.
 *
 * Manages a concurrent upload queue with per-item progress tracking, error handling,
 * and aggregate state. Files are enqueued and processed up to `maxConcurrent` at a time.
 *
 * For single-file uploads, use `useConvexFileUpload`.
 *
 * @param generateUploadUrlMutation - A Convex mutation that returns an upload URL
 * @param options - Queue configuration
 * @returns Queue state and control functions
 *
 * @example
 * ```vue
 * <script setup>
 * const queue = useConvexUploadQueue(api.files.generateUploadUrl, { maxConcurrent: 3 })
 *
 * async function handleFiles(files: FileList) {
 *   const ids = await queue.enqueue(files)
 *   console.log('Uploaded:', ids)
 * }
 * </script>
 *
 * <template>
 *   <input type="file" multiple @change="e => handleFiles(e.target.files)" />
 *   <div v-for="item in queue.items.value" :key="item.id">
 *     {{ item.file.name }}: {{ item.status }} ({{ item.progress }}%)
 *   </div>
 *   <div>Overall: {{ queue.aggregateProgress.value }}%</div>
 * </template>
 * ```
 */
export function useConvexUploadQueue<Mutation extends FunctionReference<'mutation'>>(
  generateUploadUrlMutation: Mutation,
  options?: UseConvexUploadQueueOptions,
): UseConvexUploadQueueReturn<Mutation> {
  return useUploadQueue(generateUploadUrlMutation, {
    ...options,
    maxConcurrent: options?.maxConcurrent ?? 3,
  })
}
