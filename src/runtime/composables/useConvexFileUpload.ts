/**
 * File upload composable for Convex storage.
 *
 * Inspired by nuxt-convex by @onmax (https://github.com/onmax/nuxt-convex)
 */

import type { FunctionArgs, FunctionReference } from 'convex/server'
import { computed, getCurrentScope, onScopeDispose, shallowRef, type ComputedRef } from 'vue'

import { useNuxtApp } from '#imports'

import { ConvexCallError, normalizeConvexError } from '../errors'
import { readConvexRuntimeContext } from '../runtime-context'
import { assertConvexComposableScope } from '../utils/composable-scope'
import { getFunctionName } from '../utils/convex-shared'
import { createIdentityChangedError, isIdentityChangedError } from '../utils/identity-changed-error'
import { createLogger } from '../utils/logger'
import { isFileTypeAllowed } from '../utils/mime-type'
import { getConvexRuntimeConfig } from '../utils/runtime-config'
import { requestUploadUrl, uploadFileViaXhr, type UploadProgressInfo } from '../utils/upload-core'

export type { UploadProgressInfo } from '../utils/upload-core'

/**
 * Upload status representing the current state of the upload
 * - 'idle': not yet called or reset
 * - 'pending': upload in progress
 * - 'success': upload completed successfully
 * - 'error': upload failed
 */
export type UploadStatus = 'idle' | 'pending' | 'success' | 'error'

interface UploadViewState {
  status: UploadStatus
  error: ConvexCallError | null
  data: string | undefined
  progress: number
}

const INITIAL_UPLOAD_VIEW_STATE: UploadViewState = {
  status: 'idle',
  error: null,
  data: undefined,
  progress: 0,
}

/**
 * Return value from useConvexFileUpload
 */
export interface UseConvexFileUploadReturn<Mutation extends FunctionReference<'mutation'>> {
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
  data: ComputedRef<string | undefined>

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
  progress: ComputedRef<number>

  /**
   * Error from the last upload attempt as the normalized {@link ConvexCallError}.
   * null if no error or upload hasn't been called.
   */
  error: ComputedRef<ConvexCallError | null>

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
   * Callback when an error occurs, receiving the normalized {@link ConvexCallError}.
   */
  onError?: (error: ConvexCallError, file: File) => void
  /**
   * Callback for upload progress updates.
   * Called when the browser reports computable upload progress.
   */
  onProgress?: (info: UploadProgressInfo, file: File) => void
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
 * import { api } from '#convex/api'
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
 * import { api } from '#convex/api'
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
 * import { api } from '#convex/api'
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
 * import { api } from '#convex/api'
 *
 * const { upload, pending, progress } = useConvexFileUpload(api.files.generateUploadUrl)
 * const saveDocument = useConvexMutation(api.documents.create)
 *
 * async function handleUpload(file: File, title: string) {
 *   const storageId = await upload(file)
 *   await saveDocument({ title, fileId: storageId })
 * }
 * </script>
 * ```
 */
export function useConvexFileUpload<Mutation extends FunctionReference<'mutation'>>(
  generateUploadUrlMutation: Mutation,
  options?: UseConvexFileUploadOptions,
): UseConvexFileUploadReturn<Mutation> {
  const fnName = getFunctionName(generateUploadUrlMutation)
  const currentScope = getCurrentScope()
  assertConvexComposableScope('useConvexFileUpload', import.meta.client, currentScope)

  const nuxtApp = useNuxtApp()
  const runtime = readConvexRuntimeContext(nuxtApp)
  const attachment = runtime?.attachment
  const identityObserver = attachment?.identity
  const logger = runtime?.logger ?? createLogger(getConvexRuntimeConfig().logging)
  const getIdentityGeneration = () => identityObserver?.snapshot().identityGeneration ?? 0

  // One snapshot is the canonical upload view state. Publishing a transition
  // atomically prevents a synchronous watcher from observing (or re-entering
  // through) a partially-cleared status/error/data/progress combination.
  const viewState = shallowRef<UploadViewState>(INITIAL_UPLOAD_VIEW_STATE)

  let currentAttempt: AbortController | null = null
  let observedIdentityGeneration = getIdentityGeneration()

  // Computed - matches useConvexMutation pattern
  const status = computed(() => viewState.value.status)
  const pending = computed(() => viewState.value.status === 'pending')
  const error = computed(() => viewState.value.error)
  const data = computed(() => viewState.value.data)
  const progress = computed(() => viewState.value.progress)

  const clearUploadState = (
    error: unknown = new DOMException('Upload cancelled', 'AbortError'),
  ) => {
    // Snapshot A before publishing idle. A synchronous watcher may start B
    // while the ref setter runs; cleanup below must only retire the snapshot.
    const attempt = currentAttempt
    viewState.value = INITIAL_UPLOAD_VIEW_STATE
    if (currentAttempt === attempt) currentAttempt = null
    attempt?.abort(error)
  }

  // Cancel function - aborts upload and resets state
  const cancel = clearUploadState

  // Cleanup on scope dispose (component unmount), and retire all retained or
  // in-flight state synchronously when the authenticated principal changes.
  if (currentScope) {
    const stopIdentitySubscription = identityObserver?.subscribe(() => {
      const generation = getIdentityGeneration()
      if (generation === observedIdentityGeneration) return
      observedIdentityGeneration = generation
      clearUploadState(createIdentityChangedError('upload'))
    })
    onScopeDispose(() => {
      stopIdentitySubscription?.()
      clearUploadState()
    })
  }

  // The upload function
  const upload = async (file: File, mutationArgs?: FunctionArgs<Mutation>): Promise<string> => {
    const startTime = Date.now()
    const identityGeneration = getIdentityGeneration()
    const identityChanged = () => getIdentityGeneration() !== identityGeneration

    // The published state is the synchronous concurrency guard, including the
    // upload-URL phase before XHR begins.
    if (viewState.value.status === 'pending') {
      const err = new ConvexCallError({
        kind: 'unknown',
        message: 'Upload already in progress for this composable instance',
      })
      logger.upload({
        name: fnName,
        event: 'error',
        filename: file.name,
        size: file.size,
        error: err,
      })
      throw err
    }

    const requireCurrentIdentity = () => {
      if (identityChanged()) throw createIdentityChangedError('upload')
    }

    const publishTerminalState = (next: UploadViewState) => {
      requireCurrentIdentity()
      viewState.value = next
      // A same-identity watcher may legitimately start B here. Only an
      // identity transition invalidates A's already-terminal result.
      requireCurrentIdentity()
    }

    const publishError = (rawError: unknown): ConvexCallError => {
      const err = normalizeConvexError(rawError)
      publishTerminalState({
        ...viewState.value,
        status: 'error',
        error: err,
      })

      logger.upload({
        name: fnName,
        event: 'error',
        filename: file.name,
        size: file.size,
        duration: Date.now() - startTime,
        error: err,
      })

      options?.onError?.(err, file)
      requireCurrentIdentity()
      return err
    }

    // Client-side validation before uploading
    let validationError: ConvexCallError | null = null
    if (options?.maxSize && file.size > options.maxSize) {
      validationError = new ConvexCallError({
        kind: 'unknown',
        message: `File size ${file.size} bytes exceeds maximum ${options.maxSize} bytes`,
      })
    } else if (options?.allowedTypes && !isFileTypeAllowed(file.type, options.allowedTypes)) {
      validationError = new ConvexCallError({
        kind: 'unknown',
        message: `File type "${file.type}" not allowed. Allowed: ${options.allowedTypes.join(', ')}`,
      })
    }
    if (validationError) throw publishError(validationError)

    const attempt = new AbortController()
    currentAttempt = attempt

    const isCurrentUpload = () =>
      currentAttempt === attempt && !identityChanged() && !attempt.signal.aborted
    const requireCurrentUpload = () => {
      requireCurrentIdentity()
      if (!isCurrentUpload()) throw new DOMException('Upload cancelled', 'AbortError')
    }

    try {
      requireCurrentUpload()
      viewState.value = {
        ...viewState.value,
        status: 'pending',
        error: null,
        progress: 0,
      }
      requireCurrentUpload()

      if (!attachment || typeof attachment.client.mutation !== 'function') {
        throw new ConvexCallError({
          kind: 'unknown',
          message:
            '[useConvexFileUpload] Convex client is unavailable. Upload files from the browser after configuring a Convex URL.',
        })
      }

      // Step 1: Get an upload URL through the stable owner handle.
      const cancelled = new Promise<never>((_, reject) => {
        attempt.signal.addEventListener('abort', () => reject(attempt.signal.reason), {
          once: true,
        })
      })
      const postUrl = await Promise.race([
        requestUploadUrl(
          attachment.client,
          generateUploadUrlMutation,
          (mutationArgs ?? {}) as FunctionArgs<Mutation>,
        ),
        cancelled,
      ])

      requireCurrentUpload()

      // Step 2: Upload file via XHR for progress tracking
      const storageId = await uploadFileViaXhr(postUrl, file, {
        signal: attempt.signal,
        onProgress: (info) => {
          if (!isCurrentUpload()) return
          viewState.value = {
            ...viewState.value,
            progress: info.percent,
          }
          if (!isCurrentUpload()) return
          options?.onProgress?.(info, file)
        },
      })

      requireCurrentUpload()
      publishTerminalState({
        ...viewState.value,
        status: 'success',
        data: storageId,
      })

      const duration = Date.now() - startTime
      logger.upload({
        name: fnName,
        event: 'success',
        filename: file.name,
        size: file.size,
        duration,
      })

      options?.onSuccess?.(storageId, file)
      requireCurrentIdentity()
      return storageId
    } catch (e) {
      if (identityChanged() || isIdentityChangedError(e)) {
        if (currentAttempt === attempt) {
          clearUploadState(createIdentityChangedError('upload'))
        }
        throw isIdentityChangedError(e) ? e : createIdentityChangedError('upload')
      }
      if (currentAttempt !== attempt) {
        throw e instanceof DOMException && e.name === 'AbortError'
          ? e
          : new DOMException('Upload cancelled', 'AbortError')
      }
      // Don't set error state for user-initiated cancellation
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw e
      }

      // Normalize and publish every validation/transport failure through one
      // identity-guarded path.
      throw publishError(e)
    } finally {
      if (currentAttempt === attempt) currentAttempt = null
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
