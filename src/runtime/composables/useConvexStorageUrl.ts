import type { FunctionReference } from 'convex/server'
import { computed, toValue, type MaybeRef } from 'vue'

import { createConvexQueryState, type UseConvexQueryData } from './useConvexQuery'

/**
 * Composable to retrieve a signed URL for a file in Convex storage.
 *
 * Wraps useConvexQuery with automatic skip behavior when storageId is null/undefined.
 * Returns a reactive URL that updates when the storageId changes or the query refreshes.
 *
 * Note: The query is automatically skipped when storageId is null or undefined,
 * avoiding unnecessary network requests.
 *
 * @param getUrlQuery - The Convex query to get the URL (e.g., api.files.getUrl)
 * @param storageId - The storageId of the file (can be a Ref or plain value)
 * @returns ComputedRef<string | null> - The URL, or null if loading/not found/skipped
 *
 * @example Basic usage
 * ```vue
 * <script setup>
 * import { api } from '~/convex/_generated/api'
 *
 * // From a document or upload
 * const storageId = ref<string | null>(null)
 *
 * const imageUrl = useConvexStorageUrl(api.files.getUrl, storageId)
 * </script>
 *
 * <template>
 *   <img v-if="imageUrl" :src="imageUrl" alt="Uploaded file" />
 * </template>
 * ```
 *
 * @example With useConvexFileUpload
 * ```vue
 * <script setup>
 * import { api } from '~/convex/_generated/api'
 *
 * const {
 *   upload,
 *   pending,
 *   progress,
 *   data: storageId,
 * } = useConvexFileUpload(api.files.generateUploadUrl)
 *
 * // URL automatically updates when storageId changes
 * const imageUrl = useConvexStorageUrl(api.files.getUrl, storageId)
 *
 * async function handleFile(event: Event) {
 *   const input = event.target as HTMLInputElement
 *   if (!input.files?.[0]) return
 *   await upload(input.files[0])
 * }
 * </script>
 *
 * <template>
 *   <input type="file" @change="handleFile" :disabled="pending" />
 *   <div v-if="pending">Uploading: {{ progress }}%</div>
 *   <img v-if="imageUrl" :src="imageUrl" />
 * </template>
 * ```
 *
 * @example With document data
 * ```vue
 * <script setup>
 * import { api } from '~/convex/_generated/api'
 *
 * const props = defineProps<{ documentId: string }>()
 *
 * // Fetch document with storageId
 * const { data: document } = await useConvexQuery(
 *   api.documents.get,
 *   computed(() => ({ id: props.documentId }))
 * )
 *
 * // Get URL from document's storageId
 * const fileUrl = useConvexStorageUrl(
 *   api.files.getUrl,
 *   computed(() => document.value?.fileId)
 * )
 * </script>
 * ```
 */
/**
 * Returns the full query state `{ data, pending, error, status, refresh, reset }`.
 * `data` is `Ref<string | null>` — the signed URL, or null when loading or skipped.
 * The query is automatically skipped when `storageId` is null/undefined.
 *
 * @migration `const url = useConvexStorageUrl(...)` → `const { data: url } = useConvexStorageUrl(...)`
 */
export function useConvexStorageUrl(
  getUrlQuery: FunctionReference<'query'>,
  storageId: MaybeRef<string | null | undefined>,
): UseConvexQueryData<string> {
  return createConvexQueryState(
    getUrlQuery,
    computed(() => ({ storageId: toValue(storageId) ?? '' })),
    { enabled: () => !!toValue(storageId) },
    true,
  ).resultData
}
