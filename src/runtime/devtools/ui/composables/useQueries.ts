import { ref, onMounted, onUnmounted } from 'vue'
import type { QueryRegistryEntry } from '../../query-registry'
import { callBridge, getBroadcastChannel } from './useBridge'

const queries = ref<QueryRegistryEntry[]>([])
const selectedQueryId = ref<string | null>(null)

/**
 * Composable for managing query data from the DevTools bridge.
 */
export function useQueries() {
  let cleanup: (() => void) | null = null

  onMounted(async () => {
    // Fetch initial data
    try {
      queries.value = (await callBridge<QueryRegistryEntry[]>('getQueries')) || []
    } catch {
      // Ignore initial fetch errors
    }

    // Listen for real-time updates
    const channel = getBroadcastChannel()
    if (channel) {
      const handler = (event: MessageEvent) => {
        const data = event.data
        if (data?.type === 'CONVEX_DEVTOOLS_QUERIES') {
          queries.value = data.queries || []
        }
      }
      channel.addEventListener('message', handler)
      cleanup = () => channel.removeEventListener('message', handler)
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
    return queries.value.find(q => q.id === selectedQueryId.value)
  }

  return {
    queries,
    selectedQueryId,
    selectQuery,
    getSelectedQuery,
  }
}
