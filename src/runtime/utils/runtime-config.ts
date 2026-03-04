import { useRuntimeConfig } from '#imports'
import { normalizeConvexAuthConfig, type ConvexAuthConfig } from './auth-config'
import { normalizeAuthRoute, resolveConvexSiteUrl } from './convex-config'
import type { LogLevel } from './logger'

export interface ConvexRuntimeDefaults {
  server: boolean
  subscribe: boolean
  auth: 'auto' | 'none'
}

export interface NormalizedConvexRuntimeConfig {
  url?: string
  siteUrl?: string
  auth: ConvexAuthConfig
  authRoute: string
  trustedOrigins: string[]
  skipAuthRoutes: string[]
  permissions: boolean
  logging: LogLevel | false
  authCache: {
    enabled: boolean
    ttl: number
  }
  upload: {
    maxConcurrent: number
  }
  authProxy: {
    maxRequestBodyBytes: number
    maxResponseBodyBytes: number
  }
  defaults: ConvexRuntimeDefaults
  debug: {
    authFlow: boolean
    clientAuthFlow: boolean
    serverAuthFlow: boolean
  }
}

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : null
}

function normalizeAuthCacheTtl(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return 60
  const normalized = Math.trunc(input)
  if (normalized < 1) return 1
  if (normalized > 60) return 60
  return normalized
}

export function normalizeConvexRuntimeConfig(input: unknown): NormalizedConvexRuntimeConfig {
  const raw = asRecord(input)
  const defaults = asRecord(raw?.defaults)
  const debug = asRecord(raw?.debug)
  const authCache = asRecord(raw?.authCache)
  const upload = asRecord(raw?.upload)
  const authProxy = asRecord(raw?.authProxy)
  const envUrl = process.env.NUXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL
  const envSiteUrl = process.env.NUXT_PUBLIC_CONVEX_SITE_URL || process.env.CONVEX_SITE_URL

  const runtimeUrl = typeof raw?.url === 'string' && raw.url.length > 0 ? raw.url : undefined
  const runtimeSiteUrl = typeof raw?.siteUrl === 'string' && raw.siteUrl.length > 0 ? raw.siteUrl : undefined
  const url = runtimeUrl ?? envUrl
  const explicitSiteUrl = runtimeSiteUrl ?? envSiteUrl
  const resolvedSiteUrl = resolveConvexSiteUrl({
    url,
    siteUrl: explicitSiteUrl,
  }).siteUrl

  return {
    url,
    siteUrl: resolvedSiteUrl || undefined,
    auth: normalizeConvexAuthConfig(raw?.auth),
    authRoute: normalizeAuthRoute(typeof raw?.authRoute === 'string' ? raw.authRoute : undefined),
    trustedOrigins: Array.isArray(raw?.trustedOrigins) ? raw.trustedOrigins.filter((v): v is string => typeof v === 'string') : [],
    skipAuthRoutes: Array.isArray(raw?.skipAuthRoutes) ? raw.skipAuthRoutes.filter((v): v is string => typeof v === 'string') : [],
    permissions: raw?.permissions === true,
    logging: raw?.logging === false || typeof raw?.logging === 'string' ? (raw.logging as LogLevel | false) : false,
    authCache: {
      enabled: authCache?.enabled === true,
      ttl: normalizeAuthCacheTtl(authCache?.ttl),
    },
    upload: {
      maxConcurrent: (() => {
        const candidate = upload?.maxConcurrent
        if (typeof candidate !== 'number' || !Number.isFinite(candidate)) return 3
        const normalized = Math.trunc(candidate)
        return normalized > 0 ? normalized : 1
      })(),
    },
    authProxy: {
      maxRequestBodyBytes: (() => {
        const candidate = authProxy?.maxRequestBodyBytes
        if (typeof candidate !== 'number' || !Number.isFinite(candidate)) return 1_048_576
        const normalized = Math.trunc(candidate)
        return normalized > 0 ? normalized : 1_048_576
      })(),
      maxResponseBodyBytes: (() => {
        const candidate = authProxy?.maxResponseBodyBytes
        if (typeof candidate !== 'number' || !Number.isFinite(candidate)) return 1_048_576
        const normalized = Math.trunc(candidate)
        return normalized > 0 ? normalized : 1_048_576
      })(),
    },
    defaults: {
      server: defaults?.server !== false,
      subscribe: defaults?.subscribe !== false,
      auth: defaults?.auth === 'none' ? 'none' : 'auto',
    },
    debug: {
      authFlow: debug?.authFlow === true,
      clientAuthFlow: debug?.clientAuthFlow === true,
      serverAuthFlow: debug?.serverAuthFlow === true,
    },
  }
}

export function getConvexRuntimeConfig(): NormalizedConvexRuntimeConfig {
  return normalizeConvexRuntimeConfig(useRuntimeConfig().public.convex)
}
