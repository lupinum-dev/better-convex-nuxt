export interface ModuleImportRegistration {
  name: string
  from: string
}

export const composableAutoImports = [
  { name: 'useConvex', from: './runtime/composables/useConvex' },
  { name: 'useConvexMutation', from: './runtime/composables/useConvexMutation' },
  { name: 'useConvexAction', from: './runtime/composables/useConvexAction' },
  { name: 'useConvexQuery', from: './runtime/composables/useConvexQuery' },
  { name: 'getQueryKey', from: './runtime/composables/useConvexQuery' },
  {
    name: 'defineSharedConvexQuery',
    from: './runtime/composables/defineSharedConvexQuery',
  },
  { name: 'useConvexCall', from: './runtime/composables/useConvexCall' },
  {
    name: 'useConvexPaginatedQuery',
    from: './runtime/composables/useConvexPaginatedQuery',
  },
  {
    name: 'useConvexConnectionState',
    from: './runtime/composables/useConvexConnectionState',
  },
  { name: 'updateQuery', from: './runtime/composables/useConvexMutation' },
  { name: 'setQueryData', from: './runtime/composables/useConvexMutation' },
  { name: 'updateAllQueries', from: './runtime/composables/useConvexMutation' },
  { name: 'deleteFromQuery', from: './runtime/composables/useConvexMutation' },
  { name: 'insertAtTop', from: './runtime/composables/useConvexPaginatedQuery' },
  { name: 'insertAtPosition', from: './runtime/composables/useConvexPaginatedQuery' },
  {
    name: 'insertAtBottomIfLoaded',
    from: './runtime/composables/useConvexPaginatedQuery',
  },
  {
    name: 'updateInPaginatedQuery',
    from: './runtime/composables/useConvexPaginatedQuery',
  },
  {
    name: 'deleteFromPaginatedQuery',
    from: './runtime/composables/useConvexPaginatedQuery',
  },
  { name: 'useConvexFileUpload', from: './runtime/composables/useConvexFileUpload' },
  { name: 'useConvexUploadQueue', from: './runtime/composables/useConvexUploadQueue' },
  { name: 'useConvexStorageUrl', from: './runtime/composables/useConvexStorageUrl' },
] as const satisfies readonly ModuleImportRegistration[]

export const authAutoImports = [
  { name: 'useConvexAuth', from: './runtime/composables/useConvexAuth' },
  { name: 'useConvexUser', from: './runtime/composables/useConvexUser' },
  {
    name: 'createBetterConvexAuthClient',
    from: './runtime/composables/createBetterConvexAuthClient',
  },
] as const satisfies readonly ModuleImportRegistration[]

export const permissionAutoImports = [
  { name: 'createPermissions', from: './runtime/composables/usePermissions' },
] as const satisfies readonly ModuleImportRegistration[]

export const serverAutoImports = [
  { name: 'serverConvexQuery', from: './runtime/server/utils/convex' },
  { name: 'serverConvexMutation', from: './runtime/server/utils/convex' },
  { name: 'serverConvexAction', from: './runtime/server/utils/convex' },
  { name: 'serverConvexClearAuthCache', from: './runtime/server/utils/auth-cache' },
] as const satisfies readonly ModuleImportRegistration[]
