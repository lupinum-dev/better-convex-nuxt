export { useConvexAuth, type UseConvexAuthReturn, type ConvexUser } from './useConvexAuth'
export { useConvex } from './useConvex'
export {
  type CallResult,
  toCallResult,
  ConvexError,
  type ConvexCallError,
} from '../utils/call-result'
export { useConvexConnectionState, type ConnectionState } from './useConvexConnectionState'
export {
  useConvexMutation,
  type UseConvexMutationReturn,
  type UseConvexMutationOptions,
  // Optimistic update helpers for regular queries
  updateQuery,
  setQueryData,
  updateAllQueries,
  deleteFromQuery,
  type UpdateQueryOptions,
  type SetQueryDataOptions,
  type UpdateAllQueriesOptions,
  type DeleteFromQueryOptions,
} from './useConvexMutation'

// Re-export Convex types for convenience
export type { OptimisticLocalStore } from 'convex/browser'
export {
  useConvexAction,
  type UseConvexActionReturn,
  type UseConvexActionOptions,
} from './useConvexAction'
export {
  useConvexQuery,
  useConvexQueryLazy,
  type UseConvexQueryData,
  type UseConvexQueryOptions,
} from './useConvexQuery'
export type { ConvexCallStatus } from '../utils/types'
export {
  defineSharedConvexQuery,
  type DefineSharedConvexQueryOptions,
} from './defineSharedConvexQuery'
export {
  useConvexPaginatedQuery,
  useConvexPaginatedQueryLazy,
  type PaginatedQueryStatus,
  type UseConvexPaginatedQueryOptions,
  type UseConvexPaginatedQueryData,
  type PaginatedQueryReference,
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
  // Optimistic update helpers
  insertAtTop,
  insertAtPosition,
  insertAtBottomIfLoaded,
  updateInPaginatedQuery,
  deleteFromPaginatedQuery,
  type InsertAtTopOptions,
  type InsertAtPositionOptions,
  type InsertAtBottomIfLoadedOptions,
  type UpdateInPaginatedQueryOptions,
  type DeleteFromPaginatedQueryOptions,
} from './useConvexPaginatedQuery'

// Upload composable (unified single-file and queue mode)
export {
  useConvexUpload,
  type UseConvexUploadOptions,
  type UseConvexUploadReturn,
  type UseConvexUploadQueueReturn,
  type UploadStatus,
  type UploadProgressInfo,
  type UploadQueueItemStatus,
  type UploadQueueItem,
  type UploadQueueEnqueueItem,
  type UploadQueueEnqueueInput,
} from './useConvexUpload'

export { useConvexStorageUrl } from './useConvexStorageUrl'

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
