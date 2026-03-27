export { useConvexAuth, type UseConvexAuthReturn, type ConvexUser } from './useConvexAuth'
export { useConvexAuthInternal, type UseConvexAuthInternalReturn } from './useConvexAuthInternal'
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
  // @deprecated flat helpers — use ctx.query().update() / ctx.paginatedQuery().insertAtTop() etc.
  updateQuery,
  setQueryData,
  updateAllQueries,
  deleteFromQuery,
  type UpdateQueryOptions,
  type SetQueryDataOptions,
  type UpdateAllQueriesOptions,
  type DeleteFromQueryOptions,
} from './useConvexMutation'
// Optimistic update builder types — exported directly from source to avoid re-export hop
export {
  type OptimisticContext,
  type OptimisticQueryHandle,
  type OptimisticPaginatedHandle,
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
  useConvexQueryLazy,
  type UseConvexQueryData,
  type UseConvexQueryOptions,
} from './useConvexQuery'
export type { QueryStatus, MutationStatus, ConvexCallStatus } from '../utils/types'
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
  // @deprecated flat helpers — use ctx.paginatedQuery().insertAtTop() etc.
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
