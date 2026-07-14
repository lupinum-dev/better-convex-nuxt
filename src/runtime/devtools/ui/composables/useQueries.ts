import { ref, onMounted, onUnmounted, watch } from 'vue'

import type { QueryRegistryEntry } from '../../types'
import type { DevtoolsBridgeController } from './useBridge'

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
export function useQueries(bridge: DevtoolsBridgeController) {
  const queries = ref<QueryRegistryEntry[]>([])
  const selectedQueryId = ref<string | null>(null)
  let cleanup: (() => void) | null = null

  const refresh = async () => {
    if (!bridge.boundInstanceId.value) return
    try {
      const initial = (await bridge.call<QueryRegistryEntry[]>('getQueries')) || []
      queries.value = mergeQueriesById(queries.value, initial)
    } catch {
      // Ignore initial fetch errors
    }
  }

  onMounted(() => {
    const transport = bridge.getTransport()
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
          if (message.instanceId !== bridge.boundInstanceId.value) return
          queries.value = mergeQueriesById(queries.value, message.queries || [])
        }
      }
      transport.addEventListener('message', handler)
      cleanup = () => transport.removeEventListener('message', handler)
    }
  })

  watch(
    bridge.boundInstanceId,
    () => {
      queries.value = []
      selectedQueryId.value = null
      void refresh()
    },
    { flush: 'post' },
  )

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
