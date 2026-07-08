import { CONVEX_MODULE_DEFAULTS } from './config-defaults'
import { getBetterAuthSessionToken } from './shared-helpers'

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
const payloadKeyRegistry = new WeakMap<object, Map<string, PayloadKeyCounts>>()

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
  /** Auth transport mode of the query that created this entry. 'none' = public. */
  authMode: 'auto' | 'none'
}

export interface PayloadKeyCounts {
  auto: number
  none: number
}

/**
 * Shared query state for deduplicated useConvexQuery subscribers.
 * Stores raw subscription data once and notifies each subscriber directly so
 * local asyncData refs can apply their own transform().
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

export interface QueryBridgeSnapshot {
  data: QueryBridgeData
  error: Error | null
}

export type QueryBridgeListener = (snapshot: QueryBridgeSnapshot) => void

export interface QuerySubscriptionBridge {
  snapshot: QueryBridgeSnapshot
  listeners: Set<QueryBridgeListener>
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

/**
 * Subscription-cache keys carry the auth transport mode so the same query+args
 * can safely be mounted as both auth:'auto' and auth:'none'. Payload keys
 * deliberately stay auth-agnostic because Nuxt asyncData is keyed by query data.
 */
export function withAuthDimension(key: string, authMode: 'auto' | 'none'): string {
  return `${key}::auth-${authMode}`
}

export function getPayloadKeyRegistry(owner: object): Map<string, PayloadKeyCounts> {
  let map = payloadKeyRegistry.get(owner)
  if (!map) {
    map = new Map()
    payloadKeyRegistry.set(owner, map)
  }
  return map
}

export function registerPayloadKey(
  owner: object,
  key: string,
  authMode: 'auto' | 'none',
): () => void {
  const map = getPayloadKeyRegistry(owner)
  const counts = map.get(key) ?? { auto: 0, none: 0 }
  counts[authMode] += 1
  map.set(key, counts)

  let released = false
  return () => {
    if (released) return
    released = true

    const current = map.get(key)
    if (!current) return

    current[authMode] = Math.max(0, current[authMode] - 1)
    if (current.auto === 0 && current.none === 0) {
      map.delete(key)
    }
  }
}

export function getPublicOnlyPayloadKeys(owner: object): Set<string> {
  const keep = new Set<string>()
  for (const [key, counts] of getPayloadKeyRegistry(owner)) {
    if (counts.none > 0 && counts.auto === 0) {
      keep.add(key)
    }
  }
  return keep
}

export function createQueryBridge(): QuerySubscriptionBridge {
  return {
    snapshot: {
      data: { hasData: false, rawData: undefined },
      error: null,
    },
    listeners: new Set(),
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

function notifyQueryBridgeListeners(bridge: QuerySubscriptionBridge): void {
  const snapshot = bridge.snapshot
  for (const listener of Array.from(bridge.listeners)) {
    listener(snapshot)
  }
}

export function subscribeQueryBridge(
  bridge: QuerySubscriptionBridge,
  listener: QueryBridgeListener,
): () => void {
  bridge.listeners.add(listener)
  listener(bridge.snapshot)
  return () => {
    bridge.listeners.delete(listener)
  }
}

export function waitForQueryBridgeData<T>(
  bridge: QuerySubscriptionBridge,
  options: { timeoutMs?: number; timeoutMessage?: string } = {},
): Promise<T> {
  if (bridge.snapshot.data.hasData) {
    return Promise.resolve(bridge.snapshot.data.rawData as T)
  }
  if (bridge.snapshot.error) {
    return Promise.reject(bridge.snapshot.error)
  }

  const timeoutMs = options.timeoutMs ?? CONVEX_MODULE_DEFAULTS.defaults.waitTimeoutMs

  return new Promise((resolve, reject) => {
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | null =
      timeoutMs > 0 && Number.isFinite(timeoutMs)
        ? setTimeout(() => {
            finishReject(
              new Error(
                options.timeoutMessage ??
                  `[useConvexQuery] Timed out waiting for subscription result after ${timeoutMs}ms`,
              ),
            )
          }, timeoutMs)
        : null
    let unsubscribe: (() => void) | null = null

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      if (unsubscribe) {
        unsubscribe()
        unsubscribe = null
      }
    }

    const finishResolve = (result: T) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    const finishReject = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error instanceof Error ? error : new Error(String(error)))
    }

    unsubscribe = subscribeQueryBridge(bridge, (snapshot) => {
      if (snapshot.data.hasData) {
        finishResolve(snapshot.data.rawData as T)
        return
      }
      if (snapshot.error) {
        finishReject(snapshot.error)
      }
    })
  })
}

export function commitQueryBridgeData(bridge: QuerySubscriptionBridge, rawData: unknown): void {
  bridge.snapshot = {
    data: { hasData: true, rawData },
    error: null,
  }
  notifyQueryBridgeListeners(bridge)
}

export function commitQueryBridgeError(bridge: QuerySubscriptionBridge, error: Error): void {
  bridge.snapshot = {
    data: bridge.snapshot.data,
    error,
  }
  notifyQueryBridgeListeners(bridge)
}

export function acquireQuerySubscription(
  nuxtApp: SubscriptionCacheOwner,
  cacheKey: string,
  start: (bridge: QuerySubscriptionBridge) => () => void,
  meta: { authMode: 'auto' | 'none' } = { authMode: 'auto' },
): AcquiredQuerySubscription {
  const cache = getSubscriptionCache(nuxtApp)
  const existing = cache.get(cacheKey)

  if (existing) {
    if (import.meta.dev && existing.authMode !== meta.authMode) {
      console.warn(
        `[better-convex-nuxt] subscription ${cacheKey} acquired with mismatched authMode`,
      )
    }
    existing.refCount += 1
    return {
      bridge: ensureQueryBridge(existing),
      refCount: existing.refCount,
      release: () => releaseSubscription(nuxtApp, cacheKey),
    }
  }

  const bridge = createQueryBridge()
  const unsubscribe = start(bridge)
  const entry: SubscriptionEntry = {
    unsubscribe,
    refCount: 1,
    queryBridge: bridge,
    authMode: meta.authMode,
  }
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
  /** Cached token state (must be obtained at setup time via useState) */
  cachedToken: { value: string | null }
}

/**
 * Resolve the SSR auth token for a query.
 *
 * This performs NO cookie -> JWT exchange (F-13). `plugin.server.ts` runs before
 * any route component's setup and already exchanged the session cookie once,
 * writing the result into `useState('convex:token')`. SSR queries must reuse
 * that single per-request exchange, never run a second one. This helper simply
 * returns the plugin-resolved token when a Better Auth session cookie is present.
 *
 * IMPORTANT: The cachedToken parameter must be obtained at component setup time
 * using useState('convex:token') before being passed to this function.
 * Calling useState inside an async function loses Vue context and will fail.
 *
 * @param options - Auth token fetch options
 * @returns The plugin-resolved token if a session exists, undefined otherwise
 */
export function fetchAuthToken(options: FetchAuthTokenOptions): string | undefined {
  const { auth, cookieHeader, cachedToken } = options

  // Skip when auth is explicitly disabled
  if (auth === 'none') {
    return undefined
  }

  // No Better Auth session cookie -> the plugin resolved no token for this request.
  if (!getBetterAuthSessionToken(cookieHeader)) {
    return undefined
  }

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

/**
 * Tear down only auth-carrying subscriptions after sign-out.
 * Public (auth: 'none') queries are auth-independent and must keep streaming.
 */
export function clearAuthSubscriptions(nuxtApp: SubscriptionCacheOwner): void {
  const cache = getSubscriptionCache(nuxtApp)
  for (const [key, entry] of cache.entries()) {
    if (entry.authMode === 'none') continue
    entry.unsubscribe()
    cache.delete(key)
  }
}
