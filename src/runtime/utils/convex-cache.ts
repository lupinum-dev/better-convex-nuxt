import { useState, type useNuxtApp } from '#app'

// Re-export shared utilities
export {
  type QueryStatus,
  parseConvexResponse,
  computeQueryStatus,
  getFunctionName,
  hashArgs,
  getQueryKey,
} from './convex-shared'

// Get the NuxtApp type from useNuxtApp return type
type NuxtApp = ReturnType<typeof useNuxtApp>

// Module-level WeakMap for automatic GC when NuxtApp is destroyed
// This replaces the previous pattern of patching nuxtApp._convexSubscriptions
const subscriptionRegistry = new WeakMap<object, SubscriptionCache>()

// ============================================================================
// Types
// ============================================================================

/**
 * Subscription cache stored on NuxtApp
 */
export type SubscriptionCache = Record<string, (() => void) | undefined>

// ============================================================================
// Auth Token Fetching
// ============================================================================

export interface FetchAuthTokenOptions {
  /** Whether this is a public query (skip auth) */
  isPublic: boolean
  /** Cookie header from the request */
  cookieHeader: string
  /** Site URL for auth endpoint */
  siteUrl: string | undefined
}

/**
 * Fetch auth token for SSR queries.
 * Uses caching via useState to avoid redundant fetches.
 *
 * @param options - Auth token fetch options
 * @returns The auth token if available, undefined otherwise
 *
 * @example
 * ```ts
 * const authToken = await fetchAuthToken({
 *   isPublic: false,
 *   cookieHeader: event?.headers.get('cookie') || '',
 *   siteUrl: config.public.convex?.siteUrl,
 * })
 * ```
 */
export async function fetchAuthToken(options: FetchAuthTokenOptions): Promise<string | undefined> {
  const { isPublic, cookieHeader, siteUrl } = options

  // Skip for public queries
  if (isPublic) {
    return undefined
  }

  // Check if we have session cookie
  if (!cookieHeader.includes('better-auth.session_token')) {
    return undefined
  }

  // Try cached token first
  const cachedToken = useState<string | null>('convex:token')
  if (cachedToken.value) {
    return cachedToken.value
  }

  // Fetch token if we have a site URL
  if (!siteUrl) {
    return undefined
  }

  try {
    const response = await $fetch(`${siteUrl}/api/auth/convex/token`, {
      headers: { Cookie: cookieHeader },
    }) as { token?: string }
    if (response?.token) {
      cachedToken.value = response.token
      return response.token
    }
  } catch {
    // Auth token fetch failed - continue without auth
  }

  return undefined
}

/**
 * Get cached auth token for client-side refresh operations.
 * Only returns the cached token, does not fetch.
 *
 * @returns The cached auth token if available, undefined otherwise
 */
export function getCachedAuthToken(): string | undefined {
  const cachedToken = useState<string | null>('convex:token')
  return cachedToken.value ?? undefined
}

// ============================================================================
// Subscription Cache Management
// ============================================================================

/**
 * Get or create the subscription cache for a NuxtApp instance.
 * The cache is used to deduplicate subscriptions across components.
 *
 * Uses a WeakMap keyed by NuxtApp instance for automatic garbage collection
 * when the NuxtApp is destroyed (e.g., during HMR or testing).
 *
 * @param nuxtApp - The NuxtApp instance
 * @returns The subscription cache object
 *
 * @example
 * ```ts
 * const cache = getSubscriptionCache(nuxtApp)
 * if (cache[cacheKey]) {
 *   // Already subscribed
 *   return
 * }
 * ```
 */
export function getSubscriptionCache(nuxtApp: NuxtApp): SubscriptionCache {
  if (!subscriptionRegistry.has(nuxtApp)) {
    subscriptionRegistry.set(nuxtApp, {})
  }
  return subscriptionRegistry.get(nuxtApp)!
}

/**
 * Register a subscription in the cache.
 *
 * @param nuxtApp - The NuxtApp instance
 * @param cacheKey - Unique key for this subscription
 * @param unsubscribe - The unsubscribe function
 */
export function registerSubscription(
  nuxtApp: NuxtApp,
  cacheKey: string,
  unsubscribe: () => void,
): void {
  const cache = getSubscriptionCache(nuxtApp)
  console.log(`[DEBUG:convex-cache] registerSubscription: cacheKey=${cacheKey}, existingKeys=${Object.keys(cache).filter(k => cache[k]).join(', ')}`)
  cache[cacheKey] = unsubscribe
}

/**
 * Check if a subscription already exists in the cache.
 *
 * @param nuxtApp - The NuxtApp instance
 * @param cacheKey - Unique key for this subscription
 * @returns True if subscription exists
 */
export function hasSubscription(nuxtApp: NuxtApp, cacheKey: string): boolean {
  const cache = getSubscriptionCache(nuxtApp)
  const exists = !!cache[cacheKey]
  console.log(`[DEBUG:convex-cache] hasSubscription: cacheKey=${cacheKey}, exists=${exists}, allKeys=${Object.keys(cache).filter(k => cache[k]).join(', ')}`)
  return exists
}

/**
 * Get the current subscription from the cache.
 * Used to check if we should cleanup (only if our subscription is still the active one).
 *
 * @param nuxtApp - The NuxtApp instance
 * @param cacheKey - Unique key for this subscription
 * @returns The unsubscribe function if it exists, undefined otherwise
 */
export function getSubscription(nuxtApp: NuxtApp, cacheKey: string): (() => void) | undefined {
  const cache = getSubscriptionCache(nuxtApp)
  return cache[cacheKey]
}

/**
 * Clean up a subscription from the cache.
 * Calls the unsubscribe function and removes from cache.
 *
 * @param nuxtApp - The NuxtApp instance
 * @param cacheKey - Unique key for this subscription
 *
 * @example
 * ```ts
 * // In cleanup/unmount
 * cleanupSubscription(nuxtApp, cacheKey)
 * ```
 */
export function cleanupSubscription(nuxtApp: NuxtApp, cacheKey: string): void {
  const cache = getSubscriptionCache(nuxtApp)
  const unsubscribe = cache[cacheKey]
  if (unsubscribe) {
    unsubscribe()
    cache[cacheKey] = undefined
  }
}

/**
 * Remove a subscription from the cache without calling unsubscribe.
 * Use this when you've already called unsubscribe manually.
 *
 * @param nuxtApp - The NuxtApp instance
 * @param cacheKey - Unique key for this subscription
 */
export function removeFromSubscriptionCache(nuxtApp: NuxtApp, cacheKey: string): void {
  const cache = getSubscriptionCache(nuxtApp)
  console.log(`[DEBUG:convex-cache] removeFromSubscriptionCache: cacheKey=${cacheKey}, before=${Object.keys(cache).filter(k => cache[k]).join(', ')}`)
  cache[cacheKey] = undefined
  console.log(`[DEBUG:convex-cache] removeFromSubscriptionCache: after=${Object.keys(cache).filter(k => cache[k]).join(', ')}`)
}
