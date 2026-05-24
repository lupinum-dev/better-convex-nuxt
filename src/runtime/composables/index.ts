export { useConvex } from '../convex/composables/useConvex.js'
export { ConvexCallError } from '../utils/call-result.js'
export {
  useConvexConnectionState,
  type ConnectionState,
} from '../convex/composables/useConvexConnectionState.js'
export {
  useConvexMutation,
  type UseConvexMutationReturn,
  type UseConvexMutationOptions,
} from '../convex/composables/useConvexMutation.js'
// Optimistic update builder types and helpers — exported directly from source to avoid re-export hop
export {
  type OptimisticContext,
  type OptimisticQueryHandle,
  type OptimisticPaginatedHandle,
  prependTo,
  appendTo,
  removeFrom,
  updateIn,
} from '../convex/composables/optimistic-updates.js'

// Re-export Convex types for convenience
export type { OptimisticLocalStore } from 'convex/browser'
export {
  useConvexAction,
  type UseConvexActionReturn,
  type UseConvexActionOptions,
} from '../convex/composables/useConvexAction.js'
export {
  useConvexQuery,
  type UseConvexQueryData,
  type UseConvexQueryOptions,
  type UseConvexQueryReturn,
} from '../convex/composables/useConvexQuery.js'
export {
  useCachedQuery,
  type UseCachedQueryOptions,
  type UseCachedQueryReturn,
  type CachedQuerySeedStatus,
} from '../convex/composables/useCachedQuery.js'
export type {
  QueryStatus,
  MutationStatus,
  ConvexCallSuccessPayload,
  ConvexCallErrorPayload,
  ConvexUnauthorizedPayload,
  ConvexConnectionPhase,
  ConvexConnectionChangedPayload,
  ConvexAuthChangedPayload,
} from '../utils/types.js'
export {
  useConvexPaginatedQuery,
  type PaginatedQueryStatus,
  type UseConvexPaginatedQueryOptions,
  type UseConvexPaginatedQueryData,
  type UseConvexPaginatedQueryReturn,
  type PaginatedQueryReference,
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
} from '../convex/composables/useConvexPaginatedQuery.js'

export {
  useConvexUpload,
  type UseConvexUploadOptions,
  type UseConvexUploadReturn,
  type UploadStatus,
  type UploadQueueItem,
  type UploadQueueItemStatus,
  type UploadQueueEnqueueItem,
  type UploadQueueEnqueueInput,
  type UploadProgressInfo,
} from '../convex/composables/useConvexUpload.js'

export { useConvexStorageUrl } from '../convex/composables/useConvexStorageUrl.js'

export {
  createConfiguredPermissionsComposables,
  type AuthContext,
  type InferAccessContext,
  type PermissionKey,
  type ValidatePermissionKey,
} from './configured-permissions.js'

// Auth flow composables (available when auth enabled)
export {
  useConvexAuth,
  type UseConvexAuthReturn,
  type AuthSessionUser,
} from '../auth/composables/useConvexAuth.js'
export { useBetterAuthClient } from '../auth/composables/useBetterAuthClient.js'
export {
  useBetterAuthActions,
  type UseBetterAuthActionsOptions,
  type UseBetterAuthActionsReturn,
} from '../auth/composables/useBetterAuthActions.js'
export { useBetterAuthSignIn } from '../auth/composables/useBetterAuthSignIn.js'
export { useBetterAuthSignUp } from '../auth/composables/useBetterAuthSignUp.js'
export { useBetterAuthPasswordReset } from '../auth/composables/useBetterAuthPasswordReset.js'
