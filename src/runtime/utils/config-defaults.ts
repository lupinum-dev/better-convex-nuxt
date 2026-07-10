import type { LogLevel } from './logger'

/**
 * Single source of truth for every better-convex-nuxt config default literal and
 * the shared config normalizers.
 *
 * `module.ts` (build-time `defaults:` block + the defu merge into runtimeConfig)
 * and `runtime-config.ts` (runtime normalization) both consume these. No default
 * literal for a config value may appear anywhere else in `src/` — grep the file
 * name if you need to change a default.
 *
 * Internal only: not part of the public auto-import surface, not exported from
 * the module entrypoint.
 */

// --- Named literals (each config default appears exactly once) ---------------

const DEFAULT_AUTH_ROUTE = '/api/auth'
const DEFAULT_AUTH_CACHE_TTL = 60
const AUTH_CACHE_TTL_MIN = 1
// The clamp ceiling equals the default TTL by design.
const AUTH_CACHE_TTL_MAX = DEFAULT_AUTH_CACHE_TTL
const DEFAULT_MAX_CONCURRENT_UPLOADS = 3
const DEFAULT_AUTH_PROXY_BODY_LIMIT_BYTES = 1_048_576
// How long an awaited subscribe-mode query waits for its first WS result before
// rejecting. 0 disables the timeout; invalid values fall back to this default.
const DEFAULT_WAIT_TIMEOUT_MS = 10_000

// --- Frozen defaults object --------------------------------------------------

export const CONVEX_MODULE_DEFAULTS = Object.freeze({
  authRoute: DEFAULT_AUTH_ROUTE,
  logging: false as LogLevel | false,
  debug: Object.freeze({
    authFlow: false,
    clientAuthFlow: false,
    serverAuthFlow: false,
  }),
  authCache: Object.freeze({
    ttl: DEFAULT_AUTH_CACHE_TTL,
  }),
  defaults: Object.freeze({
    server: true,
    subscribe: true,
    waitTimeoutMs: DEFAULT_WAIT_TIMEOUT_MS,
  }),
  upload: Object.freeze({
    maxConcurrent: DEFAULT_MAX_CONCURRENT_UPLOADS,
  }),
  authProxy: Object.freeze({
    maxRequestBodyBytes: DEFAULT_AUTH_PROXY_BODY_LIMIT_BYTES,
    maxResponseBodyBytes: DEFAULT_AUTH_PROXY_BODY_LIMIT_BYTES,
  }),
})

// --- Shared normalizers ------------------------------------------------------

/** Clamp the SSR auth-cache TTL (seconds) into the allowed [1, 60] range. */
export function normalizeAuthCacheTtl(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return DEFAULT_AUTH_CACHE_TTL
  const normalized = Math.trunc(input)
  if (normalized < AUTH_CACHE_TTL_MIN) return AUTH_CACHE_TTL_MIN
  if (normalized > AUTH_CACHE_TTL_MAX) return AUTH_CACHE_TTL_MAX
  return normalized
}

/** Clamp the upload-queue concurrency to a positive integer (default 3, min 1). */
export function normalizeMaxConcurrent(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return DEFAULT_MAX_CONCURRENT_UPLOADS
  const normalized = Math.trunc(input)
  return normalized > 0 ? normalized : 1
}

/** Normalize the awaited-query WS wait timeout (ms). 0 disables; default 10s. */
export function normalizeWaitTimeoutMs(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input < 0) {
    return DEFAULT_WAIT_TIMEOUT_MS
  }
  return Math.trunc(input)
}

/** Clamp an auth-proxy body limit to a positive integer (default 1 MiB). */
export function normalizeAuthProxyBodyLimit(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    return DEFAULT_AUTH_PROXY_BODY_LIMIT_BYTES
  }
  const normalized = Math.trunc(input)
  return normalized > 0 ? normalized : DEFAULT_AUTH_PROXY_BODY_LIMIT_BYTES
}
