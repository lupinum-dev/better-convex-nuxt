import { ref, onMounted, onUnmounted } from 'vue'

import type { QueryRegistryEntry } from '../../query-registry'
import { callBridge, getBridgeTransport, getBoundBridgeInstanceId } from './useBridge'

const queries = ref<QueryRegistryEntry[]>([])
const selectedQueryId = ref<string | null>(null)

function mergeQueriesById(
  current: QueryRegistryEntry[],
  nextItems: QueryRegistryEntry[],
): QueryRegistryEntry[] {
  const currentById = new Map(current.map((item) => [item.id, item]))
  return nextItems.map((incoming) => {
    const existing = currentById.get(incoming.id)
    if (!existing) return incoming
    Object.assign(existing, incoming)
    return existing
  })
}

/**
 * Composable for managing query data from the DevTools bridge.
 */
export function useQueries() {
  let cleanup: (() => void) | null = null

  onMounted(async () => {
    // Fetch initial data
    try {
      const initial = (await callBridge<QueryRegistryEntry[]>('getQueries')) || []
      queries.value = mergeQueriesById(queries.value, initial)
    } catch {
      // Ignore initial fetch errors
    }

    // Listen for real-time updates
    const transport = getBridgeTransport()
    if (transport) {
      const handler = (event: { data: unknown }) => {
        const data = event.data
        if (!data || typeof data !== 'object') return
        const message = data as {
          type?: string
          queries?: QueryRegistryEntry[]
          instanceId?: string | null
        }
        if (message.type === 'CONVEX_DEVTOOLS_QUERIES') {
          const boundInstanceId = getBoundBridgeInstanceId()
          if (boundInstanceId && message.instanceId !== boundInstanceId) return
          queries.value = mergeQueriesById(queries.value, message.queries || [])
        }
      }
      transport.addEventListener('message', handler)
      cleanup = () => transport.removeEventListener('message', handler)
    }
  })

  onUnmounted(() => {
    cleanup?.()
  })

  function selectQuery(id: string | null) {
    selectedQueryId.value = id
  }

  function getSelectedQuery(): QueryRegistryEntry | undefined {
    if (!selectedQueryId.value) return undefined
    return queries.value.find((q) => q.id === selectedQueryId.value)
  }

  return {
    queries,
    selectedQueryId,
    selectQuery,
    getSelectedQuery,
  }
}
