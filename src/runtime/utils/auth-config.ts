import { normalizeAuthCacheTtl, normalizeAuthProxyBodyLimit } from './config-defaults'
import { normalizeAuthRoute } from './convex-config'

// ============================================================================
// Public auth-only build option types (vNext §5.1)
//
// Every auth-only build option lives inside `ConvexAuthOptions` so that
// `auth: false` structurally excludes them. There is no top-level `authRoute`,
// `trustedOrigins`, `authCache`, `authProxy`, or auth-only `debug` input.
// ============================================================================

/** SSR auth-token cache. Omitted/`false` disables it; an object enables it. */
export interface AuthCacheOptions {
  /**
   * Cache TTL in seconds. Clamped to [1, 60].
   * @default 60
   */
  ttl?: number
}

/** Auth proxy body-size limits. */
export interface AuthProxyDefaults {
  /**
   * Maximum allowed request body size for the auth proxy.
   * @default 1_048_576 (1 MiB)
   */
  maxRequestBodyBytes?: number
  /**
   * Maximum allowed upstream response body size for the auth proxy.
   * @default 1_048_576 (1 MiB)
   */
  maxResponseBodyBytes?: number
}

/** High-verbosity auth trace channels (require `logging: 'debug'`). */
export interface ConvexDebugOptions {
  /** Enable detailed auth flow logs on both client and server plugins. */
  authFlow?: boolean
  /** Enable detailed auth flow logs on the client plugin only. */
  clientAuthFlow?: boolean
  /** Enable detailed auth flow logs on the server plugin only. */
  serverAuthFlow?: boolean
}

/** Opt-in route protection redirect behavior. */
export interface ConvexRouteProtectionConfig {
  redirectTo: string
  preserveReturnTo: boolean
}

/**
 * Authentication installation options (vNext §5.1).
 *
 * Provide this object (or omit `auth` entirely) to install authentication with
 * defaults. Set `auth: false` for a Convex-only build. There is no `enabled`
 * toggle: the false-or-options grammar makes contradictory states impossible.
 */
export interface ConvexAuthOptions {
  /** Build-only path to the single client definition. Never copied to runtime config. */
  client?: string
  /** Auth proxy route path. @default '/api/auth' */
  route?: string
  /** Additional trusted origins for auth proxy CORS. @default [] */
  trustedOrigins?: string[]
  /** SSR auth-token cache. Omitted/`false` disables it; an object enables it. */
  cache?: false | AuthCacheOptions
  /** Auth proxy body-size limits. */
  proxy?: AuthProxyDefaults
  /** High-verbosity auth trace channels. */
  debug?: ConvexDebugOptions
  /** Opt-in route protection redirect behavior. */
  routeProtection?: Partial<ConvexRouteProtectionConfig>
}

/**
 * The normalized runtime auth shape (vNext §5.1). A discriminated value: `false`
 * for a Convex-only build, or a fully materialized options object. The build-only
 * `client` path is intentionally absent — it never reaches runtime config.
 */
export type NormalizedConvexAuthConfig =
  | false
  | {
      route: string
      trustedOrigins: readonly string[]
      cache: false | Readonly<Required<AuthCacheOptions>>
      proxy: Readonly<Required<AuthProxyDefaults>>
      debug: Readonly<Required<ConvexDebugOptions>>
      routeProtection: ConvexRouteProtectionConfig
    }

const DEFAULT_ROUTE_PROTECTION: ConvexRouteProtectionConfig = {
  redirectTo: '/auth/signin',
  preserveReturnTo: true,
}

function normalizeCache(input: unknown): false | Readonly<Required<AuthCacheOptions>> {
  // Omitted/false disables the cache; an object enables it with a clamped ttl.
  if (input === undefined || input === false || input === null) return false
  const cache = typeof input === 'object' ? (input as AuthCacheOptions) : {}
  return Object.freeze({ ttl: normalizeAuthCacheTtl(cache.ttl) })
}

function normalizeProxy(input: unknown): Readonly<Required<AuthProxyDefaults>> {
  const proxy = (input && typeof input === 'object' ? input : {}) as AuthProxyDefaults
  return Object.freeze({
    maxRequestBodyBytes: normalizeAuthProxyBodyLimit(proxy.maxRequestBodyBytes),
    maxResponseBodyBytes: normalizeAuthProxyBodyLimit(proxy.maxResponseBodyBytes),
  })
}

function normalizeDebug(input: unknown): Readonly<Required<ConvexDebugOptions>> {
  const debug = (input && typeof input === 'object' ? input : {}) as ConvexDebugOptions
  return Object.freeze({
    authFlow: debug.authFlow === true,
    clientAuthFlow: debug.clientAuthFlow === true,
    serverAuthFlow: debug.serverAuthFlow === true,
  })
}

function normalizeRouteProtection(input: unknown): ConvexRouteProtectionConfig {
  const rp = (
    input && typeof input === 'object' ? input : {}
  ) as Partial<ConvexRouteProtectionConfig>
  return {
    redirectTo:
      typeof rp.redirectTo === 'string' ? rp.redirectTo : DEFAULT_ROUTE_PROTECTION.redirectTo,
    preserveReturnTo:
      typeof rp.preserveReturnTo === 'boolean'
        ? rp.preserveReturnTo
        : DEFAULT_ROUTE_PROTECTION.preserveReturnTo,
  }
}

/**
 * Normalize the public `auth?: false | ConvexAuthOptions` input into the
 * discriminated runtime value. `false` stays `false`; anything else (including
 * `undefined` and `{}`) installs authentication with defaults. The build-only
 * `client` field is stripped here and never enters runtime config.
 */
export function normalizeConvexAuthConfig(
  input: false | ConvexAuthOptions | undefined | unknown,
): NormalizedConvexAuthConfig {
  if (input === false) return false

  const options = (input && typeof input === 'object' ? input : {}) as ConvexAuthOptions

  return {
    route: normalizeAuthRoute(typeof options.route === 'string' ? options.route : undefined),
    trustedOrigins: Array.isArray(options.trustedOrigins)
      ? options.trustedOrigins.filter((v): v is string => typeof v === 'string')
      : [],
    cache: normalizeCache(options.cache),
    proxy: normalizeProxy(options.proxy),
    debug: normalizeDebug(options.debug),
    routeProtection: normalizeRouteProtection(options.routeProtection),
  }
}

/** Derive the internal `authEnabled` boolean from the normalized value. */
export function isConvexAuthEnabled(config: NormalizedConvexAuthConfig): boolean {
  return config !== false
}
