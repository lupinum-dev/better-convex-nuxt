import type { ConvexClient } from 'convex/browser'
import type { FunctionArgs, FunctionReference } from 'convex/server'
import { computed, onScopeDispose, useAsyncData, useNuxtApp, useRequestEvent, useState, watch } from '#imports'
import type { ComputedRef, Ref } from 'vue'

import { handleUnauthorizedAuthFailure } from '../../utils/auth-unauthorized'
import {
  computeQueryStatus,
  ensureQueryBridge,
  fetchAuthToken,
  getSubscription,
  registerSubscription,
  releaseSubscription,
  createQueryBridge,
  getFunctionName,
  parseConvexResponse,
  type ConvexCallStatus,
} from '../../utils/convex-cache'
import { executeQueryViaSubscriptionOnce } from '../../utils/one-shot-subscription'
import { getConvexRuntimeConfig } from '../../utils/runtime-config'
import type { ConvexClientAuthMode } from '../../utils/types'

export interface LiveQueryTransportOptions<Query extends FunctionReference<'query'>> {
  query: Query
  functionName?: string
  args: FunctionArgs<Query>
  subscribe: boolean
  authMode: ConvexClientAuthMode
}

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

export interface LiveQueryResourceOptions<Query extends FunctionReference<'query'>, Result> {
  query: Query
  args: ComputedRef<FunctionArgs<Query> | null | undefined>
  cacheKey: ComputedRef<string>
  watchSource?: ComputedRef<string>
  isSkipped: ComputedRef<boolean>
  server: boolean
  subscribe: boolean
  authMode: ConvexClientAuthMode
  resolveImmediately: boolean
  defaultValue?: () => Result | null
  dedupe?: 'cancel' | 'defer'
  onShare?: (refCount: number) => void
  onSubscribe?: (cacheKey: string) => void
  onUnsubscribe?: (cacheKey: string, didRelease: boolean) => void
  onData?: (result: Result, source: 'loader' | 'subscription') => void
  onError?: (error: Error) => void
}

export interface LiveQueryResource<Result> {
  asyncData: ReturnType<typeof useAsyncData<Result | null, Error>>
  pending: ComputedRef<boolean>
  status: ComputedRef<ConvexCallStatus>
  resolvePromise: Promise<void>
}

export async function executeQueryHttp<T>(
  convexUrl: string,
  functionPath: string,
  args: Record<string, unknown>,
  authToken?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`
  }

  const response = await $fetch(`${convexUrl}/api/query`, {
    method: 'POST',
    headers,
    body: { path: functionPath, args: args ?? {} },
  })

  return parseConvexResponse<T>(response)
}

export async function executeLiveQuery<Query extends FunctionReference<'query'>, Result>(
  options: LiveQueryTransportOptions<Query>,
): Promise<Result> {
  const { query, args, subscribe, authMode } = options
  const functionName = options.functionName ?? getFunctionName(query)
  const nuxtApp = useNuxtApp()
  const convexConfig = getConvexRuntimeConfig()
  const convexUrl = convexConfig.url

  if (!convexUrl) {
    throw new Error('[better-convex-nuxt] Convex URL not configured')
  }

  const cookieHeader = import.meta.server ? useRequestEvent()?.headers.get('cookie') || '' : ''
  const cachedToken = useState<string | null>('convex:token')

  try {
    if (import.meta.server) {
      const authToken = await fetchAuthToken({
        auth: authMode,
        cookieHeader,
        siteUrl: convexConfig.siteUrl,
        cachedToken,
      })
      return await executeQueryHttp<Result>(
        convexUrl,
        functionName,
        (args ?? {}) as Record<string, unknown>,
        authToken,
      )
    }

    if (!subscribe) {
      const authToken = authMode === 'none' ? undefined : (cachedToken.value ?? undefined)
      return await executeQueryHttp<Result>(
        convexUrl,
        functionName,
        (args ?? {}) as Record<string, unknown>,
        authToken,
      )
    }

    const convex = nuxtApp.$convex as ConvexClient | undefined
    if (!convex) {
      throw new Error('[better-convex-nuxt] Convex client not available')
    }

    return await executeQueryViaSubscriptionOnce(convex, query, args)
  } catch (error) {
    if (import.meta.client) {
      void handleUnauthorizedAuthFailure({
        error,
        source: 'query',
        functionName,
      })
    }
    throw error instanceof Error ? error : new Error(String(error))
  }
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
        return releaseSubscription(nuxtApp, cacheKey)
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
      throw new Error('[better-convex-nuxt] Failed to register shared subscription')
    }
    entry.queryBridge = localBridge
    onSubscribe?.(cacheKey)
    attachBridge()
  } catch (error) {
    cleanupBridgeWatchers()
    if (unsubscribe && !registered) {
      unsubscribe()
    }
    onError(error instanceof Error ? error : new Error(String(error)))
  }

  return {
    sync: attachBridge,
    release: () => {
      cleanupBridgeWatchers()
      return releaseSubscription(nuxtApp, cacheKey)
    },
  }
}

export function createLiveQueryResource<Query extends FunctionReference<'query'>, Result>(
  options: LiveQueryResourceOptions<Query, Result>,
): LiveQueryResource<Result> {
  const {
    query,
    args,
    cacheKey,
    isSkipped,
    server,
    subscribe,
    authMode,
    resolveImmediately,
    defaultValue,
    dedupe,
    onShare,
  } = options

  const asyncData = useAsyncData<Result | null, Error>(
    cacheKey,
    async () => {
      const currentArgs = args.value
      if (isSkipped.value || currentArgs == null) {
        return null
      }

      try {
        const result = await executeLiveQuery<Query, Result>({
          query,
          args: currentArgs as FunctionArgs<Query>,
          subscribe,
          authMode,
        })
        options.onData?.(result, 'loader')
        return result
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        options.onError?.(err)
        throw err
      }
    },
    {
      server,
      lazy: resolveImmediately,
      dedupe,
      default: defaultValue,
      deep: false,
    },
  )

  let subscriptionHandle: SharedQuerySubscriptionHandle | null = null

  const releaseSubscriptionHandle = () => {
    if (!subscriptionHandle) return false
    const didRelease = subscriptionHandle.release()
    options.onUnsubscribe?.(cacheKey.value, didRelease)
    subscriptionHandle = null
    return didRelease
  }

  if (import.meta.client && subscribe) {
    const syncSubscription = () => {
      const currentArgs = args.value
      if (isSkipped.value || currentArgs == null) {
        releaseSubscriptionHandle()
        return
      }

      releaseSubscriptionHandle()
      subscriptionHandle = startSharedQuerySubscription<Query, Result>({
        query,
        args: currentArgs as FunctionArgs<Query>,
        cacheKey: cacheKey.value,
        onShare,
        onSubscribe: options.onSubscribe,
        onData: (result) => {
          ;(asyncData.data as Ref<Result | null>).value = result
          ;(asyncData.error as Ref<Error | null>).value = null
          options.onData?.(result, 'subscription')
        },
        onError: (error) => {
          const hasData = asyncData.data.value !== null && asyncData.data.value !== undefined
          if (!hasData) {
            ;(asyncData.error as Ref<Error | null>).value = error
          }
          options.onError?.(error)
        },
      })
    }

    syncSubscription()

    watch(options.watchSource ?? cacheKey, () => {
      syncSubscription()

      setTimeout(() => {
        subscriptionHandle?.sync()
      }, 0)
    })

    onScopeDispose(() => {
      releaseSubscriptionHandle()
    })
  }

  const pending = computed((): boolean => {
    if (isSkipped.value) return false

    const hasData = asyncData.data.value !== null && asyncData.data.value !== undefined
    const hasSettled = asyncData.status.value === 'success' || asyncData.status.value === 'error'

    if (!server) {
      if (import.meta.server) return true
      if (!hasData && !hasSettled) return true
    }

    if (resolveImmediately && import.meta.client && !hasData && !hasSettled) {
      return true
    }

    return asyncData.pending.value
  })

  const status = computed((): ConvexCallStatus =>
    computeQueryStatus(
      isSkipped.value,
      asyncData.error.value != null,
      pending.value,
      asyncData.data.value != null,
    ),
  )

  let resolvePromise: Promise<void>
  if (isSkipped.value) {
    resolvePromise = Promise.resolve()
  } else if (import.meta.server) {
    resolvePromise = server ? asyncData.then(() => {}) : Promise.resolve()
  } else {
    const hasExistingData = asyncData.data.value !== null && asyncData.data.value !== undefined
    resolvePromise =
      hasExistingData || resolveImmediately ? Promise.resolve() : asyncData.then(() => {})
  }

  return {
    asyncData,
    pending,
    status,
    resolvePromise,
  }
}
