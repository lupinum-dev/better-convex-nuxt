import type { ConvexDevtoolsStore } from './store.js'
import type { DevtoolsEvent, QueryRegistryEntry } from './types.js'

type QueryEntry = Omit<QueryRegistryEntry, 'lastUpdated' | 'updateCount'> & { updateCount?: number }
type QueryStatusUpdate = Partial<
  Pick<QueryRegistryEntry, 'status' | 'data' | 'error' | 'dataSource' | 'hasSubscription'>
>
type DevtoolsEventInput = Omit<DevtoolsEvent, 'id' | 'timestamp'> & { timestamp?: number }

let store: ConvexDevtoolsStore | null = null

/**
 * Called from plugin.client.ts after store creation to make it
 * available to composables without needing useNuxtApp().
 */
export function setDevtoolsStore(s: ConvexDevtoolsStore): void {
  store = s
}

export function registerDevtoolsEntry(
  name: string,
  type: 'mutation' | 'action',
  args: unknown,
  hasOptimisticUpdate = false,
): string | null {
  if (!store) return null

  const id = store.registerMutation({
    name,
    type,
    args,
    state: type === 'mutation' && hasOptimisticUpdate ? 'optimistic' : 'pending',
    hasOptimisticUpdate,
    startedAt: Date.now(),
  })
  store.appendEvent({
    kind: type,
    phase: type === 'mutation' && hasOptimisticUpdate ? 'optimistic' : 'pending',
    operationId: id,
    name,
    args,
  })
  return id
}

export function updateDevtoolsEntrySuccess(
  id: string | null,
  startTime: number,
  result: unknown,
): void {
  if (!store || !id) return

  const settledAt = Date.now()
  store.updateMutationState(id, {
    state: 'success',
    result,
    settledAt,
    duration: settledAt - startTime,
  })
  const existing = store.mutations.get(id)
  if (!existing) return
  store.appendEvent({
    kind: existing.type,
    phase: 'success',
    operationId: id,
    name: existing.name,
    args: existing.args,
    payload: result,
    duration: settledAt - startTime,
  })
}

export function updateDevtoolsEntryError(
  id: string | null,
  startTime: number,
  error: string,
): void {
  if (!store || !id) return

  const settledAt = Date.now()
  store.updateMutationState(id, {
    state: 'error',
    error,
    settledAt,
    duration: settledAt - startTime,
  })
  const existing = store.mutations.get(id)
  if (!existing) return
  store.appendEvent({
    kind: existing.type,
    phase: 'error',
    operationId: id,
    name: existing.name,
    args: existing.args,
    error,
    duration: settledAt - startTime,
  })
}

export function registerDevtoolsQuery(entry: QueryEntry): void {
  if (!store) return
  store.registerQuery(entry)
  store.appendEvent({
    kind: 'query',
    phase: 'subscribe',
    operationId: entry.id,
    name: entry.name,
    args: entry.args,
    dataSource: entry.dataSource,
    meta: entry.options
      ? {
          immediate: entry.options.immediate,
          server: entry.options.server,
          subscribe: entry.options.subscribe,
          auth: entry.options.auth,
        }
      : undefined,
  })
}

export function updateDevtoolsQuery(id: string, update: QueryStatusUpdate): void {
  if (!store) return
  const existing = store.queries.get(id)
  store.updateQueryStatus(id, update)
  const next = store.queries.get(id)
  if (!existing || !next) return

  const phase =
    update.status === 'error'
      ? 'error'
      : update.dataSource === 'websocket' && Object.hasOwn(update, 'data')
        ? 'update'
        : update.status === 'success'
          ? 'success'
          : 'update'

  store.appendEvent({
    kind: 'query',
    phase,
    operationId: id,
    name: next.name,
    args: next.args,
    payload: Object.hasOwn(update, 'data') ? update.data : undefined,
    error: update.error,
    dataSource: update.dataSource ?? next.dataSource,
  })
}

export function unregisterDevtoolsQuery(id: string): void {
  if (!store) return
  const existing = store.queries.get(id)
  store.unregisterQuery(id)
  if (!existing) return
  store.appendEvent({
    kind: 'query',
    phase: 'unsubscribe',
    operationId: id,
    name: existing.name,
    args: existing.args,
    dataSource: existing.dataSource,
  })
}

export function appendDevtoolsEvent(event: DevtoolsEventInput): void {
  if (!store) return
  store.appendEvent(event)
}
