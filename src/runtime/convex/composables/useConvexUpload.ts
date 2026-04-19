import type { FunctionReference } from 'convex/server'

import {
  useConvexUpload as useRuntimeConvexUpload,
  type UploadProgressInfo,
  type UploadQueueEnqueueInput,
  type UploadQueueEnqueueItem,
  type UploadQueueItem,
  type UploadQueueItemStatus,
  type UploadStatus,
  type UseConvexUploadOptions,
  type UseConvexUploadReturn,
  useUploadQueue,
  useUploadSingle,
} from '../upload/upload-runtime.js'

export type {
  UploadProgressInfo,
  UploadQueueEnqueueInput,
  UploadQueueEnqueueItem,
  UploadQueueItem,
  UploadQueueItemStatus,
  UploadStatus,
  UseConvexUploadOptions,
  UseConvexUploadReturn,
}
export { useUploadQueue, useUploadSingle }

/**
 * Upload composable for client-side file workflows.
 *
 * Use this when the app generates upload URLs through a Convex mutation and
 * needs queue state, progress tracking, cancellation, and retry-safe item
 * bookkeeping in one place.
 *
 * Prefer `useUploadQueue()` or `useUploadSingle()` only when you need the
 * lower-level queue primitives directly.
 *
 * @example
 * ```ts
 * const upload = useConvexUpload(api.files.generateUploadUrl, { maxConcurrent: 3 })
 * ```
 */
export function useConvexUpload<Mutation extends FunctionReference<'mutation'>>(
  generateUploadUrlMutation: Mutation,
  options?: UseConvexUploadOptions,
): UseConvexUploadReturn<Mutation> {
  return useRuntimeConvexUpload<Mutation>(generateUploadUrlMutation, options)
}
