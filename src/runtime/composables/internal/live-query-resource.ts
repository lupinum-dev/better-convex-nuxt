import type { FunctionArgs, FunctionReference } from 'convex/server'
import { getCurrentInstance, getCurrentScope, onUnmounted, type ComputedRef, type Ref } from 'vue'

import {
  computed,
  onScopeDispose,
  useAsyncData,
  watch,
} from '#imports'

import { computeQueryStatus, type QueryStatus } from '../../utils/convex-cache'
import type { ConvexClientAuthMode } from '../../utils/types'
import { executeLiveQuery, executeQueryHttp } from './live-query-transport'
import {
  startSharedQuerySubscription,
  type SharedQuerySubscriptionHandle,
} from './shared-query-subscription'

export type LiveQueryUnsubscribeReason = 'args-changed' | 'args-skipped' | 'scope-dispose'

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
  onUnsubscribe?: (
    cacheKey: string,
    didRelease: boolean,
    reason: LiveQueryUnsubscribeReason,
  ) => void
  onData?: (result: Result, source: 'loader' | 'subscription') => void
  onError?: (error: Error) => void
}

export interface LiveQueryResource<Result> {
  asyncData: ReturnType<typeof useAsyncData<Result | null, Error>>
  pending: ComputedRef<boolean>
  status: ComputedRef<QueryStatus>
  resolvePromise: Promise<void>
}

export { executeLiveQuery, executeQueryHttp }

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

  const releaseSubscriptionHandle = (reason: LiveQueryUnsubscribeReason) => {
    if (!subscriptionHandle) return false
    const didRelease = subscriptionHandle.release()
    options.onUnsubscribe?.(cacheKey.value, didRelease, reason)
    subscriptionHandle = null
    return didRelease
  }

  if (import.meta.client && subscribe) {
    const syncSubscription = () => {
      const currentArgs = args.value
      if (isSkipped.value || currentArgs == null) {
        releaseSubscriptionHandle('args-skipped')
        return
      }

      releaseSubscriptionHandle('args-changed')
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

    const cleanup = () => {
      releaseSubscriptionHandle('scope-dispose')
    }

    if (getCurrentScope()) {
      onScopeDispose(cleanup)
    } else if (getCurrentInstance()) {
      onUnmounted(cleanup)
    }
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

  const status = computed(
    (): QueryStatus =>
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
