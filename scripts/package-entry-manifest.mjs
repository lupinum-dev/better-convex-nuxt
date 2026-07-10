/**
 * Canonical publishable package contract.
 *
 * Keep tool-specific behavior (AST probes and purity implementations) in the
 * consuming scripts. Paths and public names live here so package verification
 * and generated API documentation cannot maintain competing allowlists.
 */
export const packageEntries = [
  {
    subpath: '.',
    distJs: 'dist/module.mjs',
    distDts: 'dist/types.d.mts',
    valueExports: ['default'],
    typeExports: [
      'BaseAuthClient',
      'ConvexAuthMode',
      'ConvexAuthOptions',
      'ConvexAuthClientRegistry',
      'ConvexAuthStatus',
      'ConvexCallErrorKind',
      'ConvexClientHandle',
      'ConvexRuntimeConfig',
      'InferRegisteredConvexAuthClient',
      'ModuleOptions',
      'ServerConvexOptions',
      'UseConvexAuthReturn',
      'UseConvexMutationOptions',
      'UseConvexPaginatedQueryOptions',
      'UseConvexQueryOptions',
    ],
    forbiddenNames: [
      'usePermissions',
      'createPermissions',
      'createBetterConvexAuthClient',
      'resolveBetterConvexAuthBaseURL',
      'useConvexCall',
      'getQueryKey',
      'BetterConvexAuthClientOptions',
      'BetterConvexAuthClientPluginList',
      'ConvexPublicRuntimeConfig',
    ],
  },
  {
    subpath: './errors',
    distJs: 'dist/runtime/errors/index.js',
    distDts: 'dist/runtime/errors/index.d.ts',
    valueExports: ['ConvexCallError', 'normalizeConvexError', 'isSerializedConvexCallError'],
    typeExports: [
      'CallResult',
      'ConvexCallErrorKind',
      'ConvexCallErrorInput',
      'SerializedConvexCallError',
    ],
    forbiddenNames: ['toError'],
  },
  {
    subpath: './auth-client',
    distJs: 'dist/runtime/auth-client/index.js',
    distDts: 'dist/runtime/auth-client/index.d.ts',
    valueExports: ['defineConvexAuthClient'],
    typeExports: [
      'BaseAuthClient',
      'ConvexAuthClientDefinition',
      'ConvexAuthClientRegistry',
      'InferRegisteredConvexAuthClient',
    ],
    forbiddenNames: [],
  },
  {
    subpath: './server',
    distJs: 'dist/runtime/server/index.js',
    distDts: 'dist/runtime/server/index.d.ts',
    valueExports: [
      'serverConvex',
      'createClassifiedConvexFetch',
      'normalizeServerConvexBoundaryError',
      'exchangeConvexToken',
      'normalizeSiteUrl',
      'serverConvexClearAuthCache',
    ],
    typeExports: [
      'ServerConvexCaller',
      'ServerConvexOptions',
      'ConvexCredential',
      'ConvexTokenExchangeResult',
    ],
    forbiddenNames: [
      'serverConvexQuery',
      'serverConvexMutation',
      'serverConvexAction',
      'fetchQuery',
      'fetchMutation',
      'fetchAction',
    ],
  },
  {
    subpath: './server/createUserSyncTriggers',
    distJs: 'dist/runtime/server/createUserSyncTriggers.js',
    distDts: 'dist/runtime/server/createUserSyncTriggers.d.ts',
    valueExports: ['createUserSyncTriggers'],
    typeExports: [
      'BetterAuthUserDocLike',
      'CreateUserSyncTriggersOptions',
      'UserSyncRebuildResult',
    ],
    forbiddenNames: [],
  },
]

export function getPackageEntry(subpath) {
  const entry = packageEntries.find((candidate) => candidate.subpath === subpath)
  if (!entry) throw new Error(`Unknown package entry: ${subpath}`)
  return entry
}
