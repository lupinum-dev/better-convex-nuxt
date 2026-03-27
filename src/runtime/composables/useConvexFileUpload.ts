import type { FunctionReference } from 'convex/server'

import {
  useUploadSingle,
  type UseConvexSingleUploadReturn,
  type UseConvexUploadOptions,
  type UploadStatus,
  type UploadProgressInfo,
} from './useConvexUpload'

export type { UseConvexSingleUploadReturn, UploadStatus, UploadProgressInfo }

export type UseConvexFileUploadOptions = Omit<UseConvexUploadOptions, 'maxConcurrent' | 'onQueueIdle' | 'continueOnError'>

let hasWarnedUseConvexFileUpload = false

/**
 * Composable for single-file uploads to Convex storage.
 *
 * Handles the full upload lifecycle: requesting an upload URL, uploading via XHR
 * with progress tracking, and running a mutation to finalize the upload.
 *
 * For uploading multiple files concurrently, use `useConvexUploadQueue`.
 *
 * @param generateUploadUrlMutation - A Convex mutation that returns an upload URL
 * @param options - Optional upload configuration
 * @returns Upload state and control functions
 *
 * @example
 * ```vue
 * <script setup>
 * const { upload, pending, progress, data: storageId, error } =
 *   useConvexFileUpload(api.files.generateUploadUrl)
 *
 * async function handleFile(file: File) {
 *   const id = await upload(file)
 *   console.log('Uploaded:', id)
 * }
 * </script>
 *
 * <template>
 *   <input type="file" @change="e => handleFile(e.target.files[0])" :disabled="pending" />
 *   <div v-if="pending">{{ progress }}%</div>
 *   <img v-if="storageId" :src="getUrl(storageId)" />
 * </template>
 * ```
 */
export function useConvexFileUpload<Mutation extends FunctionReference<'mutation'>>(
  generateUploadUrlMutation: Mutation,
  options?: UseConvexFileUploadOptions,
): UseConvexSingleUploadReturn<Mutation> {
  if (import.meta.dev && !hasWarnedUseConvexFileUpload) {
    hasWarnedUseConvexFileUpload = true
    console.warn(
      '[better-convex-nuxt] `useConvexFileUpload` is deprecated. Prefer `useConvexUpload`.',
    )
  }
  return useUploadSingle(generateUploadUrlMutation, options)
}
