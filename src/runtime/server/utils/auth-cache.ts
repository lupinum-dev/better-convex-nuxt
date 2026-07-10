import { hash } from 'ohash'

import { getJwtTimeUntilExpiryMs } from '../../utils/convex-shared'

/**
 * Storage namespace for auth token cache.
 * Can be configured in nuxt.config.ts nitro.storage['cache:convex:auth']
 * to use different drivers (memory, redis, etc.)
 */
const AUTH_CACHE_NAMESPACE = 'cache:convex:auth'

/**
 * Get the storage instance lazily (only at runtime, not at import time)
 */
async function getStorage() {
  // Dynamic import to ensure it's only loaded in Nitro runtime context
  // Use nitropack/runtime which is the public export path (works in tests and runtime)
  const { useStorage } = await import('nitropack/runtime')
  return useStorage(AUTH_CACHE_NAMESPACE)
}

/**
 * Clear cached auth token for a session.
 * Call this on logout to immediately invalidate the cached token.
 *
 * @param sessionToken - The session token (from better-auth.session_token cookie)
 *
 * @example
 * ```ts
 * // In your logout API route or server middleware
 * import { serverConvexClearAuthCache } from '#imports'
 *
 * export default defineEventHandler(async (event) => {
 *   const sessionToken = getCookie(event, 'better-auth.session_token')
 *   if (sessionToken) {
 *     await serverConvexClearAuthCache(sessionToken)
 *   }
 *   // ... rest of logout logic
 * })
 * ```
 */
export async function serverConvexClearAuthCache(sessionToken: string): Promise<void> {
  const storage = await getStorage()
  const cacheKey = `jwt:${hash(sessionToken)}`
  await storage.removeItem(cacheKey)
}

/**
 * Get cached auth token for a session.
 * Internal use - called by plugin.server.ts
 *
 * @param sessionToken - The session token
 * @returns The cached JWT token, or null if not cached
 */
export async function getCachedAuthToken(sessionToken: string): Promise<string | null> {
  const storage = await getStorage()
  const cacheKey = `jwt:${hash(sessionToken)}`
  return await storage.getItem<string>(cacheKey)
}

/**
 * Set auth token in cache.
 * Internal use - called by plugin.server.ts
 *
 * @param sessionToken - The session token
 * @param jwtToken - The JWT token to cache
 * @param ttl - TTL in seconds
 */
export async function setCachedAuthToken(
  sessionToken: string,
  jwtToken: string,
  ttl: number,
): Promise<void> {
  const storage = await getStorage()
  const cacheKey = `jwt:${hash(sessionToken)}`
  await storage.setItem(cacheKey, jwtToken, { ttl })
}

/**
 * Read a session's cached JWT only when its `exp` claim is still usable.
 * Tokens without a readable `exp` remain bounded by the storage driver's TTL.
 */
export async function getUsableCachedAuthToken(sessionToken: string): Promise<string | null> {
  const token = await getCachedAuthToken(sessionToken)
  if (!token) return null
  return isAuthTokenUsable(token) ? token : null
}

export function isAuthTokenUsable(token: string): boolean {
  const untilExpiryMs = getJwtTimeUntilExpiryMs(token)
  return untilExpiryMs === null || untilExpiryMs > 0
}

export function effectiveAuthCacheTtlSeconds(
  jwtToken: string,
  configuredTtlSeconds: number,
): number {
  const untilExpiryMs = getJwtTimeUntilExpiryMs(jwtToken)
  return untilExpiryMs === null
    ? configuredTtlSeconds
    : Math.min(configuredTtlSeconds, Math.floor(untilExpiryMs / 1000))
}

/**
 * Cache a JWT for no longer than either the configured TTL or its remaining
 * lifetime. Already-expired tokens are never written.
 */
export async function cacheUsableAuthToken(
  sessionToken: string,
  jwtToken: string,
  configuredTtlSeconds: number,
): Promise<void> {
  const ttl = effectiveAuthCacheTtlSeconds(jwtToken, configuredTtlSeconds)
  if (ttl > 0) await setCachedAuthToken(sessionToken, jwtToken, ttl)
}
