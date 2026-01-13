import { ref, onMounted, onUnmounted } from 'vue'
import type { MutationEntry } from '../../types'
import { callBridge, getBroadcastChannel } from './useBridge'

const mutations = ref<MutationEntry[]>([])
const expandedIds = ref<Set<string>>(new Set())

/**
 * Composable for managing mutation data from the DevTools bridge.
 */
export function useMutations() {
  let cleanup: (() => void) | null = null

  onMounted(async () => {
    // Fetch initial data
    try {
      mutations.value = (await callBridge<MutationEntry[]>('getMutations')) || []
    } catch {
      // Ignore initial fetch errors
    }

    // Listen for real-time updates
    const channel = getBroadcastChannel()
    if (channel) {
      const handler = (event: MessageEvent) => {
        const data = event.data
        if (data?.type === 'CONVEX_DEVTOOLS_MUTATIONS') {
          mutations.value = data.mutations || []
        }
      }
      channel.addEventListener('message', handler)
      cleanup = () => channel.removeEventListener('message', handler)
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
