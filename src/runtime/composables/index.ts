export { useConvexAuth } from './useConvexAuth'
export { useConvex } from './useConvex'
export {
  useConvexConnectionState,
  type ConnectionState,
  type UseConvexConnectionStateOptions,
} from './useConvexConnectionState'
export {
  useConvexMutation,
  type MutationStatus,
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
  type ActionStatus,
  type UseConvexActionReturn,
  type UseConvexActionOptions,
} from './useConvexAction'
export { useAuthClient } from './useAuthClient'
export {
  useConvexQuery,
  type QueryStatus,
  type UseConvexQueryReturn,
  type UseConvexQueryData,
  type UseConvexQueryOptions,
} from './useConvexQuery'
export { useConvexCached } from './useConvexCached'
export {
  useConvexPaginatedQuery,
  type PaginationStatus,
  type UseConvexPaginatedQueryOptions,
  type UseConvexPaginatedQueryReturn,
  type PaginatedQueryReference,
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
  // Optimistic update helpers
  insertAtTop,
  insertAtPosition,
  insertAtBottomIfLoaded,
  optimisticallyUpdateValueInPaginatedQuery,
  deleteFromPaginatedQuery,
  type InsertAtTopOptions,
  type InsertAtPositionOptions,
  type InsertAtBottomIfLoadedOptions,
  type UpdateInPaginatedQueryOptions,
  type DeleteFromPaginatedQueryOptions,
} from './useConvexPaginatedQuery'

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
