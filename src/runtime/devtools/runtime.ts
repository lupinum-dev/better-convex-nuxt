import type { QueryRegistryEntry } from './query-registry'

type QueryEntry = Omit<QueryRegistryEntry, 'lastUpdated' | 'updateCount'> & { updateCount?: number }
type QueryStatusUpdate = Partial<
  Pick<QueryRegistryEntry, 'status' | 'data' | 'error' | 'dataSource' | 'hasSubscription'>
>

let mutationRegistry: typeof import('./mutation-registry') | null = null
let mutationRegistryAttempted = false

let queryRegistry: typeof import('./query-registry') | null = null
let queryRegistryAttempted = false

function loadMutationRegistry(): void {
  if (!import.meta.client || !import.meta.dev || mutationRegistryAttempted) return
  mutationRegistryAttempted = true
  import('./mutation-registry')
    .then((module) => {
      mutationRegistry = module
    })
    .catch((error) => {
      console.warn('[convex-devtools] Failed to load mutation registry:', error)
    })
}

function loadQueryRegistry(): void {
  if (!import.meta.client || !import.meta.dev || queryRegistryAttempted) return
  queryRegistryAttempted = true
  import('./query-registry')
    .then((module) => {
      queryRegistry = module
    })
    .catch((error) => {
      console.warn('[convex-devtools] Failed to load query registry:', error)
    })
}

export function warmQueryDevtools(): void {
  loadQueryRegistry()
}

export function registerDevtoolsEntry(
  name: string,
  type: 'mutation' | 'action',
  args: unknown,
  hasOptimisticUpdate = false,
): string | null {
  loadMutationRegistry()
  if (!import.meta.dev || !mutationRegistry) return null

  return mutationRegistry.registerMutation({
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
  if (!import.meta.dev || !mutationRegistry || !id) return

  const settledAt = Date.now()
  mutationRegistry.updateMutationState(id, {
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
  if (!import.meta.dev || !mutationRegistry || !id) return

  const settledAt = Date.now()
  mutationRegistry.updateMutationState(id, {
    state: 'error',
    error,
    settledAt,
    duration: settledAt - startTime,
  })
}

export function registerDevtoolsQuery(entry: QueryEntry): void {
  loadQueryRegistry()
  if (!import.meta.dev || !queryRegistry) return
  queryRegistry.registerQuery(entry)
}

export function updateDevtoolsQuery(id: string, update: QueryStatusUpdate): void {
  if (!import.meta.dev || !queryRegistry) return
  queryRegistry.updateQueryStatus(id, update)
}

export function unregisterDevtoolsQuery(id: string): void {
  if (!import.meta.dev || !queryRegistry) return
  queryRegistry.unregisterQuery(id)
}
