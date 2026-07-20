import {
  normalizeConvexAuthConfig,
  type ConvexRouteProtectionConfig,
  type NormalizedConvexAuthConfig,
} from './auth-config'
import { normalizeMaxConcurrent, normalizeWaitTimeoutMs } from './config-defaults'
import { resolveConvexSiteUrl } from './convex-config'
import type { LogLevel } from './logger'
import { normalizeConvexDeploymentUrl, normalizeConvexSiteUrl } from './site-url'

/**
 * Fixed query defaults . There is no `auth` default: query auth
 * policy is `optional` by default and is never a per-build knob.
 */
export interface ConvexRuntimeDefaults {
  server: boolean
  subscribe: boolean
  /** WS first-result wait timeout (ms) for awaited subscribe-mode queries. */
  waitTimeoutMs: number
}

/**
 * The internal, fully materialized per-app runtime config. `auth` is the
 * discriminated {@link NormalizedConvexAuthConfig} (`false` or a complete options
 * object including the internal-only `debug` channels). The public projection is
 * {@link ConvexRuntimeConfig}, returned by `useConvexConfig()`.
 */
export interface NormalizedConvexRuntimeConfig {
  url?: string
  siteUrl?: string
  auth: NormalizedConvexAuthConfig
  logging: LogLevel | false
  upload: {
    maxConcurrent: number
  }
  defaults: ConvexRuntimeDefaults
}

/**
 * The normalized PUBLIC runtime config , returned read-only by
 * `useConvexConfig()`. Its `auth` object omits the internal-only `debug` channels
 * and the build-only `client` path. `auth === false` is the only disabled signal.
 */
export interface ConvexRuntimeConfig {
  readonly url: string | undefined
  readonly siteUrl: string | undefined
  readonly auth:
    | false
    | {
        readonly publicOrigin: string
        readonly mcp: boolean
        readonly proxy: Readonly<{
          maxRequestBodyBytes: number
          maxResponseBodyBytes: number
          trustedClientIpHeader: string
        }>
        readonly routeProtection: Readonly<ConvexRouteProtectionConfig>
      }
  readonly defaults: {
    readonly server: boolean
    readonly subscribe: boolean
    readonly waitTimeoutMs: number
  }
  readonly upload: {
    readonly maxConcurrent: number
  }
  readonly logging: LogLevel | false
}

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : null
}

export function normalizeConvexRuntimeConfig(input: unknown): NormalizedConvexRuntimeConfig {
  const raw = asRecord(input)
  const defaults = asRecord(raw?.defaults)
  const upload = asRecord(raw?.upload)

  // URL/siteUrl are resolved from runtimeConfig only. module.ts reads env at build
  // time; Nuxt's native `NUXT_PUBLIC_*` runtime override supplies deploy-time
  // values. Re-reading process.env here would be server-only and silently diverge.
  const url =
    typeof raw?.url === 'string' && raw.url.length > 0
      ? normalizeConvexDeploymentUrl(raw.url)
      : undefined
  const explicitSiteUrl =
    typeof raw?.siteUrl === 'string' && raw.siteUrl.length > 0 ? raw.siteUrl : undefined
  const candidateSiteUrl = resolveConvexSiteUrl({ url, siteUrl: explicitSiteUrl }).siteUrl
  const resolvedSiteUrl = candidateSiteUrl ? normalizeConvexSiteUrl(candidateSiteUrl) : undefined

  return {
    url,
    siteUrl: resolvedSiteUrl || undefined,
    auth: normalizeConvexAuthConfig(raw?.auth),
    logging:
      raw?.logging === false || typeof raw?.logging === 'string'
        ? (raw.logging as LogLevel | false)
        : false,
    upload: {
      maxConcurrent: normalizeMaxConcurrent(upload?.maxConcurrent),
    },
    defaults: {
      server: defaults?.server !== false,
      subscribe: defaults?.subscribe !== false,
      waitTimeoutMs: normalizeWaitTimeoutMs(defaults?.waitTimeoutMs),
    },
  }
}

/** Project the internal config onto the read-only public {@link ConvexRuntimeConfig}. */
export function toPublicConvexRuntimeConfig(
  internal: NormalizedConvexRuntimeConfig,
): ConvexRuntimeConfig {
  const auth =
    internal.auth === false
      ? (false as const)
      : {
          publicOrigin: internal.auth.publicOrigin,
          mcp: internal.auth.mcp,
          proxy: internal.auth.proxy,
          routeProtection: internal.auth.routeProtection,
        }

  return {
    url: internal.url,
    siteUrl: internal.siteUrl,
    auth,
    defaults: {
      server: internal.defaults.server,
      subscribe: internal.defaults.subscribe,
      waitTimeoutMs: internal.defaults.waitTimeoutMs,
    },
    upload: { maxConcurrent: internal.upload.maxConcurrent },
    logging: internal.logging,
  }
}
