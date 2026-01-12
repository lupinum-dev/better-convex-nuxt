/**
 * File upload composable for Convex storage.
 *
 * Inspired by nuxt-convex by @onmax (https://github.com/onmax/nuxt-convex)
 */

import type { FunctionArgs, FunctionReference } from 'convex/server'
import { ref, computed, onScopeDispose, type Ref, type ComputedRef } from 'vue'
import { useRuntimeConfig } from '#imports'

import { getFunctionName } from '../utils/convex-cache'
import { createModuleLogger, getLoggingOptions, createTimer } from '../utils/logger'
import type { OperationCompleteEvent } from '../utils/logger'
import { isFileTypeAllowed } from '../utils/mime-type'
import { useConvex } from './useConvex'

/**
 * Upload status representing the current state of the upload
 * - 'idle': not yet called or reset
 * - 'pending': upload in progress
 * - 'success': upload completed successfully
 * - 'error': upload failed
 */
export type UploadStatus = 'idle' | 'pending' | 'success' | 'error'

/**
 * Return value from useConvexFileUpload
 */
export interface UseConvexFileUploadReturn<
  Mutation extends FunctionReference<'mutation'>,
> {
  /**
   * Upload a file. Returns the storageId on success.
   * Automatically tracks status, error, progress, and data.
   * Throws on error (use try/catch or check error ref after).
   *
   * @param file - The file to upload
   * @param mutationArgs - Optional args to pass to the generateUploadUrl mutation
   */
  upload: (file: File, mutationArgs?: FunctionArgs<Mutation>) => Promise<string>

  /**
   * StorageId from the last successful upload.
   * undefined if upload hasn't succeeded yet.
   */
  data: Ref<string | undefined>

  /**
   * Upload status for explicit state management.
   */
  status: ComputedRef<UploadStatus>

  /**
   * True when upload is in progress.
   * Equivalent to status === 'pending'.
   */
  pending: ComputedRef<boolean>

  /**
   * Upload progress from 0 to 100.
   * Only updated during pending state.
   */
  progress: Ref<number>

  /**
   * Error from the last upload attempt.
   * null if no error or upload hasn't been called.
   */
  error: Ref<Error | null>

  /**
   * Cancel any in-progress upload and reset state.
   * Aborts XHR, clears error, data, and progress.
   */
  cancel: () => void
}

/**
 * Options for useConvexFileUpload
 */
export interface UseConvexFileUploadOptions {
  /**
   * Callback when upload completes successfully.
   */
  onSuccess?: (storageId: string, file: File) => void
  /**
   * Callback when an error occurs.
   */
  onError?: (error: Error, file: File) => void
  /**
   * Maximum file size in bytes.
   * Files exceeding this size will be rejected before upload starts.
   * @example 5 * 1024 * 1024 // 5MB
   */
  maxSize?: number
  /**
   * Allowed MIME types.
   * Files not matching these types will be rejected before upload starts.
   *
   * Supports wildcards: `image/*` matches any image type, `video/*` matches any video, etc.
   *
   * @example ['image/jpeg', 'image/png'] // Exact types only
   * @example ['image/*'] // Any image type
   * @example ['image/*', 'application/pdf'] // Any image or PDF
   */
  allowedTypes?: string[]
}

/**
 * Composable for uploading files to Convex file storage with progress tracking.
 *
 * Handles the complete upload flow:
 * 1. Generating an upload URL via mutation
 * 2. POSTing the file to that URL (with progress tracking via XHR)
 * 3. Returning the resulting storageId
 *
 * API designed to match useConvexMutation for consistency:
 * - `data` - storageId from last successful upload
 * - `status` - 'idle' | 'pending' | 'success' | 'error'
 * - `pending` - boolean shorthand for status === 'pending'
 * - `progress` - upload progress 0-100
 * - `error` - Error | null
 *
 * Note: File uploads only work on the client side.
 *
 * @example Basic usage with progress tracking
 * ```vue
 * <script setup>
 * import { api } from '~/convex/_generated/api'
 *
 * const {
 *   upload,
 *   pending,
 *   progress,
 *   error,
 *   data: storageId,
 * } = useConvexFileUpload(api.files.generateUploadUrl)
 *
 * async function handleFile(event: Event) {
 *   const input = event.target as HTMLInputElement
 *   if (!input.files?.[0]) return
 *
 *   try {
 *     const id = await upload(input.files[0])
 *     console.log('Uploaded:', id)
 *   } catch {
 *     // error is automatically tracked
 *   }
 * }
 * </script>
 *
 * <template>
 *   <input type="file" @change="handleFile" :disabled="pending" />
 *   <div v-if="pending">Uploading: {{ progress }}%</div>
 *   <p v-if="error" class="error">{{ error.message }}</p>
 * </template>
 * ```
 *
 * @example With cancel support
 * ```vue
 * <script setup>
 * import { api } from '~/convex/_generated/api'
 *
 * const { upload, pending, progress, cancel } = useConvexFileUpload(
 *   api.files.generateUploadUrl
 * )
 * </script>
 *
 * <template>
 *   <div v-if="pending">
 *     Uploading: {{ progress }}%
 *     <button @click="cancel">Cancel</button>
 *   </div>
 * </template>
 * ```
 *
 * @example With callbacks
 * ```vue
 * <script setup>
 * import { api } from '~/convex/_generated/api'
 *
 * const { upload, pending, progress } = useConvexFileUpload(
 *   api.files.generateUploadUrl,
 *   {
 *     onSuccess: (storageId, file) => {
 *       console.log(`Uploaded ${file.name}: ${storageId}`)
 *     },
 *     onError: (error, file) => {
 *       console.error(`Failed to upload ${file.name}:`, error)
 *     },
 *   }
 * )
 * </script>
 * ```
 *
 * @example Saving storageId to a document
 * ```vue
 * <script setup>
 * import { api } from '~/convex/_generated/api'
 *
 * const { upload, pending, progress } = useConvexFileUpload(api.files.generateUploadUrl)
 * const { mutate: saveDocument } = useConvexMutation(api.documents.create)
 *
 * async function handleUpload(file: File, title: string) {
 *   const storageId = await upload(file)
 *   await saveDocument({ title, fileId: storageId })
 * }
 * </script>
 * ```
 */
export function useConvexFileUpload<
  Mutation extends FunctionReference<'mutation'>,
>(
  generateUploadUrlMutation: Mutation,
  options?: UseConvexFileUploadOptions,
): UseConvexFileUploadReturn<Mutation> {
  const config = useRuntimeConfig()
  const loggingOptions = getLoggingOptions(config.public.convex ?? {})
  const logger = createModuleLogger(loggingOptions)
  const fnName = getFunctionName(generateUploadUrlMutation)

  // Internal state
  const _status = ref<UploadStatus>('idle')
  const error = ref<Error | null>(null) as Ref<Error | null>
  const data = ref<string | undefined>(undefined) as Ref<string | undefined>
  const progress = ref(0)

  // Track XHR for cancellation
  let currentXhr: XMLHttpRequest | null = null

  // Computed - matches useConvexMutation pattern
  const status = computed(() => _status.value)
  const pending = computed(() => _status.value === 'pending')

  // Cancel function - aborts upload and resets state
  const cancel = () => {
    if (currentXhr) {
      currentXhr.abort()
      currentXhr = null
    }
    _status.value = 'idle'
    error.value = null
    data.value = undefined
    progress.value = 0
  }

  // Cleanup on scope dispose (component unmount)
  onScopeDispose(() => {
    if (currentXhr) {
      currentXhr.abort()
      currentXhr = null
    }
  })

  // The upload function
  const upload = async (file: File, mutationArgs?: FunctionArgs<Mutation>): Promise<string> => {
    const client = useConvex()
    const timer = createTimer()

    if (!client) {
      const err = new Error('ConvexClient not available - file uploads only work on client side')
      _status.value = 'error'
      error.value = err

      logger.event({
        event: 'operation:complete',
        env: 'client',
        type: 'mutation',
        name: `${fnName}+upload`,
        duration_ms: timer(),
        outcome: 'error',
        error: { type: 'ClientError', message: err.message },
      } satisfies OperationCompleteEvent)

      throw err
    }

    // Client-side validation before uploading
    if (options?.maxSize && file.size > options.maxSize) {
      const err = new Error(`File size ${file.size} bytes exceeds maximum ${options.maxSize} bytes`)
      _status.value = 'error'
      error.value = err

      logger.event({
        event: 'operation:complete',
        env: 'client',
        type: 'mutation',
        name: `${fnName}+upload`,
        duration_ms: timer(),
        outcome: 'error',
        args_preview: `file: ${file.name} (${file.size} bytes)`,
        error: { type: 'ValidationError', message: err.message },
      } satisfies OperationCompleteEvent)

      options?.onError?.(err, file)
      throw err
    }

    if (options?.allowedTypes && !isFileTypeAllowed(file.type, options.allowedTypes)) {
      const err = new Error(`File type "${file.type}" not allowed. Allowed: ${options.allowedTypes.join(', ')}`)
      _status.value = 'error'
      error.value = err

      logger.event({
        event: 'operation:complete',
        env: 'client',
        type: 'mutation',
        name: `${fnName}+upload`,
        duration_ms: timer(),
        outcome: 'error',
        args_preview: `file: ${file.name} (${file.size} bytes)`,
        error: { type: 'ValidationError', message: err.message },
      } satisfies OperationCompleteEvent)

      options?.onError?.(err, file)
      throw err
    }

    _status.value = 'pending'
    error.value = null
    progress.value = 0

    try {
      // Step 1: Get upload URL from Convex
      const postUrl = await client.mutation(generateUploadUrlMutation, (mutationArgs ?? {}) as FunctionArgs<Mutation>)

      if (typeof postUrl !== 'string') {
        throw new TypeError('generateUploadUrl mutation must return a string URL')
      }

      // Step 2: Upload file via XHR for progress tracking
      const storageId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        currentXhr = xhr

        xhr.open('POST', postUrl)
        xhr.setRequestHeader('Content-Type', file.type)

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            progress.value = Math.round((event.loaded / event.total) * 100)
          }
        }

        xhr.onload = () => {
          currentXhr = null
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText)
              resolve(response.storageId)
            } catch {
              reject(new Error('Invalid response from upload endpoint'))
            }
          } else {
            reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`))
          }
        }

        xhr.onerror = () => {
          currentXhr = null
          reject(new Error('Network error during upload'))
        }

        xhr.onabort = () => {
          currentXhr = null
          reject(new DOMException('Upload cancelled', 'AbortError'))
        }

        xhr.send(file)
      })

      _status.value = 'success'
      data.value = storageId

      logger.event({
        event: 'operation:complete',
        env: 'client',
        type: 'mutation',
        name: `${fnName}+upload`,
        duration_ms: timer(),
        outcome: 'success',
        args_preview: `file: ${file.name} (${file.size} bytes)`,
      } satisfies OperationCompleteEvent)

      options?.onSuccess?.(storageId, file)
      return storageId
    } catch (e) {
      // Don't set error state for user-initiated cancellation
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw e
      }

      const err = e instanceof Error ? e : new Error(String(e))
      _status.value = 'error'
      error.value = err

      logger.event({
        event: 'operation:complete',
        env: 'client',
        type: 'mutation',
        name: `${fnName}+upload`,
        duration_ms: timer(),
        outcome: 'error',
        args_preview: `file: ${file.name} (${file.size} bytes)`,
        error: {
          type: err.name,
          message: err.message,
          retriable: true,
        },
      } satisfies OperationCompleteEvent)

      options?.onError?.(err, file)
      throw err
    }
  }

  return {
    upload,
    data,
    status,
    pending,
    progress,
    error,
    cancel,
  }
}
