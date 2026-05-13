import { defu } from 'defu'

import { collectConvexFunctionPaths } from '../analysis/project.js'
import { collectModuleValidationFindings } from '../analysis/validation.js'
import { normalizeConvexAuthConfig } from '../runtime/auth/shared/auth-config.js'
import {
  getSiteUrlResolutionHint,
  isValidAbsoluteUrl,
  normalizeAuthRoute,
  resolveConvexSiteUrl,
} from '../runtime/convex/shared/convex-config.js'
import { normalizeObservabilityConfig } from '../runtime/observability/index.js'
import {
  normalizeAuthCacheTtl,
  normalizeConfiguredFunctionPath,
  normalizeTrustedOrigins,
} from '../runtime/utils/config-normalization.js'
import type { AuthOptions, ModuleOptions } from './options.js'
import { createConfiguredFunctionError, normalizeAuthShorthand } from './options.js'

type RuntimePublicConvexConfig = Record<string, unknown>

interface ModuleRuntimeConfig {
  url?: string
  siteUrl?: string
  auth: ReturnType<typeof normalizeConvexAuthConfig> & {
    route: string
    trustedOrigins: string[]
    skipAuthTokenFetchRoutes: string[]
    cache: { enabled: boolean; ttl: number }
    proxy: { maxRequestBodyBytes: number; maxResponseBodyBytes: number }
  }
  permissions: { query: string | null; codegen: boolean }
  query: { server: boolean; subscribe: boolean }
  upload: { maxConcurrent: number }
  observability: ReturnType<typeof normalizeObservabilityConfig>
}

export interface ModuleEnv {
  NUXT_PUBLIC_CONVEX_URL?: string
  CONVEX_URL?: string
  NUXT_PUBLIC_CONVEX_SITE_URL?: string
  CONVEX_SITE_URL?: string
}

export interface ModuleSetupState {
  authOptions: AuthOptions
  normalizedAuthConfig: ReturnType<typeof normalizeConvexAuthConfig>
  isAuthEnabled: boolean
  validationStrict: boolean
  permissionQueryPath?: string
  permissionCodegenEnabled: boolean
  permissionCodegenInclude: string[]
  authRoute: string
  resolvedSiteUrl?: string
  normalizedAuthCacheTtl: number
  hasConfiguredConvexLocation: boolean
}

export function deriveModuleSetupState(
  options: ModuleOptions,
  env: ModuleEnv | NodeJS.ProcessEnv = process.env,
): ModuleSetupState {
  const siteUrlResolution = resolveConvexSiteUrl({
    url: options.url,
    siteUrl: env.NUXT_PUBLIC_CONVEX_SITE_URL || env.CONVEX_SITE_URL,
  })
  const authOptions = normalizeAuthShorthand(options.auth)
  const normalizedAuthConfig = normalizeConvexAuthConfig(authOptions)
  const permissionQueryPath = normalizeConfiguredFunctionPath(
    typeof options.permissions === 'string' ? options.permissions : options.permissions?.query,
  )
  const rawPermissionCodegen =
    typeof options.permissions === 'string' ? false : (options.permissions?.codegen ?? false)
  const normalizedPermissionCodegen =
    rawPermissionCodegen === true
      ? {
          enabled: true,
          include: ['convex/auth/permissions.ts', 'convex/features/**/permissions.ts'],
        }
      : rawPermissionCodegen === false
        ? {
            enabled: false,
            include: ['convex/auth/permissions.ts', 'convex/features/**/permissions.ts'],
          }
        : {
            enabled: true,
            include:
              Array.isArray(rawPermissionCodegen.include) && rawPermissionCodegen.include.length > 0
                ? rawPermissionCodegen.include
                : ['convex/auth/permissions.ts', 'convex/features/**/permissions.ts'],
          }

  return {
    authOptions,
    normalizedAuthConfig,
    isAuthEnabled: normalizedAuthConfig.enabled,
    validationStrict: options.validation?.strict === true,
    permissionQueryPath,
    permissionCodegenEnabled: normalizedPermissionCodegen.enabled,
    permissionCodegenInclude: normalizedPermissionCodegen.include,
    authRoute: normalizeAuthRoute(authOptions.route ?? '/api/auth'),
    resolvedSiteUrl: siteUrlResolution.siteUrl,
    normalizedAuthCacheTtl: normalizeAuthCacheTtl(authOptions.cache?.ttl),
    hasConfiguredConvexLocation:
      Boolean(options.url) ||
      Boolean(
        env.NUXT_PUBLIC_CONVEX_URL ||
        env.CONVEX_URL ||
        env.NUXT_PUBLIC_CONVEX_SITE_URL ||
        env.CONVEX_SITE_URL,
      ),
  }
}

export function collectModuleStartupWarnings(
  options: ModuleOptions,
  setup: ModuleSetupState,
): string[] {
  const warnings: string[] = []

  if (options.url && !isValidAbsoluteUrl(options.url)) {
    warnings.push(
      `Invalid Convex URL format: "${options.url}". Expected a valid URL like "https://your-app.convex.cloud"`,
    )
  }

  if (setup.resolvedSiteUrl && !isValidAbsoluteUrl(setup.resolvedSiteUrl)) {
    warnings.push(
      `Invalid Convex site URL format: "${setup.resolvedSiteUrl}". Expected a valid URL like "https://your-app.convex.site"`,
    )
  }

  if (setup.isAuthEnabled && !setup.resolvedSiteUrl && setup.hasConfiguredConvexLocation) {
    warnings.push(
      `auth.enabled = true but no usable siteUrl was resolved. ${getSiteUrlResolutionHint(options.url)}`,
    )
  }

  const rawAuthCacheTtl = setup.authOptions.cache?.ttl ?? 60
  if (rawAuthCacheTtl !== setup.normalizedAuthCacheTtl) {
    warnings.push(
      `trellis.auth.cache.ttl must be between 1 and 60 seconds. Using ${setup.normalizedAuthCacheTtl}s instead.`,
    )
  }

  return warnings
}

function validateModuleObservabilityConfig(options: ModuleOptions) {
  normalizeObservabilityConfig(options.observability, { source: 'module' })
}

export function buildPublicConvexRuntimeConfig(
  options: ModuleOptions,
  existing: RuntimePublicConvexConfig | undefined,
  setup: ModuleSetupState,
): ModuleRuntimeConfig & RuntimePublicConvexConfig {
  validateModuleObservabilityConfig(options)
  return defu(existing, {
    url: options.url || '',
    siteUrl: setup.resolvedSiteUrl || '',
    auth: {
      ...setup.normalizedAuthConfig,
      route: setup.authRoute,
      trustedOrigins: normalizeTrustedOrigins(setup.authOptions.trustedOrigins),
      skipAuthTokenFetchRoutes: setup.authOptions.skipAuthTokenFetchRoutes ?? [],
      cache: {
        enabled: setup.authOptions.cache?.enabled ?? false,
        ttl: setup.normalizedAuthCacheTtl,
      },
      proxy: {
        maxRequestBodyBytes: setup.authOptions.proxy?.maxRequestBodyBytes ?? 1_048_576,
        maxResponseBodyBytes: setup.authOptions.proxy?.maxResponseBodyBytes ?? 1_048_576,
      },
    },
    permissions: {
      query: setup.permissionQueryPath ?? null,
      codegen: setup.permissionCodegenEnabled,
    },
    query: {
      server: options.query?.server ?? true,
      subscribe: options.query?.subscribe ?? true,
    },
    upload: {
      maxConcurrent: options.upload?.maxConcurrent ?? 3,
    },
    observability: {
      enabled: options.observability?.enabled,
      service: options.observability?.service,
      capture: {
        backend: options.observability?.capture?.backend,
        mcp: options.observability?.capture?.mcp,
        browser: options.observability?.capture?.browser,
      },
      level: options.observability?.level,
      sample: options.observability?.sample,
      ...(typeof options.observability?.correlation?.header === 'string'
        ? {
            correlation: {
              header: options.observability.correlation.header,
            },
          }
        : {}),
      ...(typeof options.observability?.explainability?.agentDenials === 'boolean'
        ? {
            explainability: {
              agentDenials: options.observability.explainability.agentDenials,
            },
          }
        : {}),
    },
  })
}

export function resolvePermissionQuerySetup(
  rootDir: string,
  permissionQueryPath: string | undefined,
): { permissionQueryPath?: string } {
  if (!permissionQueryPath) {
    return {}
  }

  const availableConvexFunctions = collectConvexFunctionPaths(rootDir)
  if (!availableConvexFunctions.includes(permissionQueryPath)) {
    throw createConfiguredFunctionError(
      'permissions.query',
      permissionQueryPath,
      availableConvexFunctions,
    )
  }

  return {
    permissionQueryPath,
  }
}

export function collectValidationMessages(input: {
  rootDir: string
  authEnabled: boolean
  validationStrict: boolean
}): { warnings: string[]; errors: string[] } {
  const warnings: string[] = []
  const errors: string[] = []

  for (const finding of collectModuleValidationFindings({
    rootDir: input.rootDir,
    authEnabled: input.authEnabled,
  })) {
    const message = `[trellis] ${finding.message}`
    if (input.validationStrict) {
      errors.push(message)
      continue
    }
    warnings.push(message)
  }

  return { warnings, errors }
}
