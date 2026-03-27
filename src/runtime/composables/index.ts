export { useConvexAuth, type UseConvexAuthReturn, type ConvexUser } from './useConvexAuth'
export { useConvexAuthInternal, type UseConvexAuthInternalReturn } from './useConvexAuthInternal'
export { useConvex } from './useConvex'
export {
  type CallResult,
  toCallResult,
  ConvexError,
} from '../utils/call-result'
export { useConvexConnectionState, type ConnectionState } from './useConvexConnectionState'
export {
  useConvexMutation,
  type UseConvexMutationReturn,
  type UseConvexMutationOptions,
} from './useConvexMutation'
// Optimistic update builder types and helpers — exported directly from source to avoid re-export hop
export {
  type OptimisticContext,
  type OptimisticQueryHandle,
  type OptimisticPaginatedHandle,
  prependTo,
  appendTo,
  removeFrom,
  updateIn,
} from './optimistic-updates'

// Re-export Convex types for convenience
export type { OptimisticLocalStore } from 'convex/browser'
export {
  useConvexAction,
  type UseConvexActionReturn,
  type UseConvexActionOptions,
} from './useConvexAction'
export {
  useConvexQuery,
  type UseConvexQueryData,
  type UseConvexQueryOptions,
} from './useConvexQuery'
export type { QueryStatus, MutationStatus } from '../utils/types'
export {
  defineSharedConvexQuery,
  type DefineSharedConvexQueryOptions,
} from './defineSharedConvexQuery'
export {
  useConvexPaginatedQuery,
  type PaginatedQueryStatus,
  type UseConvexPaginatedQueryOptions,
  type UseConvexPaginatedQueryData,
  type PaginatedQueryReference,
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
} from './useConvexPaginatedQuery'

// Upload composables
export {
  useConvexFileUpload,
  type UseConvexFileUploadOptions,
  type UseConvexUploadReturn,
  type UploadStatus,
} from './useConvexFileUpload'
export {
  useConvexUploadQueue,
  type UseConvexUploadQueueOptions,
  type UseConvexUploadQueueReturn,
  type UploadQueueItem,
  type UploadQueueItemStatus,
  type UploadQueueEnqueueItem,
  type UploadQueueEnqueueInput,
  type UploadProgressInfo,
} from './useConvexUploadQueue'

export { useConvexStorageUrl, useConvexStorageUrlRef } from './useConvexStorageUrl'

// Permission composables (opt-in via module config)
export {
  createPermissions,
  type PermissionContext,
  type Resource,
  type CheckPermissionFn,
  type CreatePermissionsOptions,
  type UsePermissionsReturn,
  type UsePermissionGuardOptions,
} from './usePermissions'
