import { makeFunctionReference, type PaginationResult } from 'convex/server'

import { createCallableController } from '../../../packages/vue/src/internal/callable-controller'
import { createPaginationController } from '../../../packages/vue/src/internal/pagination-controller'
import { createQueryController } from '../../../packages/vue/src/internal/query-controller'

interface Row {
  id: string
}

const query = makeFunctionReference<'query'>('notes:list')

function page(ids: string[], continueCursor: string, isDone = false): PaginationResult<Row> {
  return { page: ids.map((id) => ({ id })), continueCursor, isDone }
}

export async function runPrivateVueLifecycleProof() {
  let identityGeneration = 1
  let identityKey: 'user:alice' | 'user:bob' = 'user:alice'
  const identityListeners = new Set<() => void>()
  let queryData: Row[] | null = null
  let queryValue: ((value: unknown) => void) | null = null
  let queryStops = 0
  const emitQueryValue = (value: unknown) => queryValue?.(value)
  const captureQueryValue = () => queryValue

  const queryController = createQueryController<Row[], Row[]>({
    query,
    subscribe: true,
    keepPreviousData: true,
    getArgs: () => ({ owner: identityKey }),
    getArgsHash: () => identityKey,
    getBoundaryKey: () => `notes:${identityKey}`,
    getIsolationTag: () => ({ identityKey, identityGeneration }),
    getClient: () => ({
      onUpdate(_query, _args, onValue) {
        queryValue = onValue
        return () => {
          queryStops += 1
          queryValue = null
        }
      },
    }),
    boundary: {
      readData: () => queryData,
      writeData: (value) => {
        queryData = value
      },
      clearAsyncError: () => {},
      setError: () => {},
      clearData: () => {
        queryData = null
      },
    },
  })
  queryController.setupSubscription()
  emitQueryValue([{ id: 'query-a' }])

  const paginationSubscriptions: Array<{
    active: boolean
    value(value: PaginationResult<Row>): void
  }> = []
  const paginationController = createPaginationController<Row>({
    query,
    initialNumItems: 1,
    subscribe: true,
    keepPreviousData: true,
    getArgs: () => ({ owner: identityKey }),
    getArgsHash: () => identityKey,
    getBoundaryKey: () => `notes:${identityKey}`,
    getIsolationTag: () => ({ identityKey, identityGeneration }),
    isIdle: () => false,
    isLive: () => true,
    isBoundaryPending: () => false,
    getBoundaryFirstPage: () => null,
    getBoundaryError: () => null,
    setBoundaryError: () => {},
    getClient: () => ({
      onUpdate(_query, _args, onValue) {
        const subscription = {
          active: true,
          value: (value: PaginationResult<Row>) => onValue(value),
        }
        paginationSubscriptions.push(subscription)
        return () => {
          subscription.active = false
        }
      },
    }),
    fetchPage: async () => null,
    refreshBoundary: async () => {},
  })
  paginationController.start()
  paginationController.subscribeFirstPage()
  paginationSubscriptions[0]?.value(page(['page-a'], 'cursor-1'))
  paginationController.loadMore(1)
  paginationSubscriptions[1]?.value(page(['page-b'], '', true))

  const makeCallable = (operation: 'mutation' | 'action') =>
    createCallableController<{ value: string }, string>({
      operation,
      getIdentityGeneration: () => identityGeneration,
      subscribeIdentityChange(listener) {
        identityListeners.add(listener)
        return () => identityListeners.delete(listener)
      },
      handlers: {
        invoke: async (args) => `${operation}:${identityKey}:${args.value}`,
      },
    })
  const mutation = makeCallable('mutation')
  const action = makeCallable('action')

  const beforeIdentityChange = {
    query: queryController.transformedData()?.map((row) => row.id) ?? [],
    pagination: paginationController.results.value.map((row) => row.id),
    mutation: await mutation.run({ value: 'write' }),
    action: await action.run({ value: 'work' }),
  }

  const previousTag = { identityKey, identityGeneration }
  const previousBoundaryKey = `notes:${identityKey}`
  identityKey = 'user:bob'
  identityGeneration = 2
  for (const listener of [...identityListeners]) listener()
  const nextTag = { identityKey, identityGeneration }
  queryController.handleIdentityBoundary({ nextTag, previousTag, previousBoundaryKey })
  paginationController.handleIdentityBoundary({ nextTag, previousTag, previousBoundaryKey })

  const afterIdentityChange = {
    query: queryController.transformedData(),
    pagination: paginationController.results.value,
    mutationStatus: mutation.status.value,
    actionStatus: action.status.value,
  }

  const retiredQueryValue = captureQueryValue()
  queryController.dispose()
  queryController.dispose()
  paginationController.dispose()
  paginationController.dispose()
  mutation.dispose()
  mutation.dispose()
  action.dispose()
  action.dispose()
  retiredQueryValue?.([{ id: 'late' }])

  return {
    beforeIdentityChange,
    afterIdentityChange,
    afterDispose: {
      query: queryController.transformedData(),
      activeQuerySubscriptions: queryStops === 1 ? 0 : 1,
      activePaginationSubscriptions: paginationSubscriptions.filter(
        (subscription) => subscription.active,
      ).length,
      identityListeners: identityListeners.size,
    },
  }
}
