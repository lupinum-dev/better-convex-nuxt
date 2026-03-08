/**
 * DevTools helper utilities for mutation, action, and query tracing.
 * Provides shared functions for registering and updating DevTools entries.
 */

import type { QueryRegistryEntry } from '../devtools/query-registry'

// ============================================================================
// Mutation / Action registry (lazy-loaded)
// ============================================================================

let mutationRegistry: typeof import('../devtools/mutation-registry') | null = null
let mutationRegistryAttempted = false

function loadMutationRegistry(): void {
  if (!import.meta.client || !import.meta.dev || mutationRegistryAttempted) return
  mutationRegistryAttempted = true
  import('../devtools/mutation-registry')
    .then((module) => {
      mutationRegistry = module
    })
    .catch((error) => {
      console.warn('[devtools-helpers] Failed to load mutation registry:', error)
    })
}

/**
 * Register a mutation/action with DevTools.
 * Returns the entry ID or null if DevTools not available.
 */
export function registerDevToolsEntry(
  name: string,
  type: 'mutation' | 'action',
  args: unknown,
  hasOptimisticUpdate: boolean = false,
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

/**
 * Update DevTools entry on success.
 */
export function updateDevToolsSuccess(id: string | null, startTime: number, result: unknown): void {
  if (!import.meta.dev || !mutationRegistry || !id) return

  const settledAt = Date.now()
  mutationRegistry.updateMutationState(id, {
    state: 'success',
    result,
    settledAt,
    duration: settledAt - startTime,
  })
}

/**
 * Update DevTools entry on error.
 */
export function updateDevToolsError(id: string | null, startTime: number, error: string): void {
  if (!import.meta.dev || !mutationRegistry || !id) return

  const settledAt = Date.now()
  mutationRegistry.updateMutationState(id, {
    state: 'error',
    error,
    settledAt,
    duration: settledAt - startTime,
  })
}

// ============================================================================
// Query registry (lazy-loaded)
// ============================================================================

type QueryEntry = Omit<QueryRegistryEntry, 'lastUpdated' | 'updateCount'> & { updateCount?: number }
type QueryStatusUpdate = Partial<
  Pick<QueryRegistryEntry, 'status' | 'data' | 'error' | 'dataSource' | 'hasSubscription'>
>

let queryRegistry: typeof import('../devtools/query-registry') | null = null
let queryRegistryAttempted = false

function loadQueryRegistry(): void {
  if (!import.meta.client || !import.meta.dev || queryRegistryAttempted) return
  queryRegistryAttempted = true
  import('../devtools/query-registry')
    .then((module) => {
      queryRegistry = module
    })
    .catch((error) => {
      console.warn('[devtools-helpers] Failed to load query registry:', error)
    })
}

/** Trigger early load of the query registry. Call at composable setup time. */
export function loadQueryDevTools(): void {
  loadQueryRegistry()
}

export function registerDevToolsQuery(entry: QueryEntry): void {
  loadQueryRegistry()
  if (!import.meta.dev || !queryRegistry) return
  queryRegistry.registerQuery(entry)
}

export function updateDevToolsQueryStatus(id: string, update: QueryStatusUpdate): void {
  if (!import.meta.dev || !queryRegistry) return
  queryRegistry.updateQueryStatus(id, update)
}

export function unregisterDevToolsQuery(id: string): void {
  if (!import.meta.dev || !queryRegistry) return
  queryRegistry.unregisterQuery(id)
}
