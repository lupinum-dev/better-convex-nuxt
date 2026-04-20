import { useRuntimeConfig } from '#imports'

import { normalizeConvexAuthConfig, type ConvexAuthConfig } from '../../auth/shared/auth-config.js'
import {
  normalizeObservabilityConfig,
  type NormalizedTrellisObservabilityConfig,
} from '../../observability/index.js'
import {
  normalizeAuthCacheTtl,
  normalizePermissionQueryPath,
  normalizeTrustedOrigins,
} from '../../utils/config-normalization.js'
import { asRecord } from '../../utils/value-helpers.js'
import { normalizeAuthRoute, resolveConvexSiteUrl } from './convex-config.js'

export interface ConvexRuntimeQueryDefaults {
  server: boolean
  subscribe: boolean
}

export interface NormalizedConvexAuthConfig extends ConvexAuthConfig {
  route: string
  trustedOrigins: string[]
  skipAuthTokenFetchRoutes: string[]
  cache: { enabled: boolean; ttl: number }
  proxy: { maxRequestBodyBytes: number; maxResponseBodyBytes: number }
}

export interface NormalizedConvexPermissionsConfig {
  query: string | null
}

export type NormalizedConvexMcpConfig = Record<string, never>

export interface NormalizedConvexRuntimeConfig {
  url?: string
  siteUrl?: string
  auth: NormalizedConvexAuthConfig
  permissions: NormalizedConvexPermissionsConfig
  mcp: NormalizedConvexMcpConfig
  query: ConvexRuntimeQueryDefaults
  upload: { maxConcurrent: number }
  observability: NormalizedTrellisObservabilityConfig
}

function isNormalizedObservabilityConfig(
  value: unknown,
): value is NormalizedTrellisObservabilityConfig {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  const capture = candidate.capture as Record<string, unknown> | undefined
  const correlation = candidate.correlation as Record<string, unknown> | undefined
  return (
    typeof candidate.enabled === 'boolean' &&
    typeof capture?.backend === 'boolean' &&
    typeof capture?.mcp === 'boolean' &&
    typeof capture?.browser === 'boolean' &&
    (candidate.level === 'critical' ||
      candidate.level === 'normal' ||
      candidate.level === 'verbose') &&
    typeof candidate.service === 'string' &&
    typeof candidate.redact === 'function' &&
    typeof correlation?.header === 'string' &&
    typeof correlation?.generate === 'function'
  )
}

export function normalizeConvexRuntimeConfig(input: unknown): NormalizedConvexRuntimeConfig {
  const raw = asRecord(input)
  const authRaw = asRecord(raw?.auth)
  const queryRaw = asRecord(raw?.query)
  const cacheRaw = asRecord(authRaw?.cache)
  const proxyRaw = asRecord(authRaw?.proxy)
  const uploadRaw = asRecord(raw?.upload)

  const envUrl = process.env.NUXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL
  const envSiteUrl = process.env.NUXT_PUBLIC_CONVEX_SITE_URL || process.env.CONVEX_SITE_URL

  const runtimeUrl = typeof raw?.url === 'string' && raw.url.length > 0 ? raw.url : undefined
  const runtimeSiteUrl =
    typeof raw?.siteUrl === 'string' && raw.siteUrl.length > 0 ? raw.siteUrl : undefined
  const url = runtimeUrl ?? envUrl
  const resolvedSiteUrl = resolveConvexSiteUrl({
    url,
    siteUrl: runtimeSiteUrl ?? envSiteUrl,
  }).siteUrl

  return {
    url,
    siteUrl: resolvedSiteUrl || undefined,
    auth: {
      ...normalizeConvexAuthConfig(authRaw),
      route: normalizeAuthRoute(typeof authRaw?.route === 'string' ? authRaw.route : undefined),
      trustedOrigins: normalizeTrustedOrigins(authRaw?.trustedOrigins),
      skipAuthTokenFetchRoutes: Array.isArray(authRaw?.skipAuthTokenFetchRoutes)
        ? authRaw.skipAuthTokenFetchRoutes.filter(
            (v: unknown): v is string => typeof v === 'string',
          )
        : [],
      cache: {
        enabled: cacheRaw?.enabled === true,
        ttl: normalizeAuthCacheTtl(cacheRaw?.ttl),
      },
      proxy: {
        maxRequestBodyBytes: (() => {
          const candidate = proxyRaw?.maxRequestBodyBytes
          if (typeof candidate !== 'number' || !Number.isFinite(candidate)) return 1_048_576
          const n = Math.trunc(candidate)
          return n > 0 ? n : 1_048_576
        })(),
        maxResponseBodyBytes: (() => {
          const candidate = proxyRaw?.maxResponseBodyBytes
          if (typeof candidate !== 'number' || !Number.isFinite(candidate)) return 1_048_576
          const n = Math.trunc(candidate)
          return n > 0 ? n : 1_048_576
        })(),
      },
    },
    permissions: {
      query: normalizePermissionQueryPath(raw?.permissions),
    },
    mcp: {},
    query: {
      server: queryRaw?.server !== false,
      subscribe: queryRaw?.subscribe !== false,
    },
    upload: {
      maxConcurrent: (() => {
        const candidate = uploadRaw?.maxConcurrent
        if (typeof candidate !== 'number' || !Number.isFinite(candidate)) return 3
        const n = Math.trunc(candidate)
        return n > 0 ? n : 1
      })(),
    },
    observability: isNormalizedObservabilityConfig(raw?.observability)
      ? raw.observability
      : normalizeObservabilityConfig(raw?.observability),
  }
}

export function getConvexRuntimeConfig(): NormalizedConvexRuntimeConfig {
  return normalizeConvexRuntimeConfig(useRuntimeConfig().public?.convex)
}
