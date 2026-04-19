export { useConvexAuth, type UseConvexAuthReturn, type ConvexUser } from './useConvexAuth.js'
export { useConvex } from './useConvex.js'
export { ConvexCallError } from '../utils/call-result.js'
export { useConvexConnectionState, type ConnectionState } from './useConvexConnectionState.js'
export {
  useConvexMutation,
  type UseConvexMutationReturn,
  type UseConvexMutationOptions,
} from './useConvexMutation.js'
// Optimistic update builder types and helpers — exported directly from source to avoid re-export hop
export {
  type OptimisticContext,
  type OptimisticQueryHandle,
  type OptimisticPaginatedHandle,
  prependTo,
  appendTo,
  removeFrom,
  updateIn,
} from './optimistic-updates.js'

// Re-export Convex types for convenience
export type { OptimisticLocalStore } from 'convex/browser'
export {
  useConvexAction,
  type UseConvexActionReturn,
  type UseConvexActionOptions,
} from './useConvexAction.js'
export {
  useConvexQuery,
  type UseConvexQueryData,
  type UseConvexQueryOptions,
  type UseConvexQueryReturn,
} from './useConvexQuery.js'
export {
  useCachedQuery,
  type UseCachedQueryOptions,
  type UseCachedQueryReturn,
  type CachedQuerySeedStatus,
} from './useCachedQuery.js'
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
} from './useConvexPaginatedQuery.js'

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
} from './useConvexUpload.js'

export { useConvexStorageUrl } from './useConvexStorageUrl.js'

// Auth flow composables (available when auth enabled)
export {
  useConvexAuthActions,
  type UseConvexAuthActionsOptions,
  type UseConvexAuthActionsReturn,
} from './useConvexAuthActions.js'
export { useConvexSignIn } from './useConvexSignIn.js'
export { useConvexSignUp } from './useConvexSignUp.js'
export { useConvexPasswordReset } from './useConvexPasswordReset.js'
