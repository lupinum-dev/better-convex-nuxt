import type { ConvexDevtoolsStore } from './store'
import type { QueryRegistryEntry } from './types'

type QueryEntry = Omit<QueryRegistryEntry, 'lastUpdated' | 'updateCount'> & { updateCount?: number }
type QueryStatusUpdate = Partial<
  Pick<QueryRegistryEntry, 'status' | 'data' | 'error' | 'dataSource' | 'hasSubscription'>
>

let store: ConvexDevtoolsStore | null = null

/**
 * Called from plugin.client.ts after store creation to make it
 * available to composables without needing useNuxtApp().
 */
export function setDevtoolsStore(s: ConvexDevtoolsStore): void {
  store = s
}

export function warmQueryDevtools(): void {
  // No-op — store is eagerly created in plugin.client.ts
}

export function registerDevtoolsEntry(
  name: string,
  type: 'mutation' | 'action',
  args: unknown,
  hasOptimisticUpdate = false,
): string | null {
  if (!import.meta.dev || !store) return null

  return store.registerMutation({
    name,
    type,
    args,
    state: type === 'mutation' && hasOptimisticUpdate ? 'optimistic' : 'pending',
    hasOptimisticUpdate,
    startedAt: Date.now(),
  })
}

export function updateDevtoolsEntrySuccess(
  id: string | null,
  startTime: number,
  result: unknown,
): void {
  if (!import.meta.dev || !store || !id) return

  const settledAt = Date.now()
  store.updateMutationState(id, {
    state: 'success',
    result,
    settledAt,
    duration: settledAt - startTime,
  })
}

export function updateDevtoolsEntryError(
  id: string | null,
  startTime: number,
  error: string,
): void {
  if (!import.meta.dev || !store || !id) return

  const settledAt = Date.now()
  store.updateMutationState(id, {
    state: 'error',
    error,
    settledAt,
    duration: settledAt - startTime,
  })
}

export function registerDevtoolsQuery(entry: QueryEntry): void {
  if (!import.meta.dev || !store) return
  store.registerQuery(entry)
}

export function updateDevtoolsQuery(id: string, update: QueryStatusUpdate): void {
  if (!import.meta.dev || !store) return
  store.updateQueryStatus(id, update)
}

export function unregisterDevtoolsQuery(id: string): void {
  if (!import.meta.dev || !store) return
  store.unregisterQuery(id)
}
