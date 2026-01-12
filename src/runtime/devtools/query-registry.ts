/**
 * Query registry for DevTools integration.
 * Tracks active queries with metadata for visualization.
 */

export type QueryStatus = 'pending' | 'success' | 'error' | 'idle'
export type DataSource = 'ssr' | 'websocket' | 'cache'

export interface QueryOptions {
  /** Whether the query was configured with lazy: true */
  lazy: boolean
  /** Whether the query fetches on server (SSR) */
  server: boolean
  /** Whether the query has an active subscription */
  subscribe: boolean
  /** Whether the query is public (no auth required) */
  public: boolean
}

export interface QueryRegistryEntry {
  /** Unique identifier (cache key) */
  id: string
  /** Function name (e.g., "api.notes.list") */
  name: string
  /** Query arguments */
  args: unknown
  /** Current status */
  status: QueryStatus
  /** Where the data came from */
  dataSource: DataSource
  /** Current data value */
  data: unknown
  /** Error if status is 'error' */
  error?: string
  /** Last update timestamp */
  lastUpdated: number
  /** Whether the query has an active WebSocket subscription */
  hasSubscription: boolean
  /** Number of updates received via subscription */
  updateCount: number
  /** Query configuration options */
  options?: QueryOptions
}

// Registry storage
const queryRegistry = new Map<string, QueryRegistryEntry>()

// Subscribers for real-time updates
type RegistryCallback = (entries: QueryRegistryEntry[]) => void
const subscribers = new Set<RegistryCallback>()

function notifySubscribers(): void {
  const entries = getActiveQueries()
  for (const callback of subscribers) {
    try {
      callback(entries)
    } catch {
      // Ignore callback errors
    }
  }
}

/**
 * Register a new query or update an existing one.
 */
export function registerQuery(entry: Omit<QueryRegistryEntry, 'lastUpdated' | 'updateCount'> & { updateCount?: number }): void {
  const existing = queryRegistry.get(entry.id)
  queryRegistry.set(entry.id, {
    ...entry,
    lastUpdated: Date.now(),
    updateCount: entry.updateCount ?? existing?.updateCount ?? 0,
  })
  notifySubscribers()
}

/**
 * Update the status of an existing query.
 */
export function updateQueryStatus(
  id: string,
  update: Partial<Pick<QueryRegistryEntry, 'status' | 'data' | 'error' | 'dataSource' | 'hasSubscription'>>,
): void {
  const existing = queryRegistry.get(id)
  if (!existing) return

  queryRegistry.set(id, {
    ...existing,
    ...update,
    lastUpdated: Date.now(),
    updateCount: update.dataSource === 'websocket' ? existing.updateCount + 1 : existing.updateCount,
  })
  notifySubscribers()
}

/**
 * Remove a query from the registry (when unmounted).
 */
export function unregisterQuery(id: string): void {
  queryRegistry.delete(id)
  notifySubscribers()
}

/**
 * Get all active queries.
 */
export function getActiveQueries(): QueryRegistryEntry[] {
  return Array.from(queryRegistry.values())
}

/**
 * Get a specific query by ID.
 */
export function getQuery(id: string): QueryRegistryEntry | undefined {
  return queryRegistry.get(id)
}

/**
 * Subscribe to registry changes.
 * Returns an unsubscribe function.
 */
export function subscribeToQueries(callback: RegistryCallback): () => void {
  subscribers.add(callback)
  // Immediately call with current state
  callback(getActiveQueries())
  return () => {
    subscribers.delete(callback)
  }
}

/**
 * Clear all queries from the registry.
 */
export function clearRegistry(): void {
  queryRegistry.clear()
  notifySubscribers()
}

/**
 * Get the count of active queries.
 */
export function getQueryCount(): number {
  return queryRegistry.size
}
