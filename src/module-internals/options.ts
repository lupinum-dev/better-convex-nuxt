import type { ConvexAuthConfigInput } from '../runtime/auth/shared/auth-config.js'
import type { TrellisObservabilityOptions } from '../runtime/observability/index.js'

export interface AuthCacheOptions {
  /**
   * Enable SSR auth token caching.
   * When enabled, Convex JWT tokens are cached to reduce TTFB on subsequent SSR requests.
   * Uses Nitro Storage (memory by default, configurable to Redis for multi-instance deployments).
   * @default false
   */
  enabled: boolean
  /**
   * Cache TTL in seconds.
   * @default 60 (1 minute)
   */
  ttl?: number
}

export interface AuthProxyOptions {
  /**
   * Maximum allowed request body size for auth proxy.
   * @default 1_048_576 (1 MiB)
   */
  maxRequestBodyBytes?: number
  /**
   * Maximum allowed upstream response body size for auth proxy.
   * @default 1_048_576 (1 MiB)
   */
  maxResponseBodyBytes?: number
}

/**
 * Auth configuration. All auth-related settings live here.
 */
export interface AuthOptions extends ConvexAuthConfigInput {
  /**
   * Custom route path for the auth proxy.
   * @default '/api/auth'
   */
  route?: string
  /**
   * Additional trusted origins for CORS validation on the auth proxy.
   * Same-origin requests are always allowed.
   * Supports wildcards (e.g., 'https://preview-*.vercel.app').
   * @default []
   */
  trustedOrigins?: string[]
  /**
   * Routes that skip auth token fetches.
   * Supports glob patterns (e.g., '/docs/**').
   * Also use definePageMeta({ skipAuthTokenFetch: true }) for per-page control.
   * @default []
   */
  skipAuthTokenFetchRoutes?: string[]
  /**
   * SSR auth token caching (opt-in).
   * Caches Convex JWT tokens server-side to reduce TTFB on subsequent requests.
   *
   * @example
   * ```ts
   * trellis: { auth: { cache: { enabled: true, ttl: 60 } } }
   * // For multi-instance: configure nitro.storage with driver: 'redis'
   * ```
   */
  cache?: AuthCacheOptions
  /**
   * Body size limits for the auth proxy.
   */
  proxy?: AuthProxyOptions
}

export interface PermissionsOptions {
  /**
   * App-owned query that returns the frontend access context.
   * Format: `<modulePath>.<exportName>` like `permissions/context.getAccessContext`.
   */
  query: string
  /**
   * Opt-in permission metadata/type generation.
   * When true, scans canonical permission files and emits additive .nuxt artifacts.
   * @default false
   */
  codegen?: boolean | PermissionCodegenOptions
}

export interface PermissionCodegenOptions {
  /**
   * Permission definition file globs relative to the Nuxt app root.
   * @default ['convex/auth/permissions.ts']
   */
  include?: string[]
}

/**
 * Default options for query composables (useConvexQuery, useConvexPaginatedQuery).
 * These can be overridden on a per-query basis.
 */
export interface QueryDefaults {
  /**
   * Run query on server during SSR.
   * @default true
   */
  server?: boolean
  /**
   * Subscribe to real-time updates via WebSocket.
   * @default true
   */
  subscribe?: boolean
}

export interface UploadDefaults {
  /**
   * Maximum number of concurrent uploads.
   * @default 3
   */
  maxConcurrent?: number
}

export interface McpOptions {
  /** Name shown to MCP clients. */
  name?: string
  /** Enable MCP session state. @default false */
  sessions?: boolean
}

export interface ModuleOptions {
  /** Convex deployment URL (WebSocket) — e.g., https://your-app.convex.cloud */
  url?: string
  /**
   * Enable authentication and configure auth behavior.
   *
   * Shorthand forms:
   * - `auth: true` — enable auth with all defaults
   *
   * Full object form for advanced configuration:
   * - `auth: { routeProtection: { redirectTo: '/login' }, cache: { enabled: true } }`
   *
   * @example
   * ```ts
   * // Zero-config auth:
   * trellis: { auth: true }
   *
   * // Full control:
   * trellis: { auth: { routeProtection: { redirectTo: '/login', preserveReturnTo: true } } }
   * ```
   */
  auth?: AuthOptions | boolean
  /**
   * Config-driven access context wiring for built-in useAccess/useAuthGuard.
   * String shorthand: `'permissions/context.getAccessContext'` is equivalent to
   * `{ query: 'permissions/context.getAccessContext' }`.
   */
  permissions?: string | PermissionsOptions
  /** MCP (Model Context Protocol) configuration. Enabled when @nuxtjs/mcp-toolkit is installed. */
  mcp?: McpOptions
  /**
   * Default behavior for query composables.
   *
   * @example
   * ```ts
   * trellis: { query: { server: false } } // Disable SSR globally
   * ```
   */
  query?: QueryDefaults
  /** Default options for upload composables. */
  upload?: UploadDefaults
  /**
   * Semantic observability for correlated Trellis runtime events.
   * Trellis owns the semantic model; delivery is intentionally outside core.
   */
  observability?: TrellisObservabilityOptions
  /**
   * Build/startup validation behavior.
   */
  validation?: {
    /**
     * Promote build-time validation warnings to startup/build errors.
     * @default false
     */
    strict?: boolean
  }
}

/**
 * Normalize the `auth` option shorthand forms into a full AuthOptions object.
 * - `true` → `{ enabled: true }`
 * - `false` → `{ enabled: false }`
 * - `undefined` → `{ enabled: false }` so public apps stay public unless auth is explicit
 * - Full object → passed through unchanged
 */
export function normalizeAuthShorthand(auth: AuthOptions | boolean | undefined): AuthOptions {
  if (auth === true) return { enabled: true }
  if (auth === false) return { enabled: false }
  if (auth === undefined) return { enabled: false }
  return auth
}

export function createConfiguredFunctionError(
  kind: 'permissions.query',
  configuredPath: string,
  availablePaths: string[],
): Error {
  const suggestions = availablePaths
    .filter(
      (candidate) =>
        candidate.includes(configuredPath.split('.').slice(-1)[0] ?? '') ||
        candidate.includes(configuredPath.split('.')[0] ?? ''),
    )
    .slice(0, 5)

  const suggestionText =
    suggestions.length > 0
      ? ` Did you mean: ${suggestions.join(', ')}?`
      : ` Available Convex functions: ${availablePaths.slice(0, 20).join(', ')}${availablePaths.length > 20 ? ', ...' : ''}`

  return new Error(
    `[trellis] Invalid trellis.${kind}: "${configuredPath}".` +
      ` No matching Convex function export was found in /convex.${suggestionText}`,
  )
}
