import {
  defineNuxtModule,
  addPlugin,
  createResolver,
  addTemplate,
  addImports,
  addServerHandler,
  addServerImports,
  addComponentsDir,
} from '@nuxt/kit'
import { defu } from 'defu'

export interface LoggingOptions {
  /**
   * Enable module logging.
   * - false: No logs (production default)
   * - true: Info-level logs (canonical events only)
   * - 'debug': Include debug-level details
   * @default false
   */
  enabled?: boolean | 'debug'
  /**
   * Output format for logs.
   * - 'pretty': Human-readable with icons (default)
   * - 'json': Structured JSON for log aggregation
   * @default 'pretty'
   */
  format?: 'pretty' | 'json'
}

export interface ModuleOptions {
  /** Convex deployment URL (WebSocket) - e.g., https://your-app.convex.cloud */
  url?: string
  /** Convex site URL (HTTP/Auth) - e.g., https://your-app.convex.site. Auto-derived from url if not set. */
  siteUrl?: string
  /**
   * Enable permission composables (createPermissions factory).
   * When true, auto-imports createPermissions for building usePermissions.
   * @default false
   */
  permissions?: boolean
  /**
   * Configure module logging behavior.
   * Emits canonical log events for debugging SSR, auth, queries, and mutations.
   */
  logging?: LoggingOptions
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
    permissions: false,
    logging: {
      enabled: false,
      format: 'pretty',
    },
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    // Derive siteUrl from url if not explicitly set (cloud -> site)
    const derivedSiteUrl =
      options.siteUrl || (options.url?.replace('.convex.cloud', '.convex.site') ?? '')

    // 1. Safe Configuration Merging (preserves user-defined runtimeConfig)
    const convexConfig = defu(
      nuxt.options.runtimeConfig.public.convex as Record<string, unknown> | undefined,
      {
        url: options.url || '',
        siteUrl: derivedSiteUrl,
        logging: {
          enabled: options.logging?.enabled ?? false,
          format: options.logging?.format ?? 'pretty',
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

    // 4. Register Auth Proxy Route (proxies /api/auth/* to Convex site)
    addServerHandler({
      route: '/api/auth/**',
      handler: resolver.resolve('./runtime/server/api/auth/[...]'),
    })

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

    // 6. Auto-import composables
    addImports([
      { name: 'useConvexAuth', from: resolver.resolve('./runtime/composables/useConvexAuth') },
      { name: 'useConvex', from: resolver.resolve('./runtime/composables/useConvex') },
      {
        name: 'useConvexMutation',
        from: resolver.resolve('./runtime/composables/useConvexMutation'),
      },
      { name: 'useConvexAction', from: resolver.resolve('./runtime/composables/useConvexAction') },
      { name: 'useAuthClient', from: resolver.resolve('./runtime/composables/useAuthClient') },
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
      // Optimistic update helpers for paginated queries (already available from useConvexPaginatedQuery)
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
    ])

    // 6b. Conditionally add permission composables
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
    ])

    // 8. Register auth components
    addComponentsDir({
      path: resolver.resolve('./runtime/components'),
      global: true,
    })

    // 9. Add types to tsconfig references
    nuxt.hook('prepare:types', (opts) => {
      opts.references.push({
        path: resolver.resolve(nuxt.options.buildDir, 'types/better-convex-nuxt.d.ts'),
      })
    })
  },
})
