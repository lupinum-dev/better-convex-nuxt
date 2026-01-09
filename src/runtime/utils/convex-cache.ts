import { useState, type useNuxtApp } from '#app'

import type { QueryLogger } from './convex-shared'

// Re-export shared utilities for backwards compatibility
export {
  type QueryStatus,
  type QueryLogger,
  parseConvexResponse,
  computeQueryStatus,
  getFunctionName,
  stableStringify,
  getQueryKey,
  createQueryLogger,
} from './convex-shared'

// Get the NuxtApp type from useNuxtApp return type
type NuxtApp = ReturnType<typeof useNuxtApp>

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
  /** Logger for debug output */
  log: QueryLogger
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
 *   log,
 * })
 * ```
 */
export async function fetchAuthToken(options: FetchAuthTokenOptions): Promise<string | undefined> {
  const { isPublic, cookieHeader, siteUrl, log } = options

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
    log('Using cached auth token')
    return cachedToken.value
  }

  // Fetch token if we have a site URL
  if (!siteUrl) {
    return undefined
  }

  try {
    log('Fetching auth token')
    const response = await $fetch<{ token?: string }>(`${siteUrl}/api/auth/convex/token`, {
      headers: { Cookie: cookieHeader },
    })
    if (response?.token) {
      cachedToken.value = response.token
      log('Auth token fetched and cached')
      return response.token
    }
  } catch {
    log('Auth token fetch failed')
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
 * Get or create the subscription cache on the NuxtApp instance.
 * The cache is used to deduplicate subscriptions across components.
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
  nuxtApp._convexSubscriptions = nuxtApp._convexSubscriptions || {}
  return nuxtApp._convexSubscriptions as SubscriptionCache
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
  return !!cache[cacheKey]
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
  cache[cacheKey] = undefined
}
