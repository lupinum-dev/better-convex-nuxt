import { shallowRef, type ShallowRef } from 'vue'

import type { useNuxtApp } from '#app'
import { resolveClientAuthToken } from './auth-token'

// Re-export shared utilities
export {
  parseConvexResponse,
  computeQueryStatus,
  getFunctionName,
  hashArgs,
  getQueryKey,
} from './convex-shared'
export type { QueryStatus } from './types'

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
  queryBridge?: QuerySubscriptionBridge
}

/**
 * Shared query state for deduplicated useConvexQuery subscribers.
 * Stores raw subscription data and reactive version counters so each subscriber
 * can sync into its own local asyncData refs with its own transform().
 */
export interface QuerySubscriptionBridge {
  rawData: unknown
  hasRawData: boolean
  dataVersion: ShallowRef<number>
  error: Error | null
  errorVersion: ShallowRef<number>
}

/**
 * Subscription cache stored per NuxtApp instance.
 */
export type SubscriptionCache = Map<string, SubscriptionEntry>

export function createQueryBridge(): QuerySubscriptionBridge {
  return {
    rawData: undefined,
    hasRawData: false,
    dataVersion: shallowRef(0),
    error: null,
    errorVersion: shallowRef(0),
  }
}

/**
 * Ensure a deduplicated query subscription has a shared bridge payload.
 * Used by useConvexQuery to fan out subscription updates to all subscribers.
 */
export function ensureQueryBridge(entry: SubscriptionEntry): QuerySubscriptionBridge {
  if (!entry.queryBridge) {
    entry.queryBridge = createQueryBridge()
  }
  return entry.queryBridge
}

// ============================================================================
// Auth Token Fetching
// ============================================================================

export interface FetchAuthTokenOptions {
  /** Auth token behavior for this query. */
  auth: 'auto' | 'none'
  /** Cookie header from the request */
  cookieHeader: string
  /** Site URL for auth endpoint */
  siteUrl: string | undefined
  /** Cached token state (must be obtained at setup time via useState) */
  cachedToken: { value: string | null }
}

/**
 * Fetch auth token for SSR queries.
 * Uses caching via the provided cachedToken ref to avoid redundant fetches.
 *
 * IMPORTANT: The cachedToken parameter must be obtained at component setup time
 * using useState('convex:token') before being passed to this function.
 * Calling useState inside an async function loses Vue context and will fail.
 *
 * @param options - Auth token fetch options
 * @returns The auth token if available, undefined otherwise
 *
 * @example
 * ```ts
 * // At setup time (synchronous):
 * const cachedToken = useState<string | null>('convex:token')
 *
 * // Later, in async context:
 * const authToken = await fetchAuthToken({
 *   auth: 'auto',
 *   cookieHeader: event?.headers.get('cookie') || '',
 *   siteUrl: config.public.convex?.siteUrl,
 *   cachedToken,
 * })
 * ```
 */
export async function fetchAuthToken(options: FetchAuthTokenOptions): Promise<string | undefined> {
  return await resolveClientAuthToken(options)
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
 * @returns The subscription cache map
 *
 * @example
 * ```ts
 * const cache = getSubscriptionCache(nuxtApp)
 * if (cache.has(cacheKey)) {
 *   // Already subscribed
 *   return
 * }
 * ```
 */
export function getSubscriptionCache(nuxtApp: NuxtApp): SubscriptionCache {
  if (!subscriptionRegistry.has(nuxtApp)) {
    subscriptionRegistry.set(nuxtApp, new Map())
  }
  return subscriptionRegistry.get(nuxtApp)!
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
  const existing = cache.get(cacheKey)

  if (existing) {
    // Subscription exists - increment ref count, don't replace
    existing.refCount++
    return false // This component is joining an existing subscription
  }

  // New subscription
  cache.set(cacheKey, { unsubscribe, refCount: 1 })
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
  return cache.has(cacheKey)
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
  return cache.get(cacheKey)
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
  const entry = cache.get(cacheKey)

  if (!entry) {
    return false
  }

  entry.refCount--

  if (entry.refCount <= 0) {
    // Last reference - actually unsubscribe
    entry.unsubscribe()
    cache.delete(cacheKey)
    return true
  }

  return false
}
