import type { useNuxtApp } from '#imports'
import type { FunctionReference } from 'convex/server'

import { useState } from '#imports'

// Get the NuxtApp type from useNuxtApp return type
type NuxtApp = ReturnType<typeof useNuxtApp>

// Convex stores function names using this Symbol
const functionNameSymbol = Symbol.for('functionName')

// ============================================================================
// Types
// ============================================================================

/**
 * Query status representing the current state of the query
 */
export type QueryStatus = 'idle' | 'pending' | 'success' | 'error'

/**
 * Logger function type for debug logging
 */
export type QueryLogger = (message: string, data?: unknown) => void

/**
 * Subscription cache stored on NuxtApp
 */
export type SubscriptionCache = Record<string, (() => void) | undefined>

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse Convex response, handling both success and error formats.
 *
 * Success formats:
 * - { value: T, status: 'success' }
 * - { value: T }
 * - T (direct value for primitives)
 *
 * Error formats:
 * - { status: 'error', errorMessage: string }
 * - { code: string, message: string }
 */
export function parseConvexResponse<T>(response: unknown): T {
  // Check for error response
  if (response && typeof response === 'object') {
    const resp = response as Record<string, unknown>
    if (resp.status === 'error' || resp.code) {
      const message = (resp.errorMessage || resp.message || 'Query failed') as string
      throw new Error(message)
    }
    // Check for value wrapper
    if ('value' in resp) {
      return resp.value as T
    }
  }
  // Direct value (shouldn't happen with Convex, but handle gracefully)
  return response as T
}

// ============================================================================
// Query Status
// ============================================================================

/**
 * Status computation logic for queries.
 *
 * Priority order:
 * 1. Skip -> idle (always)
 * 2. Error -> error (takes precedence over pending)
 * 3. Pending without data -> pending
 * 4. Everything else -> success (including pending with data for background refresh)
 */
export function computeQueryStatus(
  isSkipped: boolean,
  hasError: boolean,
  isPending: boolean,
  hasData: boolean,
): QueryStatus {
  if (isSkipped) return 'idle'
  if (hasError) return 'error'
  if (isPending && !hasData) return 'pending'
  return 'success'
}

// ============================================================================
// Function Name Extraction
// ============================================================================

/**
 * Get the function name from a Convex function reference.
 * Works with queries, mutations, and actions.
 */
export function getFunctionName(
  fn: FunctionReference<'query'> | FunctionReference<'mutation'> | FunctionReference<'action'>,
): string {
  if (!fn) return 'unknown'

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = fn as any

    // Convex uses Symbol.for('functionName') to store the path
    const symbolName = q[functionNameSymbol]
    if (typeof symbolName === 'string') return symbolName

    // Fallback: check for _path (used in tests/mocks)
    if (typeof q._path === 'string') return q._path

    // Fallback: check for functionPath
    if (typeof q.functionPath === 'string') return q.functionPath

    // Fallback: if it's already a string
    if (typeof q === 'string') return q

    return 'unknown'
  } catch {
    return 'unknown'
  }
}

// ============================================================================
// Cache Key Generation
// ============================================================================

/**
 * Stable stringify for cache key generation.
 * Handles arrays, nested objects, null, undefined correctly.
 */
export function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null'
  if (typeof obj !== 'object') return JSON.stringify(obj)

  if (Array.isArray(obj)) {
    // Don't double-stringify: recursively stringify items then join
    return '[' + obj.map((item) => stableStringify(item)).join(',') + ']'
  }

  // Sort object keys for stable ordering
  const record = obj as Record<string, unknown>
  const sortedKeys = Object.keys(record).sort()
  const pairs = sortedKeys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
  return '{' + pairs.join(',') + '}'
}

/**
 * Generate a unique cache key for a query + args combination
 */
export function getQueryKey(query: FunctionReference<'query'>, args?: unknown): string {
  const fnName = getFunctionName(query)
  const argsKey = stableStringify(args ?? {})
  return `convex:${fnName}:${argsKey}`
}

// ============================================================================
// Logger Factory
// ============================================================================

/**
 * Create a debug logger for query composables.
 *
 * @param verbose - Whether logging is enabled
 * @param composableName - Name of the composable (e.g., 'useConvexQuery')
 * @param query - The Convex query function reference
 * @returns Logger function that logs with environment prefix
 *
 * @example
 * ```ts
 * const log = createQueryLogger(options?.verbose ?? false, 'useConvexQuery', query)
 * log('Initializing', { lazy, server })
 * ```
 */
export function createQueryLogger(
  verbose: boolean,
  composableName: string,
  query: FunctionReference<'query'>,
): QueryLogger {
  if (!verbose) {
    return () => {}
  }

  let fnName: string
  try {
    fnName = getFunctionName(query)
  } catch {
    fnName = 'unknown'
  }

  return (message: string, data?: unknown) => {
    const env = import.meta.server ? '[SSR]' : '[Client]'
    const prefix = `[${composableName}] ${env} ${fnName}: `
    if (data !== undefined) {
      console.log(prefix + message, data)
    } else {
      console.log(prefix + message)
    }
  }
}

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

// ============================================================================
// Thenable Result Builder (DEPRECATED - will be removed with useAsyncData migration)
// ============================================================================

/**
 * Build a thenable result object that can be awaited.
 * Combines a Promise with reactive data properties.
 *
 * @deprecated Will be removed when migrating to useAsyncData
 * @param resolvePromise - The promise that resolves when data is ready
 * @param resultData - The reactive data object to attach
 * @returns A thenable object with both Promise and data properties
 */
export function buildThenableResult<T extends object>(
  resolvePromise: Promise<void>,
  resultData: T,
): T & Promise<T> {
  const resultPromise = resolvePromise.then(() => resultData)
  Object.assign(resultPromise, resultData)
  return resultPromise as T & Promise<T>
}
