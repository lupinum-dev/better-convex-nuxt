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
import type { LogLevel } from './runtime/utils/logger'
import {
  getSiteUrlResolutionHint,
  isValidAbsoluteUrl,
  normalizeAuthRoute,
  resolveConvexSiteUrl,
} from './runtime/utils/convex-config'
import { normalizeConvexAuthConfig, type ConvexAuthConfigInput } from './runtime/utils/auth-config'

// Re-export LogLevel from logger for external use
export type { LogLevel } from './runtime/utils/logger'
export type { ConvexAuthPageMeta } from './runtime/utils/auth-route-protection'

const logger = useLogger('better-convex-nuxt')

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
   * Determines how long tokens are cached before requiring a fresh fetch.
   * Shorter TTL = more security, longer TTL = better performance.
   * @default 900 (15 minutes)
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
   * Don't block navigation, load in background.
   * @default false
   */
  lazy?: boolean
  /**
   * Subscribe to real-time updates via WebSocket.
   * @default true
   */
  subscribe?: boolean
  /**
   * Skip auth checks for public queries.
   * @default false
   */
  public?: boolean
}

export interface UploadDefaults {
  /**
   * Maximum number of concurrent uploads for useConvexUploadQueue.
   * @default 3
   */
  maxConcurrent?: number
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
   * Enables auth composables (useAuth, useConvexAuth), SSR token exchange, route protection,
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
   *       ttl: 900 // 15 minutes
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
   *       server: false,  // Disable SSR globally
   *       lazy: true      // Enable lazy loading globally
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
    url: process.env.CONVEX_URL,
    siteUrl: undefined,
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
    authRoute: '/api/auth',
    trustedOrigins: [],
    skipAuthRoutes: [],
    permissions: false,
    logging: false,
    debug: {
      authFlow: false,
      clientAuthFlow: false,
      serverAuthFlow: false,
    },
    authCache: {
      enabled: false,
      ttl: 900, // 15 minutes
    },
    defaults: {
      server: true, // SSR enabled by default (like Nuxt's useFetch)
      lazy: false,
      subscribe: true,
      public: false,
    },
    upload: {
      maxConcurrent: 3,
    },
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    // Validate Convex URL format
    if (options.url && !isValidAbsoluteUrl(options.url)) {
      logger.warn(`Invalid Convex URL format: "${options.url}". Expected a valid URL like "https://your-app.convex.cloud"`)
    }

    const siteUrlResolution = resolveConvexSiteUrl({
      url: options.url,
      siteUrl: options.siteUrl,
    })
    const resolvedSiteUrl = siteUrlResolution.siteUrl

    // Validate site URL format if we have one
    if (resolvedSiteUrl && !isValidAbsoluteUrl(resolvedSiteUrl)) {
      logger.warn(`Invalid Convex site URL format: "${resolvedSiteUrl}". Expected a valid URL like "https://your-app.convex.site"`)
    }

    const normalizedAuthConfig = normalizeConvexAuthConfig(options.auth)
    const isAuthEnabled = normalizedAuthConfig.enabled

    // Get custom auth route or use default
    const authRoute = normalizeAuthRoute(options.authRoute)

    // Validate auth configuration
    // Note: During `nuxt prepare`, env vars may not be loaded yet, so we warn instead of error
    // Runtime validation happens in the plugins when the actual values are available
    if (isAuthEnabled && !resolvedSiteUrl) {
      logger.warn(`auth: true but no usable siteUrl was resolved. ${getSiteUrlResolutionHint(options.url)}`)
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
        permissions: options.permissions ?? false,
        logging: options.logging ?? false,
        debug: {
          authFlow: options.debug?.authFlow ?? false,
          clientAuthFlow: options.debug?.clientAuthFlow ?? false,
          serverAuthFlow: options.debug?.serverAuthFlow ?? false,
        },
        authCache: {
          enabled: options.authCache?.enabled ?? false,
          ttl: options.authCache?.ttl ?? 900,
        },
        defaults: {
          server: options.defaults?.server ?? true, // SSR enabled by default
          lazy: options.defaults?.lazy ?? false,
          subscribe: options.defaults?.subscribe ?? true,
          public: options.defaults?.public ?? false,
        },
        upload: {
          maxConcurrent: options.upload?.maxConcurrent ?? 3,
        },
      },
    )
    nuxt.options.runtimeConfig.public.convex = convexConfig

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
      addServerHandler({
        route: `${authRoute}/**`,
        handler: resolver.resolve('./runtime/server/api/auth/[...]'),
      })
    }

    // 5. Register Type Augmentation for IDE support
    addTemplate({
      filename: 'types/better-convex-nuxt.d.ts',
      getContents: () => `
import type { ConvexClient } from 'convex/browser'
import type { createAuthClient } from 'better-auth/vue'
import type { RouteLocationRaw } from 'vue-router'

type AuthClient = ReturnType<typeof createAuthClient>

declare module '#app' {
  interface NuxtApp {
    $convex: ConvexClient
    $auth?: AuthClient
  }

    interface PageMeta {
    /**
     * Skip Convex auth check for this page.
     * Useful for marketing pages that don't need authentication.
     */
      skipConvexAuth?: boolean
      /**
       * Opt-in route protection powered by better-convex-nuxt.
       * true = require auth (default redirect), object = custom redirect.
       */
      convexAuth?: boolean | { redirectTo?: RouteLocationRaw }
    }
  }

declare module 'vue' {
  interface ComponentCustomProperties {
    $convex: ConvexClient
    $auth?: AuthClient
  }
}

export {}
`,
    })

    // 6. Auto-import composables (non-auth, always available)
    addImports([
      { name: 'useConvex', from: resolver.resolve('./runtime/composables/useConvex') },
      {
        name: 'useConvexMutation',
        from: resolver.resolve('./runtime/composables/useConvexMutation'),
      },
      { name: 'useConvexAction', from: resolver.resolve('./runtime/composables/useConvexAction') },
      { name: 'useConvexQuery', from: resolver.resolve('./runtime/composables/useConvexQuery') },
      { name: 'getQueryKey', from: resolver.resolve('./runtime/composables/useConvexQuery') },
      {
        name: 'useConvexPaginatedQuery',
        from: resolver.resolve('./runtime/composables/useConvexPaginatedQuery'),
      },
      {
        name: 'useConvexConnectionState',
        from: resolver.resolve('./runtime/composables/useConvexConnectionState'),
      },
      // Optimistic update helpers for regular queries
      { name: 'updateQuery', from: resolver.resolve('./runtime/composables/useConvexMutation') },
      { name: 'setQueryData', from: resolver.resolve('./runtime/composables/useConvexMutation') },
      {
        name: 'updateAllQueries',
        from: resolver.resolve('./runtime/composables/useConvexMutation'),
      },
      {
        name: 'deleteFromQuery',
        from: resolver.resolve('./runtime/composables/useConvexMutation'),
      },
      // Optimistic update helpers for paginated queries
      {
        name: 'insertAtTop',
        from: resolver.resolve('./runtime/composables/useConvexPaginatedQuery'),
      },
      {
        name: 'insertAtPosition',
        from: resolver.resolve('./runtime/composables/useConvexPaginatedQuery'),
      },
      {
        name: 'insertAtBottomIfLoaded',
        from: resolver.resolve('./runtime/composables/useConvexPaginatedQuery'),
      },
      {
        name: 'optimisticallyUpdateValueInPaginatedQuery',
        from: resolver.resolve('./runtime/composables/useConvexPaginatedQuery'),
      },
      {
        name: 'deleteFromPaginatedQuery',
        from: resolver.resolve('./runtime/composables/useConvexPaginatedQuery'),
      },
      // File upload composables
      {
        name: 'useConvexFileUpload',
        from: resolver.resolve('./runtime/composables/useConvexFileUpload'),
      },
      {
        name: 'useConvexUploadQueue',
        from: resolver.resolve('./runtime/composables/useConvexUploadQueue'),
      },
      {
        name: 'useConvexStorageUrl',
        from: resolver.resolve('./runtime/composables/useConvexStorageUrl'),
      },
    ])

    // 6b. Auth composables and components (only when auth enabled)
    if (isAuthEnabled) {
      addImports([
        { name: 'useAuth', from: resolver.resolve('./runtime/composables/useAuth') },
        { name: 'useConvexAuth', from: resolver.resolve('./runtime/composables/useConvexAuth') },
      ])

      // Register auth components
      addComponentsDir({
        path: resolver.resolve('./runtime/components'),
        global: true,
      })
    }

    // 6c. Conditionally add permission composables
    if (options.permissions) {
      addImports([
        {
          name: 'createPermissions',
          from: resolver.resolve('./runtime/composables/usePermissions'),
        },
      ])
    }

    // 7. Auto-import server utilities
    addServerImports([
      { name: 'fetchQuery', from: resolver.resolve('./runtime/server/utils/convex') },
      { name: 'fetchMutation', from: resolver.resolve('./runtime/server/utils/convex') },
      { name: 'fetchAction', from: resolver.resolve('./runtime/server/utils/convex') },
      { name: 'clearAuthCache', from: resolver.resolve('./runtime/server/utils/auth-cache') },
    ])

    // 9. Add types to tsconfig references
    nuxt.hook('prepare:types', (opts) => {
      opts.references.push({
        path: resolver.resolve(nuxt.options.buildDir, 'types/better-convex-nuxt.d.ts'),
      })
    })

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
  ;(nuxt as Nuxt & {
    hook: (name: 'devtools:customTabs', cb: (tabs: Array<Record<string, unknown>>) => void) => void
  }).hook('devtools:customTabs', (tabs) => {
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
