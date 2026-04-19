import type { ConvexClient } from 'convex/browser'
import type { FunctionArgs, FunctionReference } from 'convex/server'

import { useNuxtApp, watch } from '#imports'

import { handleUnauthorizedAuthFailure } from '../../auth/shared/auth-unauthorized.js'
import {
  createQueryBridge,
  ensureQueryBridge,
  getFunctionName,
  getSubscription,
  registerSubscription,
  releaseSubscription,
} from '../shared/convex-cache.js'

export interface SharedQuerySubscriptionOptions<Query extends FunctionReference<'query'>, Result> {
  query: Query
  args: FunctionArgs<Query>
  cacheKey: string
  functionName?: string
  onData: (result: Result) => void
  onError: (error: Error) => void
  onShare?: (refCount: number) => void
  onSubscribe?: (cacheKey: string) => void
}

export interface SharedQuerySubscriptionHandle {
  sync: () => void
  release: () => boolean
}

const subscriptionLeakState = new Map<string, { timestamps: number[]; warned: boolean }>()

function shouldEmitDevWarning(): boolean {
  return import.meta.dev || process.env.NODE_ENV !== 'production'
}

export function clearSubscriptionLeakTracking(cacheKey?: string): void {
  if (cacheKey) {
    subscriptionLeakState.delete(cacheKey)
    return
  }
  subscriptionLeakState.clear()
}

export function __recordSubscriptionUpdateForTests(cacheKey: string): void {
  const now = Date.now()
  const state = subscriptionLeakState.get(cacheKey) ?? {
    timestamps: [],
    warned: false,
  }
  state.timestamps.push(now)
  subscriptionLeakState.set(cacheKey, state)
}

export function __getTrackedSubscriptionLeakKeysForTests(): string[] {
  return [...subscriptionLeakState.keys()].sort((a, b) => a.localeCompare(b))
}

function recordSubscriptionUpdate(cacheKey: string): void {
  if (!import.meta.client || !shouldEmitDevWarning()) return

  const now = Date.now()
  const state = subscriptionLeakState.get(cacheKey) ?? {
    timestamps: [],
    warned: false,
  }
  state.timestamps.push(now)
  state.timestamps = state.timestamps.filter((timestamp) => now - timestamp <= 10_000)

  if (!state.warned && state.timestamps.length > 100) {
    state.warned = true
    console.warn(
      `[trellis] Query subscription "${cacheKey}" updated more than 100 times in 10 seconds. Check for reactive arg loops or unstable computed args.`,
    )
  }

  subscriptionLeakState.set(cacheKey, state)
}

export function releaseTrackedSharedSubscription(
  nuxtApp: ReturnType<typeof useNuxtApp>,
  cacheKey: string,
): boolean {
  const didRelease = releaseSubscription(nuxtApp, cacheKey)
  if (didRelease) {
    clearSubscriptionLeakTracking(cacheKey)
  }
  return didRelease
}

export function startSharedQuerySubscription<Query extends FunctionReference<'query'>, Result>(
  options: SharedQuerySubscriptionOptions<Query, Result>,
): SharedQuerySubscriptionHandle {
  const { query, args, cacheKey, onData, onError, onShare, onSubscribe } = options
  const functionName = options.functionName ?? getFunctionName(query)
  const nuxtApp = useNuxtApp()
  const convex = nuxtApp.$convex as ConvexClient | undefined

  if (!import.meta.client || !convex) {
    return {
      sync: () => {},
      release: () => false,
    }
  }

  let stopDataWatch: (() => void) | null = null
  let stopErrorWatch: (() => void) | null = null

  const cleanupBridgeWatchers = () => {
    stopDataWatch?.()
    stopDataWatch = null
    stopErrorWatch?.()
    stopErrorWatch = null
  }

  const attachBridge = () => {
    const entry = getSubscription(nuxtApp, cacheKey)
    if (!entry) return
    const bridge = ensureQueryBridge(entry)

    const syncData = () => {
      if (!bridge.hasRawData) return
      onData(bridge.rawData as Result)
    }

    const syncError = () => {
      if (!bridge.error) return
      onError(bridge.error)
    }

    cleanupBridgeWatchers()
    stopDataWatch = watch(() => bridge.dataVersion.value, syncData)
    stopErrorWatch = watch(() => bridge.errorVersion.value, syncError)

    syncData()
    syncError()
  }

  const existingEntry = getSubscription(nuxtApp, cacheKey)
  if (existingEntry) {
    existingEntry.refCount++
    onShare?.(existingEntry.refCount)
    onSubscribe?.(cacheKey)
    attachBridge()

    return {
      sync: attachBridge,
      release: () => {
        cleanupBridgeWatchers()
        return releaseTrackedSharedSubscription(nuxtApp, cacheKey)
      },
    }
  }

  const localBridge = createQueryBridge()
  let unsubscribe: (() => void) | null = null
  let registered = false

  try {
    unsubscribe = convex.onUpdate(
      query,
      args,
      (result: Result) => {
        recordSubscriptionUpdate(cacheKey)
        localBridge.rawData = result
        localBridge.hasRawData = true
        localBridge.error = null
        localBridge.dataVersion.value += 1
      },
      (error: Error) => {
        void handleUnauthorizedAuthFailure({
          error,
          source: 'query',
          functionName,
        })
        localBridge.error = error
        localBridge.errorVersion.value += 1
      },
    )
    registerSubscription(nuxtApp, cacheKey, unsubscribe)
    registered = true

    const entry = getSubscription(nuxtApp, cacheKey)
    if (!entry) {
      throw new Error('[trellis] Failed to register shared subscription')
    }
    entry.queryBridge = localBridge
    onSubscribe?.(cacheKey)
    attachBridge()
  } catch (error) {
    cleanupBridgeWatchers()
    if (unsubscribe && !registered) {
      unsubscribe()
      unsubscribe = null
    }
    onError(error instanceof Error ? error : new Error(String(error)))
  }

  return {
    sync: attachBridge,
    release: () => {
      cleanupBridgeWatchers()
      return releaseTrackedSharedSubscription(nuxtApp, cacheKey)
    },
  }
}

const hot = (import.meta as unknown as { hot?: { dispose: (fn: () => void) => void } }).hot
hot?.dispose(() => {
  clearSubscriptionLeakTracking()
})
