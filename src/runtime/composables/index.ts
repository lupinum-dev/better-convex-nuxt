export { useConvexAuth, type UseConvexAuthReturn, type ConvexUser } from './useConvexAuth'
export { useConvex } from './useConvex'
export { ConvexCallError } from '../utils/call-result'
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
  getQueryKey,
  type UseConvexQueryData,
  type UseConvexQueryOptions,
  type UseConvexQueryReturn,
} from './useConvexQuery'
export {
  useCachedQuery,
  type UseCachedQueryOptions,
  type UseCachedQueryReturn,
} from './useCachedQuery'
export type {
  QueryStatus,
  MutationStatus,
  ConvexCallSuccessPayload,
  ConvexCallErrorPayload,
  ConvexUnauthorizedPayload,
  ConvexConnectionPhase,
  ConvexConnectionChangedPayload,
  ConvexAuthChangedPayload,
} from '../utils/types'
export {
  useConvexPaginatedQuery,
  type PaginatedQueryStatus,
  type UseConvexPaginatedQueryOptions,
  type UseConvexPaginatedQueryData,
  type UseConvexPaginatedQueryReturn,
  type PaginatedQueryReference,
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
} from './useConvexPaginatedQuery'

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
} from './useConvexUpload'

export { useConvexStorageUrl } from './useConvexStorageUrl'

// Auth flow composables (available when auth enabled)
export {
  useConvexAuthActions,
  type UseConvexAuthActionsOptions,
  type UseConvexAuthActionsReturn,
} from './useConvexAuthActions'

// Validation — Convex validator → Standard Schema conversion
export { toConvexSchema, useConvexSchema } from '../utils/convex-schema'
export {
  defineSchema,
  defineTableMeta,
  type SchemaDefinition,
  type SchemaFieldMeta,
  type InputSchemaMeta,
  type ResolvedSchemaMeta,
  type TableMeta,
  type TableTenantMeta,
} from '../utils/define-convex-schema'
export type { ValidateOption } from '../utils/resolve-validator'
export type { StandardSchemaV1 } from '../utils/standard-schema'

// Tenant composables (opt-in via createTenantComposables factory)
export {
  createPermissions,
  type CreatePermissionsOptions,
  type UsePermissionsReturn,
  type UsePermissionGuardOptions,
} from './usePermissions'
export type {
  CheckPermissionFn,
  InferPermission,
  InferRole,
  PermissionContext,
  Resource,
} from '../convex/define-permissions'
