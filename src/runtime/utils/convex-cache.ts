import { shallowRef, type ShallowRef } from 'vue'

// Re-export shared utilities
export {
  parseConvexResponse,
  computeQueryStatus,
  getFunctionName,
  hashArgs,
  getQueryKey,
} from './convex-shared'
export type { ConvexCallStatus } from './types'

type SubscriptionCacheOwner = object

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
 * Stores raw subscription data in reactive source refs so each subscriber
 * can sync into its own local asyncData refs with its own transform().
 */
export type QueryBridgeData =
  | {
      hasData: false
      rawData: undefined
    }
  | {
      hasData: true
      rawData: unknown
    }

export interface QuerySubscriptionBridge {
  data: ShallowRef<QueryBridgeData>
  error: ShallowRef<Error | null>
}

/**
 * Subscription cache stored per NuxtApp instance.
 */
export type SubscriptionCache = Map<string, SubscriptionEntry>

export interface AcquiredQuerySubscription {
  bridge: QuerySubscriptionBridge
  refCount: number
  release: () => boolean
}

export function createQueryBridge(): QuerySubscriptionBridge {
  return {
    data: shallowRef({ hasData: false, rawData: undefined }),
    error: shallowRef(null),
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

export function commitQueryBridgeData(bridge: QuerySubscriptionBridge, rawData: unknown): void {
  bridge.data.value = { hasData: true, rawData }
  bridge.error.value = null
}

export function commitQueryBridgeError(bridge: QuerySubscriptionBridge, error: Error): void {
  bridge.error.value = error
}

export function acquireQuerySubscription(
  nuxtApp: SubscriptionCacheOwner,
  cacheKey: string,
  start: (bridge: QuerySubscriptionBridge) => () => void,
): AcquiredQuerySubscription {
  const cache = getSubscriptionCache(nuxtApp)
  const existing = cache.get(cacheKey)

  if (existing) {
    existing.refCount += 1
    return {
      bridge: ensureQueryBridge(existing),
      refCount: existing.refCount,
      release: () => releaseSubscription(nuxtApp, cacheKey),
    }
  }

  const bridge = createQueryBridge()
  const unsubscribe = start(bridge)
  const entry: SubscriptionEntry = { unsubscribe, refCount: 1, queryBridge: bridge }
  cache.set(cacheKey, entry)

  return {
    bridge,
    refCount: entry.refCount,
    release: () => releaseSubscription(nuxtApp, cacheKey),
  }
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
  const { auth, cookieHeader, siteUrl, cachedToken } = options

  // Skip when auth is explicitly disabled
  if (auth === 'none') {
    return undefined
  }

  // Check if we have session cookie
  if (!cookieHeader.includes('better-auth.session_token')) {
    return undefined
  }

  // Try cached token first
  if (cachedToken.value) {
    return cachedToken.value
  }

  // Fetch token if we have a site URL
  if (!siteUrl) {
    return undefined
  }

  try {
    const response = (await $fetch(`${siteUrl}/api/auth/convex/token`, {
      headers: { Cookie: cookieHeader },
    })) as { token?: string }
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
export function getSubscriptionCache(nuxtApp: SubscriptionCacheOwner): SubscriptionCache {
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
  nuxtApp: SubscriptionCacheOwner,
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
export function hasSubscription(nuxtApp: SubscriptionCacheOwner, cacheKey: string): boolean {
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
export function getSubscription(
  nuxtApp: SubscriptionCacheOwner,
  cacheKey: string,
): SubscriptionEntry | undefined {
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
export function releaseSubscription(nuxtApp: SubscriptionCacheOwner, cacheKey: string): boolean {
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

/**
 * Unsubscribe and remove every shared Convex query subscription for a Nuxt app.
 * Used after successful sign-out so authenticated live queries cannot keep
 * streaming data from the previous session.
 */
export function clearSubscriptionCache(nuxtApp: SubscriptionCacheOwner): void {
  const cache = getSubscriptionCache(nuxtApp)

  for (const entry of cache.values()) {
    entry.unsubscribe()
  }

  cache.clear()
}
