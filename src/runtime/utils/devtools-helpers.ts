/**
 * DevTools helper utilities for mutation and action tracing.
 * Provides shared functions for registering and updating DevTools entries.
 */

// Lazy-loaded mutation registry module
let mutationRegistry: typeof import('../devtools/mutation-registry') | null = null
let mutationRegistryPromise: Promise<void> | null = null
let mutationRegistryLoadFailed = false

/**
 * Load the mutation registry module (on-demand, cached).
 * Only loads in dev mode on client.
 */
function loadRegistry(): void {
  if (!import.meta.client || !import.meta.dev) {
    return
  }

  if (mutationRegistry || mutationRegistryPromise || mutationRegistryLoadFailed) {
    return
  }

  mutationRegistryPromise = import('../devtools/mutation-registry')
    .then((module) => {
      mutationRegistry = module
    })
    .catch((error) => {
      mutationRegistryLoadFailed = true
      console.warn('[devtools-helpers] Failed to load mutation registry:', error)
    })
    .finally(() => {
      mutationRegistryPromise = null
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
  loadRegistry()
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
  loadRegistry()
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
  loadRegistry()
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
