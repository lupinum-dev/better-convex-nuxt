import { existsSync } from 'node:fs'

import {
  defineNuxtModule,
  addPlugin,
  createResolver,
  addTemplate,
  addImports,
  addServerHandler,
  addServerImports,
  addComponentsDir,
  addRouteMiddleware,
  useLogger,
} from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { defu } from 'defu'

import { registerConvexAliases } from './module-aliases'
import {
  authAutoImports,
  composableAutoImports,
  permissionAutoImports,
  serverAutoImports,
  type ModuleImportRegistration,
} from './module-api-surface'
import {
  getMissingConvexApiTemplateContents,
  getTypeAugmentationTemplateContents,
} from './module-templates'
import { normalizeConvexAuthConfig, type ConvexAuthConfigInput } from './runtime/utils/auth-config'
import { CONVEX_MODULE_DEFAULTS, normalizeAuthCacheTtl } from './runtime/utils/config-defaults'
import {
  getSiteUrlResolutionHint,
  isValidAbsoluteUrl,
  normalizeAuthRoute,
  resolveConvexSiteUrl,
} from './runtime/utils/convex-config'
import type { LogLevel } from './runtime/utils/logger'
import type { ConvexQueryAuthMode } from './runtime/utils/query-execution-gate'

// Re-export LogLevel from logger for external use
export type { LogLevel } from './runtime/utils/logger'
export type { ConvexAuthPageMeta } from './runtime/utils/auth-route-protection'
export type { ConvexUser } from './runtime/utils/types'

const logger = useLogger('better-convex-nuxt')

function hasGeneratedConvexApi(aliasPath: string): boolean {
  return (
    existsSync(aliasPath) ||
    existsSync(`${aliasPath}.ts`) ||
    existsSync(`${aliasPath}.js`) ||
    existsSync(`${aliasPath}.d.ts`)
  )
}

function resolveModuleImports(
  resolver: ReturnType<typeof createResolver>,
  imports: readonly ModuleImportRegistration[],
): ModuleImportRegistration[] {
  return imports.map((entry) => ({
    name: entry.name,
    from: resolver.resolve(entry.from),
  }))
}

export interface AuthCacheOptions {
  /**
   * Enable SSR auth token caching.
   * When enabled, Convex JWT tokens are cached to reduce TTFB on subsequent SSR requests.
   * Uses Nitro Storage (memory by default, configurable to Redis for multi-instance deployments).
   * @default false
   */
  enabled?: boolean
  /**
   * Cache TTL in seconds.
   * Determines how long tokens are cached before requiring a fresh fetch.
   * Shorter TTL = more security, longer TTL = better performance.
   * @default 60 (1 minute)
   */
  ttl?: number
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
  /**
   * Auth token behavior for query composables.
   * - 'auto': attach token when available
   * - 'none': never attach token
   * @default 'auto'
   */
  auth?: ConvexQueryAuthMode
  /**
   * How long an awaited subscribe-mode query waits (ms) for its first WebSocket
   * result before rejecting. Set 0 to wait indefinitely.
   * @default 10000
   */
  waitTimeoutMs?: number
}

export interface UploadDefaults {
  /**
   * Maximum number of concurrent uploads for useConvexUploadQueue.
   * @default 3
   */
  maxConcurrent?: number
}

export interface AuthProxyDefaults {
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

export interface ConvexDebugOptions {
  /**
   * Enable detailed auth flow logs on both client and server plugins.
   * Requires `logging: 'debug'` to print verbose phase logs.
   * @default false
   */
  authFlow?: boolean
  /**
   * Enable detailed auth flow logs on the client plugin only.
   * @default false
   */
  clientAuthFlow?: boolean
  /**
   * Enable detailed auth flow logs on the server plugin only.
   * @default false
   */
  serverAuthFlow?: boolean
}

export interface ModuleOptions {
  /** Convex deployment URL (WebSocket) - e.g., https://your-app.convex.cloud */
  url?: string
  /**
   * Convex site URL (HTTP Actions) - e.g., https://your-app.convex.site.
   * Used for HTTP Actions (webhooks, etc.) and required for authentication.
   * If not provided, automatically derived from `url` by replacing .convex.cloud with .convex.site.
   */
  siteUrl?: string
  /**
   * Authentication configuration.
   * Enables the auth composable (useConvexAuth), SSR token exchange, route protection,
   * and optional unauthorized-session recovery behavior.
   *
   * Set `auth.enabled = false` to disable auth features if you only need Convex without Better Auth.
   *
   * @default { enabled: true, routeProtection: { redirectTo: '/auth/signin', preserveReturnTo: true }, unauthorized: { enabled: false, redirectTo: '/auth/signin', includeQueries: false } }
   */
  auth?: ConvexAuthConfigInput
  /**
   * Custom route path for the auth proxy.
   * Defaults to '/api/auth'.
   * The module will register a catch-all handler at `${authRoute}/**`.
   * @default '/api/auth'
   */
  authRoute?: string
  /**
   * Additional trusted origins for CORS validation on the auth proxy.
   * Same-origin requests are always allowed automatically.
   * Use this for cross-origin scenarios like iframes or separate frontend domains.
   * Supports wildcards for preview deployments (e.g., 'https://preview-*.vercel.app').
   * @default []
   */
  trustedOrigins?: string[]
  /**
   * Routes that should skip auth checks entirely.
   * Useful for marketing pages that never need authentication.
   * Supports glob patterns (e.g., '/docs/**', '/blog/**').
   * Can also use definePageMeta({ skipConvexAuth: true }) for per-page control.
   * @default []
   */
  skipAuthRoutes?: string[]
  /**
   * Enable permission composables (createPermissions factory).
   * When true, auto-imports createPermissions for building usePermissions.
   * @default false
   */
  permissions?: boolean
  /**
   * Enable module logging.
   * - false: No logs (production default)
   * - 'info': Simple logs for everyday use
   * - 'debug': Detailed logs with timing for deep debugging
   * @default false
   */
  logging?: LogLevel
  /**
   * Optional debug channels for runtime plugins.
   * Use this to enable high-verbosity trace logs without changing regular logger behavior.
   * @default { authFlow: false, clientAuthFlow: false, serverAuthFlow: false }
   */
  debug?: ConvexDebugOptions
  /**
   * SSR auth token caching configuration (opt-in).
   * Caches Convex JWT tokens server-side to reduce TTFB on subsequent requests.
   *
   * @example
   * ```ts
   * // nuxt.config.ts
   * export default defineNuxtConfig({
   *   convex: {
   *     authCache: {
   *       enabled: true,
   *       ttl: 60 // 60 seconds
   *     }
   *   },
   *   // For multi-instance deployments, configure Redis:
   *   nitro: {
   *     storage: {
   *       'cache:convex:auth': {
   *         driver: 'redis',
   *         url: process.env.REDIS_URL
   *       }
   *     }
   *   }
   * })
   * ```
   */
  authCache?: AuthCacheOptions
  /**
   * Default options for query composables (useConvexQuery, useConvexPaginatedQuery).
   * Per-query options override these defaults.
   *
   * @example
   * ```ts
   * // nuxt.config.ts
   * export default defineNuxtConfig({
   *   convex: {
   *     defaults: {
   *       server: false // Disable SSR globally
   *     }
   *   }
   * })
   * ```
   */
  defaults?: QueryDefaults
  /**
   * Default options for upload composables.
   */
  upload?: UploadDefaults
  /**
   * Default body size limits for auth proxy.
   */
  authProxy?: AuthProxyDefaults
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'better-convex-nuxt',
    configKey: 'convex',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },
  defaults: {
    url: process.env.NUXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL,
    siteUrl: process.env.NUXT_PUBLIC_CONVEX_SITE_URL || process.env.CONVEX_SITE_URL,
    auth: {
      enabled: true,
      routeProtection: {
        redirectTo: '/auth/signin',
        preserveReturnTo: true,
      },
      unauthorized: {
        enabled: false,
        redirectTo: '/auth/signin',
        includeQueries: false,
      },
    },
    authRoute: CONVEX_MODULE_DEFAULTS.authRoute,
    trustedOrigins: [],
    skipAuthRoutes: [],
    permissions: CONVEX_MODULE_DEFAULTS.permissions,
    logging: CONVEX_MODULE_DEFAULTS.logging,
    debug: { ...CONVEX_MODULE_DEFAULTS.debug },
    authCache: { ...CONVEX_MODULE_DEFAULTS.authCache },
    defaults: { ...CONVEX_MODULE_DEFAULTS.defaults },
    upload: { ...CONVEX_MODULE_DEFAULTS.upload },
    authProxy: { ...CONVEX_MODULE_DEFAULTS.authProxy },
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const generatedConvexApiAlias = resolver.resolve(nuxt.options.rootDir, 'convex/_generated/api')
    const missingConvexApiTemplate = addTemplate({
      filename: 'better-convex-nuxt/convex-api-missing.ts',
      write: true,
      getContents: getMissingConvexApiTemplateContents,
    })
    const convexApiAlias = hasGeneratedConvexApi(generatedConvexApiAlias)
      ? generatedConvexApiAlias
      : missingConvexApiTemplate.dst

    // Validate Convex URL format
    if (options.url && !isValidAbsoluteUrl(options.url)) {
      logger.warn(
        `Invalid Convex URL format: "${options.url}". Expected a valid URL like "https://your-app.convex.cloud"`,
      )
    }

    const siteUrlResolution = resolveConvexSiteUrl({
      url: options.url,
      siteUrl: options.siteUrl,
    })
    const resolvedSiteUrl = siteUrlResolution.siteUrl

    // Validate site URL format if we have one
    if (resolvedSiteUrl && !isValidAbsoluteUrl(resolvedSiteUrl)) {
      logger.warn(
        `Invalid Convex site URL format: "${resolvedSiteUrl}". Expected a valid URL like "https://your-app.convex.site"`,
      )
    }

    const normalizedAuthConfig = normalizeConvexAuthConfig(options.auth)
    const isAuthEnabled = normalizedAuthConfig.enabled

    // Get custom auth route or use default
    const authRoute = normalizeAuthRoute(options.authRoute)

    // Validate auth configuration
    // Note: During `nuxt prepare`, env vars may not be loaded yet, so we warn instead of error
    // Runtime validation happens in the plugins when the actual values are available
    if (isAuthEnabled && !resolvedSiteUrl) {
      logger.warn(
        `auth: true but no usable siteUrl was resolved. ${getSiteUrlResolutionHint(options.url)}`,
      )
    }

    const normalizedAuthCacheTtl = normalizeAuthCacheTtl(options.authCache?.ttl)
    if (
      (options.authCache?.ttl ?? CONVEX_MODULE_DEFAULTS.authCache.ttl) !== normalizedAuthCacheTtl
    ) {
      logger.warn(
        `convex.authCache.ttl must be between 1 and 60 seconds. Using ${normalizedAuthCacheTtl}s instead.`,
      )
    }

    // 1. Safe Configuration Merging (preserves user-defined runtimeConfig)
    const convexConfig = defu(
      nuxt.options.runtimeConfig.public.convex as Record<string, unknown> | undefined,
      {
        url: options.url || '',
        siteUrl: resolvedSiteUrl || '',
        auth: normalizedAuthConfig,
        authRoute,
        trustedOrigins: options.trustedOrigins ?? [],
        skipAuthRoutes: options.skipAuthRoutes ?? [],
        permissions: options.permissions ?? CONVEX_MODULE_DEFAULTS.permissions,
        logging: options.logging ?? CONVEX_MODULE_DEFAULTS.logging,
        debug: {
          authFlow: options.debug?.authFlow ?? CONVEX_MODULE_DEFAULTS.debug.authFlow,
          clientAuthFlow:
            options.debug?.clientAuthFlow ?? CONVEX_MODULE_DEFAULTS.debug.clientAuthFlow,
          serverAuthFlow:
            options.debug?.serverAuthFlow ?? CONVEX_MODULE_DEFAULTS.debug.serverAuthFlow,
        },
        authCache: {
          enabled: options.authCache?.enabled ?? CONVEX_MODULE_DEFAULTS.authCache.enabled,
          ttl: normalizedAuthCacheTtl,
        },
        defaults: {
          server: options.defaults?.server ?? CONVEX_MODULE_DEFAULTS.defaults.server,
          subscribe: options.defaults?.subscribe ?? CONVEX_MODULE_DEFAULTS.defaults.subscribe,
          auth: options.defaults?.auth ?? CONVEX_MODULE_DEFAULTS.defaults.auth,
          waitTimeoutMs:
            options.defaults?.waitTimeoutMs ?? CONVEX_MODULE_DEFAULTS.defaults.waitTimeoutMs,
        },
        upload: {
          maxConcurrent:
            options.upload?.maxConcurrent ?? CONVEX_MODULE_DEFAULTS.upload.maxConcurrent,
        },
        authProxy: {
          maxRequestBodyBytes:
            options.authProxy?.maxRequestBodyBytes ??
            CONVEX_MODULE_DEFAULTS.authProxy.maxRequestBodyBytes,
          maxResponseBodyBytes:
            options.authProxy?.maxResponseBodyBytes ??
            CONVEX_MODULE_DEFAULTS.authProxy.maxResponseBodyBytes,
        },
      },
    )
    nuxt.options.runtimeConfig.public.convex = convexConfig
    registerConvexAliases({ nuxt, resolver, convexApiAlias })

    // 2. Register Server Plugin (runs first for SSR token exchange)
    addPlugin({
      src: resolver.resolve('./runtime/plugin.server'),
      mode: 'server',
    })

    // 3. Register Client Plugin (client-only via filename convention)
    addPlugin(resolver.resolve('./runtime/plugin.client'))

    if (isAuthEnabled) {
      addRouteMiddleware({
        name: 'convex-auth',
        path: resolver.resolve('./runtime/middleware/convex-auth.global'),
        global: true,
      })
    }

    // 4. Register Auth Proxy Route (when auth is enabled)
    // The proxy is needed even in SPA mode because:
    // - Better Auth cookies must be set on the app's domain (not Convex's domain)
    // - Cross-origin cookie setting is blocked by browsers
    if (isAuthEnabled) {
      // Register both exact and wildcard routes so requests without a trailing
      // slash (e.g. POST /api/auth) are not missed by the /** glob in Nitro.
      addServerHandler({
        route: authRoute,
        handler: resolver.resolve('./runtime/server/api/auth/[...]'),
      })
      addServerHandler({
        route: `${authRoute}/**`,
        handler: resolver.resolve('./runtime/server/api/auth/[...]'),
      })
    }

    // 5. Register Type Augmentation for IDE support
    addTemplate({
      filename: 'types/better-convex-nuxt.d.ts',
      getContents: () =>
        getTypeAugmentationTemplateContents(
          resolver.resolve('./runtime/utils/auth-route-protection'),
        ),
    })

    // 6. Auto-import composables (non-auth, always available)
    addImports(resolveModuleImports(resolver, composableAutoImports))

    // 6b. Auth composables and components (only when auth enabled)
    if (isAuthEnabled) {
      addImports(resolveModuleImports(resolver, authAutoImports))

      // Register auth components
      addComponentsDir({
        path: resolver.resolve('./runtime/components'),
        global: true,
      })
    }

    // 6c. Conditionally add permission composables
    if (options.permissions) {
      addImports(resolveModuleImports(resolver, permissionAutoImports))
    }

    // 7. Auto-import server utilities
    addServerImports(resolveModuleImports(resolver, serverAutoImports))

    // 10. Setup Nuxt DevTools integration (dev mode only)
    if (nuxt.options.dev) {
      setupDevTools(nuxt, resolver)
    }
  },
})

/**
 * Setup Nuxt DevTools integration.
 * Only called in dev mode.
 */
function setupDevTools(nuxt: Nuxt, resolver: ReturnType<typeof createResolver>): void {
  // Compute the absolute path to devtools output at module setup time
  const devtoolsOutputPath = resolver.resolve('./runtime/devtools/ui/dist')

  // Store the path in runtime config for server handler access
  nuxt.options.runtimeConfig.convexDevtoolsPath = devtoolsOutputPath

  // Register custom tab via Nuxt hook (more reliable than addCustomTab)
  ;(
    nuxt as Nuxt & {
      hook: (
        name: 'devtools:customTabs',
        cb: (tabs: Array<Record<string, unknown>>) => void,
      ) => void
    }
  ).hook('devtools:customTabs', (tabs) => {
    tabs.push({
      name: 'convex',
      title: 'Convex',
      icon: '/__convex_devtools__/convex-logo.svg',
      category: 'app',
      view: {
        type: 'iframe',
        src: '/__convex_devtools__',
        persistent: true,
      },
    })
  })

  // Add server route to serve DevTools UI
  addServerHandler({
    route: '/__convex_devtools__',
    handler: resolver.resolve('./runtime/devtools/server'),
  })

  // Also handle subpaths for assets
  addServerHandler({
    route: '/__convex_devtools__/**',
    handler: resolver.resolve('./runtime/devtools/server'),
  })

  logger.info('Nuxt DevTools integration enabled')
}
