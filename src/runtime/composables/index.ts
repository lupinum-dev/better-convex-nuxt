export { useConvexAuth, type UseConvexAuthReturn, type ConvexUser } from './useConvexAuth'
export {
  useConvexAuthInternal,
  type UseConvexAuthInternalReturn,
} from './useConvexAuthInternal'
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
export type { QueryStatus, MutationStatus } from '../utils/types'
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
  useConvexAuthFlow,
  type UseConvexAuthFlowOptions,
  type UseConvexAuthFlowReturn,
} from './useConvexAuthFlow'
export {
  useAuthRedirect,
  resolveRedirectTarget,
  validateRedirectPath,
  type UseAuthRedirectReturn,
} from './useAuthRedirect'

// Validation — Convex validator → Standard Schema conversion
export { toConvexSchema, useConvexSchema } from '../utils/convex-schema'
export {
  defineConvexSchema,
  type ConvexSchemaDefinition,
  type ConvexSchemaMetaBase,
  type ConvexSchemaMetaFor,
  type ConvexSchemaFieldMeta,
} from '../utils/define-convex-schema'
export type { ValidateOption } from '../utils/resolve-validator'
export type { StandardSchemaV1 } from '../utils/standard-schema'

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
