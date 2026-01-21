import {
  defineNuxtModule,
  addPlugin,
  createResolver,
  addTemplate,
  addImports,
  addServerHandler,
  addServerImports,
  addComponentsDir,
  useLogger,
} from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { defu } from 'defu'
import type { LogLevel } from './runtime/utils/logger'

// Re-export LogLevel from logger for external use
export type { LogLevel } from './runtime/utils/logger'

const logger = useLogger('better-convex-nuxt')

/**
 * Validate that a string is a valid URL.
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Derive the Convex site URL (HTTP Actions) from the deployment URL.
 * Replaces .convex.cloud with .convex.site
 */
function deriveSiteUrl(url: string): string | undefined {
  if (!url) return undefined
  if (url.includes('.convex.cloud')) {
    return url.replace('.convex.cloud', '.convex.site')
  }
  return undefined
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
   * Enable authentication features.
   * When true, enables auth composables (useConvexAuth, useAuthClient) and SSR token exchange.
   * In SSR mode, automatically creates the auth proxy route.
   * Requires a valid Convex URL (to derive siteUrl) or an explicit siteUrl.
   * Set to false to disable auth if you only need Convex without Better Auth.
   * @default true
   */
  auth?: boolean
  /**
   * Custom route path for the auth proxy.
   * Defaults to '/api/auth'.
   * The module will register a catch-all handler at `${authRoute}/**`.
   * @default '/api/auth'
   */
  authRoute?: string
  /**
   * Additional trusted origins for CORS validation on the auth proxy.
   * By default, only requests from the origin matching siteUrl are allowed.
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
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'better-convex-nuxt',
    configKey: 'convex',
    compatibility: {
      nuxt: '>=3.0.0',
    },
  },
  defaults: {
    url: process.env.CONVEX_URL,
    siteUrl: process.env.CONVEX_SITE_URL,
    auth: true, // Enabled by default - this is a better-auth integration module
    authRoute: '/api/auth',
    trustedOrigins: [],
    skipAuthRoutes: [],
    permissions: false,
    logging: false,
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
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    // Validate Convex URL format
    if (options.url && !isValidUrl(options.url)) {
      logger.warn(`Invalid Convex URL format: "${options.url}". Expected a valid URL like "https://your-app.convex.cloud"`)
    }

    // Derive siteUrl from url if not explicitly provided
    const resolvedSiteUrl = options.siteUrl || deriveSiteUrl(options.url || '')

    // Validate site URL format if we have one
    if (resolvedSiteUrl && !isValidUrl(resolvedSiteUrl)) {
      logger.warn(`Invalid Convex site URL format: "${resolvedSiteUrl}". Expected a valid URL like "https://your-app.convex.site"`)
    }

    // Determine if auth is enabled
    const isAuthEnabled = options.auth === true

    // Get custom auth route or use default
    const authRoute = options.authRoute || '/api/auth'

    // Validate auth configuration
    // Note: During `nuxt prepare`, env vars may not be loaded yet, so we warn instead of error
    // Runtime validation happens in the plugins when the actual values are available
    if (isAuthEnabled && !resolvedSiteUrl && options.url) {
      // URL is set but couldn't derive siteUrl (e.g., custom domain without explicit siteUrl)
      logger.warn('auth: true but could not derive siteUrl from url. Set siteUrl explicitly for custom domains.')
    }

    // 1. Safe Configuration Merging (preserves user-defined runtimeConfig)
    const convexConfig = defu(
      nuxt.options.runtimeConfig.public.convex as Record<string, unknown> | undefined,
      {
        url: options.url || '',
        siteUrl: resolvedSiteUrl || '',
        auth: isAuthEnabled,
        authRoute,
        trustedOrigins: options.trustedOrigins ?? [],
        skipAuthRoutes: options.skipAuthRoutes ?? [],
        logging: options.logging ?? false,
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

    // 4. Register Auth Proxy Route (only when auth is enabled AND SSR is enabled)
    // In SPA mode, the browser talks directly to Convex, no proxy needed
    if (isAuthEnabled && nuxt.options.ssr) {
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
        name: 'useConvexStorageUrl',
        from: resolver.resolve('./runtime/composables/useConvexStorageUrl'),
      },
    ])

    // 6b. Auth composables and components (only when auth enabled)
    if (isAuthEnabled) {
      addImports([
        { name: 'useConvexAuth', from: resolver.resolve('./runtime/composables/useConvexAuth') },
        { name: 'useAuthClient', from: resolver.resolve('./runtime/composables/useAuthClient') },
        { name: 'useAuthReady', from: resolver.resolve('./runtime/composables/useAuthReady') },
        { name: 'useRequireAuth', from: resolver.resolve('./runtime/composables/useRequireAuth') },
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
  nuxt.hook('devtools:customTabs', (tabs) => {
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
