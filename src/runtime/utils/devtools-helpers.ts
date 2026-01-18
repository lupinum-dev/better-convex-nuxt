/**
 * DevTools helper utilities for mutation and action tracing.
 * Provides shared functions for registering and updating DevTools entries.
 */

// Lazy-loaded mutation registry module
let mutationRegistry: typeof import('../devtools/mutation-registry') | null = null

/**
 * Load the mutation registry module (lazy, cached).
 * Only loads in dev mode on client.
 */
function loadRegistry(): void {
  if (!import.meta.client || !import.meta.dev) {
    return
  }

  if (mutationRegistry) {
    return
  }

  import('../devtools/mutation-registry')
    .then((module) => {
      mutationRegistry = module
    })
    .catch(() => {
      // DevTools not available, ignore
    })
}

// Pre-load in dev mode
if (import.meta.client && import.meta.dev) {
  loadRegistry()
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
  if (!import.meta.dev || !mutationRegistry) {
    return null
  }

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
export function updateDevToolsSuccess(
  id: string | null,
  startTime: number,
  result: unknown,
): void {
  if (!import.meta.dev || !mutationRegistry || !id) {
    return
  }

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
export function updateDevToolsError(
  id: string | null,
  startTime: number,
  error: string,
): void {
  if (!import.meta.dev || !mutationRegistry || !id) {
    return
  }

  const settledAt = Date.now()
  mutationRegistry.updateMutationState(id, {
    state: 'error',
    error,
    settledAt,
    duration: settledAt - startTime,
  })
}

/**
 * Get the mutation registry (for direct access if needed).
 * Returns null if not available.
 */
export function getDevToolsRegistry(): typeof import('../devtools/mutation-registry') | null {
  return mutationRegistry
}
