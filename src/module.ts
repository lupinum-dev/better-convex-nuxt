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
  serverAutoImports,
  type ModuleImportRegistration,
} from './module-api-surface'
import {
  getMissingConvexApiTemplateContents,
  getTypeAugmentationTemplateContents,
} from './module-templates'
import {
  normalizeConvexAuthConfig,
  isConvexAuthEnabled,
  type ConvexAuthOptions,
} from './runtime/utils/auth-config'
import { CONVEX_MODULE_DEFAULTS } from './runtime/utils/config-defaults'
import {
  getSiteUrlResolutionHint,
  isValidAbsoluteUrl,
  resolveConvexSiteUrl,
} from './runtime/utils/convex-config'
import type { LogLevel } from './runtime/utils/logger'

// Re-exported public types (vNext §4.1). The root default export is the module;
// stable public types are re-exported here. Do not export the raw
// `ConvexPublicRuntimeConfig` — consumers read `useConvexConfig()`.
export type { LogLevel } from './runtime/utils/logger'
export type { ConvexAuthPageMeta } from './runtime/utils/auth-route-protection'
export type { ConvexUser } from './runtime/utils/types'
export type {
  ConvexAuthOptions,
  AuthCacheOptions,
  AuthProxyDefaults,
  ConvexDebugOptions,
  ConvexRouteProtectionConfig,
  NormalizedConvexAuthConfig,
} from './runtime/utils/auth-config'
export type { ConvexAuthMode, ConvexAuthStatus } from './runtime/utils/auth-status'
export type { ConvexIdentityKey } from './runtime/utils/identity-key'
export type { ConvexRuntimeConfig } from './runtime/utils/runtime-config'

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

/**
 * Default options for query composables (useConvexQuery, useConvexPaginatedQuery).
 * These can be overridden per query. There is no `auth` default: query auth
 * policy is `optional` by default and never a per-build knob (vNext §5.2).
 */
export interface QueryDefaults {
  /** Run query on server during SSR. @default true */
  server?: boolean
  /** Subscribe to real-time updates via WebSocket. @default true */
  subscribe?: boolean
  /**
   * How long an awaited subscribe-mode query waits (ms) for its first WebSocket
   * result before resolving. Set 0 to wait indefinitely. @default 10000
   */
  waitTimeoutMs?: number
}

export interface UploadDefaults {
  /** Maximum number of concurrent uploads for useConvexUploadQueue. @default 3 */
  maxConcurrent?: number
}

/**
 * Better Convex Nuxt module options (vNext §5.1).
 *
 * `auth` is a false-or-options value: omit it (or pass an object) to install
 * authentication with defaults, or set `auth: false` for a Convex-only build.
 * Every auth-only build option lives inside `ConvexAuthOptions`.
 */
export interface ModuleOptions {
  /** Convex deployment URL (WebSocket) - e.g., https://your-app.convex.cloud */
  url?: string
  /**
   * Convex site URL (HTTP Actions) - e.g., https://your-app.convex.site.
   * If not provided, automatically derived from `url`.
   */
  siteUrl?: string
  /**
   * Authentication installation. Omitted or object-valued installs auth with
   * defaults; `false` produces a Convex-only build with no Better Auth runtime.
   */
  auth?: false | ConvexAuthOptions
  /**
   * Enable module logging.
   * - false: No logs (production default)
   * - 'info': Simple logs for everyday use
   * - 'debug': Detailed logs with timing for deep debugging
   * @default false
   */
  logging?: LogLevel
  /** Default options for query composables. Per-query options override these. */
  defaults?: QueryDefaults
  /** Default options for upload composables. */
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
    url: process.env.NUXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL,
    siteUrl: process.env.NUXT_PUBLIC_CONVEX_SITE_URL || process.env.CONVEX_SITE_URL,
    // `auth` is intentionally omitted: leaving it undefined installs auth with
    // defaults, while an explicit host `auth: false` is preserved by defu.
    logging: CONVEX_MODULE_DEFAULTS.logging,
    defaults: { ...CONVEX_MODULE_DEFAULTS.defaults },
    upload: { ...CONVEX_MODULE_DEFAULTS.upload },
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

    if (resolvedSiteUrl && !isValidAbsoluteUrl(resolvedSiteUrl)) {
      logger.warn(
        `Invalid Convex site URL format: "${resolvedSiteUrl}". Expected a valid URL like "https://your-app.convex.site"`,
      )
    }

    // Single build-time auth resolution: one discriminated value drives every
    // plugin/handler/middleware registration decision (internal §5.1).
    const normalizedAuthConfig = normalizeConvexAuthConfig(options.auth)
    const isAuthEnabled = isConvexAuthEnabled(normalizedAuthConfig)
    const authRoute = normalizedAuthConfig === false ? undefined : normalizedAuthConfig.route

    if (isAuthEnabled && !resolvedSiteUrl) {
      logger.warn(
        `Authentication is enabled but no usable siteUrl was resolved. ${getSiteUrlResolutionHint(options.url)}`,
      )
    }

    // Public runtime config. Auth-only build options live under `auth`; no
    // top-level authRoute/trustedOrigins/authCache/authProxy/debug remain.
    const convexConfig = defu(
      nuxt.options.runtimeConfig.public.convex as Record<string, unknown> | undefined,
      {
        url: options.url || '',
        siteUrl: resolvedSiteUrl || '',
        auth: normalizedAuthConfig,
        logging: options.logging ?? CONVEX_MODULE_DEFAULTS.logging,
        defaults: {
          server: options.defaults?.server ?? CONVEX_MODULE_DEFAULTS.defaults.server,
          subscribe: options.defaults?.subscribe ?? CONVEX_MODULE_DEFAULTS.defaults.subscribe,
          waitTimeoutMs:
            options.defaults?.waitTimeoutMs ?? CONVEX_MODULE_DEFAULTS.defaults.waitTimeoutMs,
        },
        upload: {
          maxConcurrent:
            options.upload?.maxConcurrent ?? CONVEX_MODULE_DEFAULTS.upload.maxConcurrent,
        },
      },
    )
    nuxt.options.runtimeConfig.public.convex = convexConfig
    registerConvexAliases({ nuxt, resolver, convexApiAlias })

    // 1. Core client plugin — always installed, imports no Better Auth code.
    addPlugin(resolver.resolve('./runtime/plugin.client'))

    // 2. Auth-enabled-only plugins. When auth is disabled the module adds NO
    //    Better Auth client, engine, proxy handler, or middleware to the build
    //    graph (vNext §5.1 / internal §5.3).
    if (isAuthEnabled && authRoute) {
      // Auth-enabled-only server plugin resolves SSR identity.
      addPlugin({
        src: resolver.resolve('./runtime/plugin.server'),
        mode: 'server',
      })

      // Auth-enabled-only client plugin creates the Better Auth client and engine.
      addPlugin({
        src: resolver.resolve('./runtime/plugin.auth.client'),
        mode: 'client',
      })

      addRouteMiddleware({
        name: 'convex-auth',
        path: resolver.resolve('./runtime/middleware/convex-auth.global'),
        global: true,
      })

      // Auth proxy: register both exact and wildcard routes so requests without a
      // trailing slash are not missed by the /** glob in Nitro.
      addServerHandler({
        route: authRoute,
        handler: resolver.resolve('./runtime/server/api/auth/[...]'),
      })
      addServerHandler({
        route: `${authRoute}/**`,
        handler: resolver.resolve('./runtime/server/api/auth/[...]'),
      })
    }

    // 3. Type augmentation for IDE support.
    addTemplate({
      filename: 'types/better-convex-nuxt.d.ts',
      getContents: () =>
        getTypeAugmentationTemplateContents(
          resolver.resolve('./runtime/utils/auth-route-protection'),
        ),
    })

    // 4. Auto-import composables (always available, including useConvexAuth and
    //    the four auth rendering components which render from ConvexAuthStatus).
    addImports(resolveModuleImports(resolver, composableAutoImports))
    addImports(resolveModuleImports(resolver, authAutoImports))
    addComponentsDir({
      path: resolver.resolve('./runtime/components'),
      global: true,
    })

    // 5. Auto-import server utilities.
    addServerImports(resolveModuleImports(resolver, serverAutoImports))

    // 6. Nuxt DevTools integration (dev mode only).
    if (nuxt.options.dev) {
      setupDevTools(nuxt, resolver)
    }
  },
})

/**
 * Setup Nuxt DevTools integration. Only called in dev mode.
 */
function setupDevTools(nuxt: Nuxt, resolver: ReturnType<typeof createResolver>): void {
  const devtoolsOutputPath = resolver.resolve('./runtime/devtools/ui/dist')
  nuxt.options.runtimeConfig.convexDevtoolsPath = devtoolsOutputPath

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

  addServerHandler({
    route: '/__convex_devtools__',
    handler: resolver.resolve('./runtime/devtools/server'),
  })
  addServerHandler({
    route: '/__convex_devtools__/**',
    handler: resolver.resolve('./runtime/devtools/server'),
  })

  logger.info('Nuxt DevTools integration enabled')
}
