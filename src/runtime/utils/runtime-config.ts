import { useRuntimeConfig } from '#imports'

import { normalizeConvexAuthConfig, type ConvexAuthConfig } from './auth-config'
import { normalizeAuthRoute, resolveConvexSiteUrl } from './convex-config'
import type { LogLevel } from './logger'

export interface ConvexRuntimeQueryDefaults {
  server: boolean
  subscribe: boolean
}

export interface NormalizedConvexAuthConfig extends ConvexAuthConfig {
  route: string
  trustedOrigins: string[]
  skipAuthRoutes: string[]
  cache: { enabled: boolean; ttl: number }
  proxy: { maxRequestBodyBytes: number; maxResponseBodyBytes: number }
}

export interface NormalizedConvexRuntimeConfig {
  url?: string
  siteUrl?: string
  auth: NormalizedConvexAuthConfig
  query: ConvexRuntimeQueryDefaults
  upload: { maxConcurrent: number }
  permissions: boolean
  logging: LogLevel | false
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
  const authRaw = asRecord(raw?.auth)
  const queryRaw = asRecord(raw?.query)
  const cacheRaw = asRecord(authRaw?.cache)
  const proxyRaw = asRecord(authRaw?.proxy)
  const debugRaw = asRecord(raw?.debug)
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
      trustedOrigins: Array.isArray(authRaw?.trustedOrigins)
        ? authRaw.trustedOrigins.filter((v): v is string => typeof v === 'string')
        : [],
      skipAuthRoutes: Array.isArray(authRaw?.skipAuthRoutes)
        ? authRaw.skipAuthRoutes.filter((v): v is string => typeof v === 'string')
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
    permissions: raw?.permissions === true,
    logging:
      raw?.logging === false || typeof raw?.logging === 'string'
        ? (raw.logging as LogLevel | false)
        : false,
    debug: {
      authFlow: debugRaw?.authFlow === true,
      clientAuthFlow: debugRaw?.clientAuthFlow === true,
      serverAuthFlow: debugRaw?.serverAuthFlow === true,
    },
  }
}

export function getConvexRuntimeConfig(): NormalizedConvexRuntimeConfig {
  return normalizeConvexRuntimeConfig(useRuntimeConfig().public.convex)
}
