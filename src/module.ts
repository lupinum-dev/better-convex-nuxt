import { defineNuxtModule, createResolver, useLogger } from '@nuxt/kit'
import { defu } from 'defu'

import { collectConvexFunctionPaths } from './analysis/project'
import { collectModuleValidationFindings } from './analysis/validation'
import { setupConvexDevtools } from './devtools'
import { installAdvancedTrellis } from './installers/advanced'
import { installAuthTrellis } from './installers/auth'
import { installCoreTrellis } from './installers/core'
import { installPermissionTrellis } from './installers/permissions'
import { normalizeConvexAuthConfig, type ConvexAuthConfigInput } from './runtime/utils/auth-config'
import { DEFAULT_UPLOAD_MAX_CONCURRENT } from './runtime/utils/constants'
import {
  getSiteUrlResolutionHint,
  isValidAbsoluteUrl,
  normalizeAuthRoute,
  resolveConvexSiteUrl,
} from './runtime/utils/convex-config'
import type { LogLevel } from './runtime/utils/logger'

// Re-export LogLevel from logger for external use
export type { LogLevel } from './runtime/utils/logger'
export type { ConvexAuthPageMeta } from './runtime/utils/auth-route-protection'

const logger = useLogger('trellis')

/**
 * Normalize the `auth` option shorthand forms into a full AuthOptions object.
 * - `true` → `{ enabled: true }`
 * - `false` / `undefined` → `{ enabled: false }`
 * - Full object → passed through unchanged
 */
function normalizeAuthShorthand(auth: AuthOptions | boolean | undefined): AuthOptions {
  if (auth === true) return { enabled: true }
  if (auth === false || auth === undefined) return { enabled: false }
  return auth
}

function normalizeAuthCacheTtl(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return 60
  const normalized = Math.trunc(input)
  if (normalized < 1) return 1
  if (normalized > 60) return 60
  return normalized
}

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
   * Also use definePageMeta({ skipConvexAuth: true }) for per-page control.
   * @default []
   */
  skipAuthRoutes?: string[]
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
   * App-owned query that returns the frontend permission context.
   * Format: `<modulePath>.<exportName>` like `workspaces.getPermissionContext`.
   */
  query: string
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
   * Config-driven permission context wiring for built-in usePermissions/useAuthGuard.
   * String shorthand: `'workspaces.getPermissionContext'` is equivalent to
   * `{ query: 'workspaces.getPermissionContext' }`.
   */
  permissions?: string | PermissionsOptions
  /**
   * Enable trusted caller infrastructure for server-to-server auth.
   * @default false
   */
  trustedCallers?: boolean
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
   * Enable module logging.
   * - false: No logs (production default)
   * - 'info': Simple logs for everyday use
   * - 'debug': Detailed logs with timing for deep debugging
   * @default false
   */
  logging?: LogLevel
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

function normalizeConfiguredFunctionPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (!normalized) return undefined
  return normalized
}

function splitConfiguredFunctionPath(
  path: string,
): { modulePath: string; exportName: string } | null {
  const lastDot = path.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === path.length - 1) return null
  return {
    modulePath: path.slice(0, lastDot),
    exportName: path.slice(lastDot + 1),
  }
}

function createConfiguredFunctionError(
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

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@lupinum/trellis',
    configKey: 'trellis',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },
  defaults: {
    url: process.env.NUXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL,
    auth: {
      enabled: true,
      route: '/api/auth',
      trustedOrigins: [],
      skipAuthRoutes: [],
      routeProtection: {
        redirectTo: '/auth/signin',
        preserveReturnTo: true,
      },
      unauthorized: {
        enabled: false,
        redirectTo: '/auth/signin',
        includeQueries: false,
      },
      cache: {
        enabled: false,
        ttl: 60,
      },
      proxy: {
        maxRequestBodyBytes: 1_048_576,
        maxResponseBodyBytes: 1_048_576,
      },
    },
    permissions: undefined,
    trustedCallers: false,
    mcp: undefined,
    query: {
      server: true,
      subscribe: true,
    },
    upload: {
      maxConcurrent: DEFAULT_UPLOAD_MAX_CONCURRENT,
    },
    logging: false,
    validation: {
      strict: false,
    },
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    // Validate Convex URL format
    if (options.url && !isValidAbsoluteUrl(options.url)) {
      logger.warn(
        `Invalid Convex URL format: "${options.url}". Expected a valid URL like "https://your-app.convex.cloud"`,
      )
    }

    const siteUrlResolution = resolveConvexSiteUrl({
      url: options.url,
      siteUrl: process.env.NUXT_PUBLIC_CONVEX_SITE_URL || process.env.CONVEX_SITE_URL,
    })
    const resolvedSiteUrl = siteUrlResolution.siteUrl

    // Validate site URL format if we have one
    if (resolvedSiteUrl && !isValidAbsoluteUrl(resolvedSiteUrl)) {
      logger.warn(
        `Invalid Convex site URL format: "${resolvedSiteUrl}". Expected a valid URL like "https://your-app.convex.site"`,
      )
    }

    // Normalize auth shorthand (true / full object) to AuthOptions
    const authOptions = normalizeAuthShorthand(options.auth)

    const normalizedAuthConfig = normalizeConvexAuthConfig(authOptions)
    const isAuthEnabled = normalizedAuthConfig.enabled
    const validationStrict = options.validation?.strict === true
    const permissionQueryPath = normalizeConfiguredFunctionPath(
      typeof options.permissions === 'string' ? options.permissions : options.permissions?.query,
    )
    const authRoute = normalizeAuthRoute(authOptions?.route ?? '/api/auth')

    // Note: During `nuxt prepare`, env vars may not be loaded yet, so we warn instead of error.
    // Runtime validation happens in the plugins when the actual values are available.
    const hasConfiguredConvexLocation =
      Boolean(options.url) ||
      Boolean(
        process.env.NUXT_PUBLIC_CONVEX_URL ||
        process.env.CONVEX_URL ||
        process.env.NUXT_PUBLIC_CONVEX_SITE_URL ||
        process.env.CONVEX_SITE_URL,
      )

    if (isAuthEnabled && !resolvedSiteUrl && hasConfiguredConvexLocation) {
      logger.warn(
        `auth.enabled = true but no usable siteUrl was resolved. ${getSiteUrlResolutionHint(options.url)}`,
      )
    }

    const normalizedAuthCacheTtl = normalizeAuthCacheTtl(authOptions?.cache?.ttl)
    if ((authOptions?.cache?.ttl ?? 60) !== normalizedAuthCacheTtl) {
      logger.warn(
        `trellis.auth.cache.ttl must be between 1 and 60 seconds. Using ${normalizedAuthCacheTtl}s instead.`,
      )
    }

    // 1. Safe Configuration Merging (preserves user-defined runtimeConfig)
    const convexConfig = defu(
      nuxt.options.runtimeConfig.public.convex as Record<string, unknown> | undefined,
      {
        url: options.url || '',
        siteUrl: resolvedSiteUrl || '',
        auth: {
          ...normalizedAuthConfig,
          route: authRoute,
          trustedOrigins: authOptions?.trustedOrigins ?? [],
          skipAuthRoutes: authOptions?.skipAuthRoutes ?? [],
          cache: {
            enabled: authOptions?.cache?.enabled ?? false,
            ttl: normalizedAuthCacheTtl,
          },
          proxy: {
            maxRequestBodyBytes: authOptions?.proxy?.maxRequestBodyBytes ?? 1_048_576,
            maxResponseBodyBytes: authOptions?.proxy?.maxResponseBodyBytes ?? 1_048_576,
          },
        },
        permissions: {
          query: permissionQueryPath ?? null,
        },
        query: {
          server: options.query?.server ?? true,
          subscribe: options.query?.subscribe ?? true,
        },
        upload: {
          maxConcurrent: options.upload?.maxConcurrent ?? 3,
        },
        logging: options.logging ?? false,
      },
    )
    nuxt.options.runtimeConfig.public.convex = convexConfig

    const availableConvexFunctions = permissionQueryPath
      ? collectConvexFunctionPaths(nuxt.options.rootDir)
      : []

    if (permissionQueryPath && !availableConvexFunctions.includes(permissionQueryPath)) {
      throw createConfiguredFunctionError(
        'permissions.query',
        permissionQueryPath,
        availableConvexFunctions,
      )
    }

    for (const finding of collectModuleValidationFindings({
      rootDir: nuxt.options.rootDir,
      authEnabled: isAuthEnabled,
    })) {
      const message = `[trellis] ${finding.message}`
      if (validationStrict) {
        throw new Error(message)
      }
      logger.warn(message)
    }

    installCoreTrellis({ nuxt, resolver, logger })

    if (isAuthEnabled) {
      installAuthTrellis({
        resolver,
        authRoute,
      })
    }

    installAdvancedTrellis({ nuxt, resolver })

    if (permissionQueryPath) {
      const parsed = splitConfiguredFunctionPath(permissionQueryPath)
      if (!parsed) {
        throw new Error(
          `[trellis] Invalid trellis.permissions.query: "${permissionQueryPath}". Expected "<modulePath>.<exportName>".`,
        )
      }

      installPermissionTrellis({
        resolver,
        permissionQueryPath,
      })
    }

    // 10. Setup Nuxt DevTools integration (dev mode only)
    if (nuxt.options.dev) {
      setupConvexDevtools(nuxt)
      logger.info('Nuxt DevTools integration enabled')
    }
  },
})
