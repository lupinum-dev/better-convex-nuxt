/**
 * Canonical publishable package contract.
 *
 * Keep tool-specific behavior (AST probes and purity implementations) in the
 * consuming scripts. Paths and public names live here so package verification
 * and generated API documentation cannot maintain competing allowlists.
 */
export const packageEntries = [
  {
    kind: 'runtime',
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
    kind: 'runtime',
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
    kind: 'runtime',
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
    kind: 'runtime',
    subpath: './convex-auth',
    distJs: 'dist/runtime/convex-auth/index.js',
    distDts: 'dist/runtime/convex-auth/index.d.ts',
    valueExports: [
      'convexAuth',
      'createAuthComponent',
      'defineAuthAdapterFunctions',
      'getConvexAuthProvider',
      'requireAuthOrigin',
      'verifyOAuthBearerToken',
    ],
    typeExports: [
      'AuthComponentTriggers',
      'AuthCtx',
      'AuthFunctions',
      'CreateAuth',
      'VerifyOAuthBearerTokenOptions',
    ],
    exactDeclaredExports: true,
    forbiddenNames: [],
  },
  {
    kind: 'runtime',
    subpath: './convex-auth/convex.config',
    distJs: 'dist/runtime/convex-auth/component/convex.config.js',
    distDts: 'dist/runtime/convex-auth/component/convex.config.d.ts',
    valueExports: ['default'],
    typeExports: [],
    exactDeclaredExports: true,
    forbiddenNames: [],
  },
  {
    kind: 'types-only',
    subpath: './convex-auth/_generated/component.js',
    distDts: 'dist/runtime/convex-auth/component/_generated/component.d.ts',
    valueExports: [],
    typeExports: ['ComponentApi'],
    exactDeclaredExports: true,
    forbiddenNames: [],
  },
  {
    kind: 'runtime',
    subpath: './convex-auth/test',
    distJs: 'dist/runtime/convex-auth/test.js',
    distDts: 'dist/runtime/convex-auth/test.d.ts',
    valueExports: ['default', 'register'],
    typeExports: [],
    exactDeclaredExports: true,
    forbiddenNames: [],
  },
  {
    kind: 'runtime',
    subpath: './server',
    distJs: 'dist/runtime/server/index.js',
    distDts: 'dist/runtime/server/index.d.ts',
    valueExports: [
      'serverConvex',
      'createClassifiedConvexFetch',
      'normalizeServerConvexBoundaryError',
      'exchangeConvexToken',
      'normalizeSiteUrl',
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
    kind: 'runtime',
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

const entryKinds = new Set(['runtime', 'types-only'])

function validatePackageEntries(entries) {
  const subpaths = new Set()

  for (const entry of entries) {
    if (!entryKinds.has(entry.kind)) {
      throw new TypeError(
        `Package entry ${entry.subpath ?? '<missing>'} has invalid kind ${entry.kind}`,
      )
    }
    if (typeof entry.subpath !== 'string' || entry.subpath.length === 0) {
      throw new TypeError(`Package entry subpath must be a non-empty string: ${entry.subpath}`)
    }
    if (subpaths.has(entry.subpath)) {
      throw new Error(`Package entry subpath must be unique: ${entry.subpath}`)
    }
    subpaths.add(entry.subpath)

    if (typeof entry.distDts !== 'string' || entry.distDts.length === 0) {
      throw new TypeError(`Package entry ${entry.subpath} must declare distDts`)
    }
    for (const property of ['valueExports', 'typeExports', 'forbiddenNames']) {
      const names = entry[property]
      if (
        !Array.isArray(names) ||
        names.some((name) => typeof name !== 'string' || name.length === 0) ||
        new Set(names).size !== names.length
      ) {
        throw new TypeError(`Package entry ${entry.subpath} must declare unique string ${property}`)
      }
    }
    if (
      entry.exactDeclaredExports !== undefined &&
      typeof entry.exactDeclaredExports !== 'boolean'
    ) {
      throw new TypeError(`Package entry ${entry.subpath} exactDeclaredExports must be boolean`)
    }
    if (
      entry.kind === 'runtime' &&
      (typeof entry.distJs !== 'string' || entry.distJs.length === 0)
    ) {
      throw new TypeError(`Runtime package entry ${entry.subpath} must declare distJs`)
    }
    if (entry.kind === 'types-only' && ('distJs' in entry || entry.valueExports.length > 0)) {
      throw new TypeError(
        `Types-only package entry ${entry.subpath} cannot declare JavaScript or values`,
      )
    }
  }

  return entries
}

validatePackageEntries(packageEntries)

export function getPackageEntry(subpath) {
  const entry = packageEntries.find((candidate) => candidate.subpath === subpath)
  if (!entry) throw new Error(`Unknown package entry: ${subpath}`)
  return entry
}

export { validatePackageEntries }
