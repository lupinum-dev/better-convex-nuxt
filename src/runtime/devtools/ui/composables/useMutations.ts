import { ref, onMounted, onUnmounted } from 'vue'

import type { MutationEntry } from '../../types'
import { callBridge, getBridgeTransport, getBoundBridgeInstanceId } from './useBridge'

const mutations = ref<MutationEntry[]>([])
const expandedIds = ref<Set<string>>(new Set())

function mergeMutationsById(current: MutationEntry[], nextItems: MutationEntry[]): MutationEntry[] {
  const currentById = new Map(current.map((item) => [item.id, item]))
  return nextItems.map((incoming) => {
    const existing = currentById.get(incoming.id)
    if (!existing) return incoming
    Object.assign(existing, incoming)
    return existing
  })
}

/**
 * Composable for managing mutation data from the DevTools bridge.
 */
export function useMutations() {
  let cleanup: (() => void) | null = null

  onMounted(async () => {
    // Fetch initial data
    try {
      const initial = (await callBridge<MutationEntry[]>('getMutations')) || []
      mutations.value = mergeMutationsById(mutations.value, initial)
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
          mutations?: MutationEntry[]
          instanceId?: string | null
        }
        if (message.type === 'CONVEX_DEVTOOLS_MUTATIONS') {
          const boundInstanceId = getBoundBridgeInstanceId()
          if (boundInstanceId && message.instanceId !== boundInstanceId) return
          mutations.value = mergeMutationsById(mutations.value, message.mutations || [])
        }
      }
      transport.addEventListener('message', handler)
      cleanup = () => transport.removeEventListener('message', handler)
    }
  })

  onUnmounted(() => {
    cleanup?.()
  })

  function toggleExpanded(id: string) {
    const newSet = new Set(expandedIds.value)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    expandedIds.value = newSet
  }

  function isExpanded(id: string): boolean {
    return expandedIds.value.has(id)
  }

  return {
    mutations,
    expandedIds,
    toggleExpanded,
    isExpanded,
  }
}
