import { useStorage } from '#imports'
import { hash } from 'ohash'

/**
 * Storage namespace for auth token cache.
 * Can be configured in nuxt.config.ts nitro.storage['cache:convex:auth']
 * to use different drivers (memory, redis, etc.)
 */
const AUTH_CACHE_NAMESPACE = 'cache:convex:auth'

/**
 * Clear cached auth token for a session.
 * Call this on logout to immediately invalidate the cached token.
 *
 * @param sessionToken - The session token (from better-auth.session_token cookie)
 *
 * @example
 * ```ts
 * // In your logout API route or server middleware
 * import { clearAuthCache } from '#imports'
 *
 * export default defineEventHandler(async (event) => {
 *   const sessionToken = getCookie(event, 'better-auth.session_token')
 *   if (sessionToken) {
 *     await clearAuthCache(sessionToken)
 *   }
 *   // ... rest of logout logic
 * })
 * ```
 */
export async function clearAuthCache(sessionToken: string): Promise<void> {
  const storage = useStorage(AUTH_CACHE_NAMESPACE)
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
  const storage = useStorage(AUTH_CACHE_NAMESPACE)
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
  const storage = useStorage(AUTH_CACHE_NAMESPACE)
  const cacheKey = `jwt:${hash(sessionToken)}`
  await storage.setItem(cacheKey, jwtToken, { ttl })
}
