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

import { DEFAULT_UPLOAD_MAX_CONCURRENT } from './runtime/utils/constants'
import { normalizeConvexAuthConfig, type ConvexAuthConfigInput } from './runtime/utils/auth-config'
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

const logger = useLogger('better-convex-nuxt')

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
   * convex: { auth: { cache: { enabled: true, ttl: 60 } } }
   * // For multi-instance: configure nitro.storage with driver: 'redis'
   * ```
   */
  cache?: AuthCacheOptions
  /**
   * Body size limits for the auth proxy.
   */
  proxy?: AuthProxyOptions
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

export interface ConvexDebugOptions {
  /**
   * Enable detailed auth flow logs on both client and server plugins.
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
  /** Convex deployment URL (WebSocket) — e.g., https://your-app.convex.cloud */
  url?: string
  /**
   * Convex site URL (HTTP Actions) — e.g., https://your-app.convex.site.
   * Auto-derived from `url` if not provided.
   */
  siteUrl?: string
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
   * convex: { auth: true }
   *
   * // Full control:
   * convex: { auth: { routeProtection: { redirectTo: '/login', preserveReturnTo: true } } }
   * ```
   */
  auth?: AuthOptions | boolean
  /**
   * Default behavior for query composables.
   *
   * @example
   * ```ts
   * convex: { query: { server: false } } // Disable SSR globally
   * ```
   */
  query?: QueryDefaults
  /** Default options for upload composables. */
  upload?: UploadDefaults
  /**
   * Enable permission composables (createPermissions factory).
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
   * High-verbosity trace channels for debugging the auth flow.
   */
  debug?: ConvexDebugOptions
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
    query: {
      server: true,
      subscribe: true,
    },
    upload: {
      maxConcurrent: DEFAULT_UPLOAD_MAX_CONCURRENT,
    },
    permissions: false,
    logging: false,
    debug: {
      authFlow: false,
      clientAuthFlow: false,
      serverAuthFlow: false,
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
      siteUrl: options.siteUrl,
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

    const authRoute = normalizeAuthRoute(authOptions?.route ?? '/api/auth')

    // Note: During `nuxt prepare`, env vars may not be loaded yet, so we warn instead of error.
    // Runtime validation happens in the plugins when the actual values are available.
    if (isAuthEnabled && !resolvedSiteUrl) {
      logger.warn(
        `auth.enabled = true but no usable siteUrl was resolved. ${getSiteUrlResolutionHint(options.url)}`,
      )
    }

    const normalizedAuthCacheTtl = normalizeAuthCacheTtl(authOptions?.cache?.ttl)
    if ((authOptions?.cache?.ttl ?? 60) !== normalizedAuthCacheTtl) {
      logger.warn(
        `convex.auth.cache.ttl must be between 1 and 60 seconds. Using ${normalizedAuthCacheTtl}s instead.`,
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
        query: {
          server: options.query?.server ?? true,
          subscribe: options.query?.subscribe ?? true,
        },
        upload: {
          maxConcurrent: options.upload?.maxConcurrent ?? 3,
        },
        permissions: options.permissions ?? false,
        logging: options.logging ?? false,
        debug: {
          authFlow: options.debug?.authFlow ?? false,
          clientAuthFlow: options.debug?.clientAuthFlow ?? false,
          serverAuthFlow: options.debug?.serverAuthFlow ?? false,
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
      getContents: () => `
import type { ConvexClient } from 'convex/browser'
import type { createAuthClient } from 'better-auth/vue'
import type { RouteLocationRaw } from 'vue-router'
import type { ConvexCallError } from '${resolver.resolve('./runtime/utils/call-result')}'

type AuthClient = ReturnType<typeof createAuthClient>

declare module '#app' {
  interface NuxtApp {
    $convex?: ConvexClient
    $auth?: AuthClient
  }

  interface RuntimeNuxtHooks {
    'better-convex:auth:refresh': () => void | Promise<void>
    /** Fired when a Convex call returns a 401/403. Handle sign-out + redirect here. */
    'convex:unauthorized': (payload: { error: unknown; source: string; functionName?: string; redirectTo: string }) => void | Promise<void>
    /** Fired after every successful mutation. */
    'convex:mutation:success': (payload: { functionPath: string; operation: 'mutation'; args: Record<string, unknown>; result: unknown; duration: number }) => void | Promise<void>
    /** Fired after every failed mutation. */
    'convex:mutation:error': (payload: { functionPath: string; operation: 'mutation'; args: Record<string, unknown>; error: ConvexCallError; duration: number }) => void | Promise<void>
    /** Fired after every successful action. */
    'convex:action:success': (payload: { functionPath: string; operation: 'action'; args: Record<string, unknown>; result: unknown; duration: number }) => void | Promise<void>
    /** Fired after every failed action. */
    'convex:action:error': (payload: { functionPath: string; operation: 'action'; args: Record<string, unknown>; error: ConvexCallError; duration: number }) => void | Promise<void>
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
    $convex?: ConvexClient
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
      {
        name: 'useConvexPaginatedQuery',
        from: resolver.resolve('./runtime/composables/useConvexPaginatedQuery'),
      },
      {
        name: 'useConvexConnectionState',
        from: resolver.resolve('./runtime/composables/useConvexConnectionState'),
      },
      {
        name: 'useConvexUpload',
        from: resolver.resolve('./runtime/composables/useConvexUpload'),
      },
      {
        name: 'useConvexStorageUrl',
        from: resolver.resolve('./runtime/composables/useConvexStorageUrl'),
      },
      // Optimistic update standalone helpers
      { name: 'prependTo', from: resolver.resolve('./runtime/composables/optimistic-updates') },
      { name: 'appendTo', from: resolver.resolve('./runtime/composables/optimistic-updates') },
      { name: 'removeFrom', from: resolver.resolve('./runtime/composables/optimistic-updates') },
      { name: 'updateIn', from: resolver.resolve('./runtime/composables/optimistic-updates') },
    ])

    // 6b. Auth composables and components (only when auth enabled)
    if (isAuthEnabled) {
      addImports([
        { name: 'useConvexAuth', from: resolver.resolve('./runtime/composables/useConvexAuth') },
        {
          name: 'useConvexAuthInternal',
          from: resolver.resolve('./runtime/composables/useConvexAuthInternal'),
        },
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
      { name: 'serverConvexQuery', from: resolver.resolve('./runtime/server/utils/convex') },
      { name: 'serverConvexMutation', from: resolver.resolve('./runtime/server/utils/convex') },
      { name: 'serverConvexAction', from: resolver.resolve('./runtime/server/utils/convex') },
      {
        name: 'serverConvexClearAuthCache',
        from: resolver.resolve('./runtime/server/utils/auth-cache'),
      },
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
