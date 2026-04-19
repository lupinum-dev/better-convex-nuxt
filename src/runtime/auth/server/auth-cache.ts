import { hash } from 'ohash'

import { getJwtTimeUntilExpiryMs } from '../../convex/shared/convex-shared.js'
import { TOKEN_EXPIRY_SAFETY_BUFFER_MS } from '../../utils/constants.js'

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
  try {
    const storage = await getStorage()
    const cacheKey = `jwt:${hash(sessionToken)}`
    await storage.removeItem(cacheKey)
  } catch (error) {
    console.warn('[auth-cache] Cache eviction failed:', error)
  }
}

/**
 * Get cached auth token for a session.
 * Internal use — called during server-side auth resolution.
 *
 * @param sessionToken - The session token
 * @returns The cached JWT token, or null if not cached or on storage failure
 */
export async function getCachedAuthToken(sessionToken: string): Promise<string | null> {
  try {
    const storage = await getStorage()
    const cacheKey = `jwt:${hash(sessionToken)}`
    const token = await storage.getItem<string>(cacheKey)
    if (token) {
      const remaining = getJwtTimeUntilExpiryMs(token)
      if (remaining !== null && remaining <= TOKEN_EXPIRY_SAFETY_BUFFER_MS) {
        // Token is expired or near-expiry — evict it. Even if removal fails,
        // the correct return is null (don't serve a stale token).
        try {
          await storage.removeItem(cacheKey)
        } catch {
          // Removal failed but token is expired; treat as cache miss
        }
        return null
      }
    }
    return token
  } catch (error) {
    console.warn('[auth-cache] Cache read failed, falling through to token exchange:', error)
    return null
  }
}

/**
 * Set auth token in cache.
 * Internal use — called during server-side auth resolution.
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
  try {
    const storage = await getStorage()
    const cacheKey = `jwt:${hash(sessionToken)}`
    await storage.setItem(cacheKey, jwtToken, { ttl })
  } catch (error) {
    console.warn('[auth-cache] Cache write failed:', error)
  }
}
