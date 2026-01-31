/**
 * Mutation registry for DevTools integration.
 * Tracks in-flight and completed mutations with timeline data.
 * In-memory only, max 50 entries with LRU eviction.
 *
 * This module is client-only. Importing on the server will throw an error
 * to prevent SSR state leakage between requests.
 */
import type { MutationEntry } from './types'

// SSR safety guard: This registry uses module-level state that would leak between
// requests if used on the server. Throw early to catch misuse.
if (import.meta.server) {
  throw new Error(
    '[better-convex-nuxt] DevTools mutation-registry must not be imported on server. ' +
    'This would cause state leakage between SSR requests.',
  )
}

const MAX_ENTRIES = 50

// Registry storage (ordered by startedAt)
const mutationRegistry = new Map<string, MutationEntry>()

// Subscribers for real-time updates
type RegistryCallback = (entries: MutationEntry[]) => void
const subscribers = new Set<RegistryCallback>()

function notifySubscribers(): void {
  const entries = getMutations()
  for (const callback of subscribers) {
    try {
      callback(entries)
    } catch {
      // Ignore callback errors
    }
  }
}

/**
 * Evict oldest entries if over max.
 */
function evictIfNeeded(): void {
  if (mutationRegistry.size <= MAX_ENTRIES) return

  // Sort by startedAt and remove oldest
  const sorted = Array.from(mutationRegistry.entries())
    .sort((a, b) => a[1].startedAt - b[1].startedAt)

  const toRemove = sorted.slice(0, mutationRegistry.size - MAX_ENTRIES)
  for (const [id] of toRemove) {
    mutationRegistry.delete(id)
  }
}

/**
 * Generate a unique ID for a mutation entry.
 */
function generateId(): string {
  // Use crypto.randomUUID if available, otherwise fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for older environments
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Register a new mutation.
 * Called when mutation execution begins.
 */
export function registerMutation(entry: Omit<MutationEntry, 'id'>): string {
  const id = generateId()
  mutationRegistry.set(id, { id, ...entry })
  evictIfNeeded()
  notifySubscribers()
  return id
}

/**
 * Update mutation state.
 * Called when mutation transitions between states.
 */
export function updateMutationState(
  id: string,
  update: Partial<Pick<MutationEntry, 'state' | 'result' | 'error' | 'settledAt' | 'duration'>>,
): void {
  const existing = mutationRegistry.get(id)
  if (!existing) return

  mutationRegistry.set(id, { ...existing, ...update })
  notifySubscribers()
}

/**
 * Get all mutations, sorted by startedAt (newest first).
 */
export function getMutations(): MutationEntry[] {
  return Array.from(mutationRegistry.values())
    .sort((a, b) => b.startedAt - a.startedAt)
}

/**
 * Subscribe to mutation updates.
 * Returns an unsubscribe function.
 */
export function subscribeToMutations(callback: RegistryCallback): () => void {
  subscribers.add(callback)
  // Immediately call with current state
  callback(getMutations())
  return () => {
    subscribers.delete(callback)
  }
}
