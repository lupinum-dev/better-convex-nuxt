import type { ConvexClient } from 'convex/browser'
import type { FunctionArgs, FunctionReference, PaginationResult } from 'convex/server'
import { watch, type Ref, type ShallowRef, type WatchStopHandle } from 'vue'

import { handleUnauthorizedAuthFailure } from './auth-unauthorized'
import {
  acquireQuerySubscription,
  commitQueryBridgeData,
  commitQueryBridgeError,
  type AcquiredQuerySubscription,
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
  const pageBridgeWatchStops = new Map<
    number,
    { data: WatchStopHandle | null; error: WatchStopHandle | null }
  >()
  let stopFirstPageBridgeDataWatch: WatchStopHandle | null = null
  let stopFirstPageBridgeErrorWatch: WatchStopHandle | null = null

  const cleanupPage = (pageIndex: number) => {
    const stops = pageBridgeWatchStops.get(pageIndex)
    if (!stops) return
    stops.data?.()
    stops.error?.()
    pageBridgeWatchStops.delete(pageIndex)
  }

  const cleanupAllPages = () => {
    for (const pageIndex of pageBridgeWatchStops.keys()) {
      cleanupPage(pageIndex)
    }
  }

  const cleanupFirstPage = () => {
    if (stopFirstPageBridgeDataWatch) {
      stopFirstPageBridgeDataWatch()
      stopFirstPageBridgeDataWatch = null
    }
    if (stopFirstPageBridgeErrorWatch) {
      stopFirstPageBridgeErrorWatch()
      stopFirstPageBridgeErrorWatch = null
    }
  }

  const attachFirstPage = (bridge: QuerySubscriptionBridge) => {
    cleanupFirstPage()

    const syncDataFromBridge = () => {
      const snapshot = bridge.data.value
      if (!snapshot.hasData) return
      firstPageRealtimeData.value = snapshot.rawData as PaginationResult<T>
      if (asyncDataError.value !== null) {
        asyncDataError.value = null
      }
    }

    const syncErrorFromBridge = () => {
      const err = bridge.error.value
      if (!err) return
      asyncDataError.value = err
    }

    stopFirstPageBridgeDataWatch = watch(() => bridge.data.value, syncDataFromBridge)
    stopFirstPageBridgeErrorWatch = watch(() => bridge.error.value, syncErrorFromBridge)

    syncDataFromBridge()
    syncErrorFromBridge()
  }

  const attachPage = (pageIndex: number, bridge: QuerySubscriptionBridge) => {
    cleanupPage(pageIndex)

    const syncDataFromBridge = () => {
      const snapshot = bridge.data.value
      if (!snapshot.hasData) return
      const currentPage = pages.value[pageIndex]
      if (!currentPage) return

      pages.value = commitPaginatedPageResult(
        pages.value,
        pageIndex,
        snapshot.rawData as PaginationResult<T>,
      )
    }

    const syncErrorFromBridge = () => {
      const err = bridge.error.value
      if (!err) return
      const currentPage = pages.value[pageIndex]
      if (!currentPage) return

      pages.value = commitPaginatedPageError(pages.value, pageIndex, err)
    }

    const stopData = watch(() => bridge.data.value, syncDataFromBridge)
    const stopError = watch(() => bridge.error.value, syncErrorFromBridge)
    pageBridgeWatchStops.set(pageIndex, { data: stopData, error: stopError })

    syncDataFromBridge()
    syncErrorFromBridge()
  }

  return {
    attachFirstPage,
    attachPage,
    cleanupFirstPage,
    cleanupPage,
    cleanupAllPages,
  }
}
