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
} from './internal/upload-runtime.js'

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

export function useConvexUpload<Mutation extends FunctionReference<'mutation'>>(
  generateUploadUrlMutation: Mutation,
  options?: UseConvexUploadOptions,
): UseConvexUploadReturn<Mutation> {
  return useRuntimeConvexUpload<Mutation>(generateUploadUrlMutation, options)
}
