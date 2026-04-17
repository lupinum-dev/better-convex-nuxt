import { defineNuxtModule, createResolver, useLogger } from '@nuxt/kit'

import { setupConvexDevtools } from './devtools.js'
import { installAdvancedTrellis } from './installers/advanced.js'
import { installAuthTrellis } from './installers/auth.js'
import { installCoreTrellis } from './installers/core.js'
import { installPermissionTrellis } from './installers/permissions.js'
import type { ModuleOptions } from './module-internals/options.js'
import {
  buildPublicConvexRuntimeConfig,
  collectModuleStartupWarnings,
  collectValidationMessages,
  deriveModuleSetupState,
  resolvePermissionQuerySetup,
} from './module-internals/setup.js'
import { DEFAULT_UPLOAD_MAX_CONCURRENT } from './runtime/utils/constants.js'
import { asRecord } from './runtime/utils/value-helpers.js'

// Re-export LogLevel from logger for external use
export type { LogLevel } from './runtime/utils/logger.js'
export type {
  TrellisObservationAdapter,
  TrellisObservabilityOptions,
} from './runtime/utils/observability.js'
export type { ConvexAuthPageMeta } from './runtime/utils/auth-route-protection.js'
export type {
  AuthCacheOptions,
  AuthOptions,
  AuthProxyOptions,
  McpOptions,
  ModuleOptions,
  PermissionsOptions,
  QueryDefaults,
  UploadDefaults,
} from './module-internals/options.js'

const logger = useLogger('trellis')

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
    observability: {
      adapter: 'console',
    },
    validation: {
      strict: false,
    },
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const setup = deriveModuleSetupState(options)

    for (const warning of collectModuleStartupWarnings(options, setup)) {
      logger.warn(warning)
    }

    nuxt.options.runtimeConfig.public.convex = buildPublicConvexRuntimeConfig(
      options,
      asRecord(nuxt.options.runtimeConfig.public.convex) ?? undefined,
      setup,
    ) as typeof nuxt.options.runtimeConfig.public.convex

    const { permissionQueryPath } = resolvePermissionQuerySetup(
      nuxt.options.rootDir,
      setup.permissionQueryPath,
    )

    const validationMessages = collectValidationMessages({
      rootDir: nuxt.options.rootDir,
      authEnabled: setup.isAuthEnabled,
      validationStrict: setup.validationStrict,
    })
    if (validationMessages.errors.length > 0) {
      throw new Error(validationMessages.errors[0])
    }
    for (const warning of validationMessages.warnings) {
      logger.warn(warning)
    }

    installCoreTrellis({ nuxt, resolver })

    if (setup.isAuthEnabled) {
      installAuthTrellis({
        resolver,
        authRoute: setup.authRoute,
      })
    }

    installAdvancedTrellis({ nuxt, resolver })

    if (permissionQueryPath) {
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
