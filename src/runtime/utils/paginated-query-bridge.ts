import type { ConvexClient } from 'convex/browser'
import type { FunctionArgs, FunctionReference, PaginationResult } from 'convex/server'
import type { Ref, ShallowRef } from 'vue'

import { handleUnauthorizedAuthFailure } from './auth-unauthorized'
import {
  acquireQuerySubscription,
  commitQueryBridgeData,
  commitQueryBridgeError,
  subscribeQueryBridge,
  type AcquiredQuerySubscription,
  type QueryBridgeSnapshot,
  type QuerySubscriptionBridge,
} from './convex-cache'
import {
  commitPaginatedPageError,
  commitPaginatedPageResult,
  type PaginatedPageState,
} from './paginated-query-pages'

export interface PaginatedQueryBridgeSync {
  attachFirstPage: (bridge: QuerySubscriptionBridge) => void
  attachPage: (pageIndex: number, bridge: QuerySubscriptionBridge) => void
  cleanupFirstPage: () => void
  cleanupPage: (pageIndex: number) => void
  cleanupAllPages: () => void
}

export function acquirePaginatedQuerySubscription<
  Query extends FunctionReference<'query'>,
  Item,
>(options: {
  nuxtApp: object
  subscriptionKey: string
  convex: ConvexClient
  query: Query
  args: FunctionArgs<Query>
  functionName: string
}): AcquiredQuerySubscription {
  const { nuxtApp, subscriptionKey, convex, query, args, functionName } = options

  return acquireQuerySubscription(nuxtApp, subscriptionKey, (bridge) =>
    convex.onUpdate(
      query,
      args,
      (result: PaginationResult<Item>) => {
        commitQueryBridgeData(bridge, result)
      },
      (err: Error) => {
        void handleUnauthorizedAuthFailure({
          error: err,
          source: 'query',
          functionName,
        })
        commitQueryBridgeError(bridge, err)
      },
    ),
  )
}

export function createPaginatedQueryBridgeSync<T>(options: {
  firstPageRealtimeData: ShallowRef<PaginationResult<T> | null>
  asyncDataError: Ref<Error | null>
  pages: ShallowRef<PaginatedPageState<T>[]>
}): PaginatedQueryBridgeSync {
  const { firstPageRealtimeData, asyncDataError, pages } = options
  const pageBridgeUnsubscribers = new Map<number, () => void>()
  let unsubscribeFirstPageBridge: (() => void) | null = null

  const cleanupPage = (pageIndex: number) => {
    const unsubscribe = pageBridgeUnsubscribers.get(pageIndex)
    if (!unsubscribe) return
    unsubscribe()
    pageBridgeUnsubscribers.delete(pageIndex)
  }

  const cleanupAllPages = () => {
    for (const pageIndex of pageBridgeUnsubscribers.keys()) {
      cleanupPage(pageIndex)
    }
  }

  const cleanupFirstPage = () => {
    if (unsubscribeFirstPageBridge) {
      unsubscribeFirstPageBridge()
      unsubscribeFirstPageBridge = null
    }
  }

  const attachFirstPage = (bridge: QuerySubscriptionBridge) => {
    cleanupFirstPage()

    const syncSnapshotFromBridge = (snapshot: QueryBridgeSnapshot) => {
      if (snapshot.data.hasData) {
        firstPageRealtimeData.value = snapshot.data.rawData as PaginationResult<T>
        if (asyncDataError.value !== null) {
          asyncDataError.value = null
        }
      }

      if (snapshot.error) {
        asyncDataError.value = snapshot.error
      }
    }

    unsubscribeFirstPageBridge = subscribeQueryBridge(bridge, syncSnapshotFromBridge)
  }

  const attachPage = (pageIndex: number, bridge: QuerySubscriptionBridge) => {
    cleanupPage(pageIndex)

    const syncSnapshotFromBridge = (snapshot: QueryBridgeSnapshot) => {
      if (snapshot.data.hasData) {
        const currentPage = pages.value[pageIndex]
        if (!currentPage) return

        pages.value = commitPaginatedPageResult(
          pages.value,
          pageIndex,
          snapshot.data.rawData as PaginationResult<T>,
        )
      }

      const err = snapshot.error
      if (!err) return
      const pageAfterDataSync = pages.value[pageIndex]
      if (!pageAfterDataSync) return

      pages.value = commitPaginatedPageError(pages.value, pageIndex, err)
    }

    pageBridgeUnsubscribers.set(pageIndex, subscribeQueryBridge(bridge, syncSnapshotFromBridge))
  }

  return {
    attachFirstPage,
    attachPage,
    cleanupFirstPage,
    cleanupPage,
    cleanupAllPages,
  }
}
