import { useRuntimeConfig } from '#imports'
import { normalizeConvexAuthConfig, type ConvexAuthConfig } from './auth-config'
import { normalizeAuthRoute, resolveConvexSiteUrl } from './convex-config'
import type { LogLevel } from './logger'

export interface ConvexRuntimeDefaults {
  server: boolean
  lazy: boolean
  subscribe: boolean
  public: boolean
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

export function normalizeConvexRuntimeConfig(input: unknown): NormalizedConvexRuntimeConfig {
  const raw = asRecord(input)
  const defaults = asRecord(raw?.defaults)
  const debug = asRecord(raw?.debug)
  const authCache = asRecord(raw?.authCache)

  const url = typeof raw?.url === 'string' && raw.url.length > 0 ? raw.url : undefined
  const explicitSiteUrl = typeof raw?.siteUrl === 'string' && raw.siteUrl.length > 0 ? raw.siteUrl : undefined
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
      ttl: typeof authCache?.ttl === 'number' ? authCache.ttl : 900,
    },
    defaults: {
      server: defaults?.server !== false,
      lazy: defaults?.lazy === true,
      subscribe: defaults?.subscribe !== false,
      public: defaults?.public === true,
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
