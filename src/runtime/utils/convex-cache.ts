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
 * Subscription entry with reference counting.
 * Multiple components can share the same subscription.
 */
export interface SubscriptionEntry {
  unsubscribe: () => void
  refCount: number
}

/**
 * Subscription cache stored on NuxtApp
 */
export type SubscriptionCache = Record<string, SubscriptionEntry | undefined>

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
  const existing = subscriptionRegistry.get(nuxtApp)
  if (existing) {
    return existing
  }

  const cache: SubscriptionCache = {}
  subscriptionRegistry.set(nuxtApp, cache)
  return cache
}

/**
 * Register a subscription in the cache with reference counting.
 * If a subscription already exists, increments the ref count instead of replacing.
 *
 * @param nuxtApp - The NuxtApp instance
 * @param cacheKey - Unique key for this subscription
 * @param unsubscribe - The unsubscribe function
 * @returns true if this component should manage the subscription (first registrant), false if joining existing
 */
export function registerSubscription(
  nuxtApp: NuxtApp,
  cacheKey: string,
  unsubscribe: () => void,
): boolean {
  const cache = getSubscriptionCache(nuxtApp)
  const existing = cache[cacheKey]

  if (existing) {
    // Subscription exists - increment ref count, don't replace
    existing.refCount++
    return false // This component is joining an existing subscription
  }

  // New subscription
  cache[cacheKey] = { unsubscribe, refCount: 1 }
  return true // This component owns the subscription
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
 * Get the current subscription entry from the cache.
 *
 * @param nuxtApp - The NuxtApp instance
 * @param cacheKey - Unique key for this subscription
 * @returns The subscription entry if it exists, undefined otherwise
 */
export function getSubscription(nuxtApp: NuxtApp, cacheKey: string): SubscriptionEntry | undefined {
  const cache = getSubscriptionCache(nuxtApp)
  return cache[cacheKey]
}

/**
 * Decrement reference count and cleanup subscription if no more references.
 * Returns true if the subscription was actually unsubscribed.
 *
 * @param nuxtApp - The NuxtApp instance
 * @param cacheKey - Unique key for this subscription
 * @returns true if subscription was unsubscribed, false if still has references
 */
export function releaseSubscription(nuxtApp: NuxtApp, cacheKey: string): boolean {
  const cache = getSubscriptionCache(nuxtApp)
  const entry = cache[cacheKey]

  if (!entry) {
    return false
  }

  entry.refCount--

  if (entry.refCount <= 0) {
    // Last reference - actually unsubscribe
    entry.unsubscribe()
    cache[cacheKey] = undefined
    return true
  }

  return false
}
